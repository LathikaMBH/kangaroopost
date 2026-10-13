import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InfoWindow } from '@vis.gl/react-google-maps';
import MapCanvas, { MapFollow, CircleMarker, DotMarker, RouteLine, RadiusCircle } from '../../components/GoogleMapView';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { getDistance, PROXIMITY_METRES } from '../../services/gps';
import useRoadPath from '../../services/useRoadPath';
import { MODE_WARNING } from '../../services/roads';
import { useApproachPath } from '../../services/useDirections';




const S={IDLE:'idle',RUNNING:'running',PAUSED:'paused',DONE:'done'};
// the next stop is the first one in the saved order that is neither delivered nor missed (KAN-28)
const firstOpen=(list,d,m)=>{const i=list.findIndex(s=>!d.has(s.id)&&!m.has(s.id));return i<0?list.length:i;};
// "Mailboxes 4, 5 missed" (numbers are the stop numbers in the saved order)
const missedText=(list,ids)=>{const ms=list.map((s,i)=>({...s,n:i+1})).filter(s=>ids.includes(s.id));const t=new Set(ms.map(s=>s.type));const word=t.size>1?'Stop':t.has('apartment')?'Apartment':'Mailbox';return `${ms.length>1?(word==='Mailbox'?'Mailboxes':word+'s'):word} ${ms.map(s=>s.n).join(', ')} missed`;};

export default function RiderNavigate(){
  const{routeId}=useParams();const navigate=useNavigate();const{user}=useAuth();const socket=useSocket();
  const[route,setRoute]=useState(null);const[stops,setStops]=useState([]);
  const[status,setStatus]=useState(S.IDLE);const[riderPos,setRiderPos]=useState(null);
  const[delivered,setDelivered]=useState(new Set());const[missed,setMissed]=useState(new Set());   // stop ids (missed = passed without delivering, KAN-28)
  const[aptId,setAptId]=useState(null);const[toast,setToast]=useState(null);   // aptId: the apartment the rider reached, waiting for Delivered
  const[reachedLast,setReachedLast]=useState(false);const[summary,setSummary]=useState(null);   // the rider got to the last stop; final progress after completing
  const[openId,setOpenId]=useState(null);
  const[savedPath,setSavedPath]=useState(null);
  const[mapMax,setMapMax]=useState(false);   // map fills the whole screen
  const[askStart,setAskStart]=useState(false);const[starting,setStarting]=useState(false);const[now,setNow]=useState(()=>new Date());   // start-route confirmation (KAN-4)
  const watchRef=useRef(null);const pingRef=useRef(null);const processingRef=useRef(false);const pausedRef=useRef(false);const stopsRef=useRef([]);const progRef=useRef({delivered:new Set(),missed:new Set()});
  const setProg=(d,m)=>{progRef.current={delivered:d,missed:m};setDelivered(d);setMissed(m);};   // the GPS callback reads the ref, the screen the state

  useEffect(()=>{
    let alive=true;
    api.getRoute(routeId).then(r=>{
      if(!alive)return;
      const list=r.stops||[];
      setRoute(r);setStops(list);setSavedPath(r.road_path||null);stopsRef.current=list;
      // the server keeps the run (route status + delivered stops), so a refresh or coming back to this page picks it up where it was
      if(r.status==='ongoing'||r.status==='paused'){
        setProg(new Set(list.filter(s=>s.delivered).map(s=>s.id)),new Set(list.filter(s=>s.missed&&!s.delivered).map(s=>s.id)));
        startGPS();
        if(r.status==='paused'){pausedRef.current=true;setStatus(S.PAUSED);}else setStatus(S.RUNNING);
      }
    });
    if(socket)socket.emit('join:route',routeId);
    return()=>{alive=false;stopGPS();};
  },[routeId]);

  const nextIdx=firstOpen(stops,delivered,missed);
  const canComplete=status===S.RUNNING&&stops.length>0&&(reachedLast||nextIdx>=stops.length);   // KAN-28: the last stop was delivered or reached
  // leave the full-screen map when the rider has to act on the controls below it (apartment delivery, complete, route done)
  useEffect(()=>{if(aptId||canComplete||status===S.DONE)setMapMax(false);},[aptId,canComplete,status]);
  // keep the date and time in the start confirmation current while it is open
  useEffect(()=>{if(!askStart)return;setNow(new Date());const t=setInterval(()=>setNow(new Date()),1000);const onKey=e=>{if(e.key==='Escape')setAskStart(false);};window.addEventListener('keydown',onKey);return()=>{clearInterval(t);window.removeEventListener('keydown',onKey);};},[askStart]);
  useEffect(()=>{if(!mapMax)return;const onKey=e=>{if(e.key==='Escape')setMapMax(false);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[mapMax]);

  const road=useRoadPath({routeId,stops,saved:savedPath,canSave:true});   // roads between the stops (saved path, or asked from Google once)
  const toFirst=nextIdx===0&&status!==S.IDLE&&status!==S.DONE?stops[0]:null;
  const approach=useApproachPath(riderPos,toFirst);   // road from the rider to the 1st stop, until it is delivered

  const showToast=(msg,type='mailbox')=>{const key=Date.now();setToast({msg,type,key});setTimeout(()=>setToast(t=>t?.key===key?null:t),3000);};

  // Deliver a stop (also a missed one, late). missedMsg: stops just marked missed, shown instead of the delivered message.
  const deliverNow=async(stop,method,missedMsg)=>{
    await api.deliverStop(stop.id,method);
    const d=new Set(progRef.current.delivered).add(stop.id),m=new Set(progRef.current.missed);m.delete(stop.id);setProg(d,m);
    setAptId(a=>a===stop.id?null:a);
    if(missedMsg)showToast(missedMsg,'missed');else showToast(method==='auto'?`📬 Auto-delivered: ${stop.address}`:`🏢 Delivered: ${stop.address}`,stop.type);
  };
  const markDelivered=useCallback(async(stop,method)=>{   // the apartment Delivered button
    if(processingRef.current)return;processingRef.current=true;
    try{await deliverNow(stop,method);}catch(e){showToast(e?.error||'Could not save the delivery','missed');}
    finally{processingRef.current=false;}
  },[]);

  // The rider is within 20 m of `stop`, the next stop or a later one. Earlier stops that are not delivered become missed
  // (only a later stop being reached does that, never distance alone). A mailbox is then delivered, an apartment waits for Delivered.
  const reachStop=async(stop,later)=>{
    processingRef.current=true;
    try{
      let msg='';
      if(later){
        const{missed:passed=[]}=await api.reachedStop(stop.id);   // the server refuses while paused and never marks a delivered stop
        const ids=passed.map(s=>s.id).filter(id=>!progRef.current.delivered.has(id));
        if(ids.length){setProg(progRef.current.delivered,new Set([...progRef.current.missed,...ids]));msg=missedText(stopsRef.current,ids);}
      }
      const list=stopsRef.current;if(list[list.length-1]?.id===stop.id)setReachedLast(true);
      if(stop.type==='mailbox'){setAptId(null);await deliverNow(stop,'auto',msg);}
      else{setAptId(stop.id);if(msg)showToast(msg,'missed');}
    }catch{/* offline or paused meanwhile: the next GPS fix tries again */}
    finally{processingRef.current=false;}
  };

  const startGPS=()=>{
    pausedRef.current=false;
    if(!navigator.geolocation)return alert('Geolocation not supported');
    watchRef.current=navigator.geolocation.watchPosition(pos=>{
      if(pausedRef.current)return;
      const p=[pos.coords.latitude,pos.coords.longitude];setRiderPos(p);
      if(processingRef.current)return;
      const list=stopsRef.current,{delivered:d,missed:m}=progRef.current;
      const near=s=>getDistance(p[0],p[1],s.lat,s.lng)<=PROXIMITY_METRES;
      const cur=firstOpen(list,d,m);
      // the next stop, or a later one in the saved order (the first of them in reach)
      const j=list.findIndex((s,i)=>i>=cur&&!d.has(s.id)&&!m.has(s.id)&&near(s));
      if(j>=0){reachStop(list[j],j>cur);return;}
      // a missed stop can still be delivered: a mailbox in reach is delivered, an apartment asks for Delivered
      const late=list.find(s=>m.has(s.id)&&!d.has(s.id)&&near(s));
      if(late){if(late.type==='mailbox'){processingRef.current=true;deliverNow(late,'auto').catch(()=>{}).finally(()=>{processingRef.current=false;});}else setAptId(late.id);}
      else setAptId(a=>m.has(a)?null:a);   // left a missed apartment without delivering: back to the next stop
    },err=>console.warn('GPS:',err),{enableHighAccuracy:true,maximumAge:2000});
    pingRef.current=setInterval(()=>{if(pausedRef.current)return;navigator.geolocation?.getCurrentPosition(pos=>api.pingLocation({routeId,lat:pos.coords.latitude,lng:pos.coords.longitude}).catch(()=>{}));},10000);
  };

  const stopGPS=()=>{if(watchRef.current){navigator.geolocation?.clearWatch(watchRef.current);watchRef.current=null;}if(pingRef.current){clearInterval(pingRef.current);pingRef.current=null;}};

  const handleStart=()=>setAskStart(true);   // the rider confirms the date and start time first
  const confirmStart=async()=>{if(starting)return;setStarting(true);try{await api.startRoute(routeId);}catch(e){alert(e?.error||'Could not start the route');return;}finally{setStarting(false);}setAskStart(false);setStatus(S.RUNNING);setProg(new Set(),new Set());setAptId(null);setReachedLast(false);setSummary(null);startGPS();};
  const handlePause=async()=>{pausedRef.current=true;await api.pauseRoute(routeId);setStatus(S.PAUSED);showToast('⏸ Route paused — GPS stopped','info');};
  const handleRestart=async()=>{await api.resumeRoute(routeId);setStatus(S.RUNNING);pausedRef.current=false;showToast('▶ Tracking resumed!','mailbox');};
  const handleExit=()=>navigate('/rider');   // only leaves the page: the run stays on the server and is picked up again on return
  // KAN-28: the rider finishes the route (missed or undelivered stops allowed) and sees how far it got
  const handleComplete=async()=>{const left=stops.length-delivered.size;if(left&&!confirm(`Complete this route? ${left} stop${left===1?' is':'s are'} not delivered.`))return;let res;try{res=await api.completeRoute(routeId);}catch(e){alert(e?.error||'Could not complete the route');return;}stopGPS();setAptId(null);setSummary(res.progress);setStatus(S.DONE);};
  const handleEnd=async()=>{const left=stops.length-delivered.size;if(!confirm(`End this route now?${left?` ${left} stop${left===1?' is':'s are'} not delivered yet.`:''} The route will be marked completed.`))return;stopGPS();try{await api.endRoute(routeId);}catch(e){alert(e?.error||'Could not end the route');return;}navigate('/rider');};

  if(!route)return<div className="spinner" style={{marginTop:80}}/>;
  const totalStops=stops.length,doneCount=delivered.size,pct=totalStops?Math.round(doneCount/totalStops*100):0;
  const nextStop=stops[nextIdx],aptStop=stops.find(s=>s.id===aptId),aptMissed=aptStop&&missed.has(aptStop.id);
  const straight=(a,b)=>stops.slice(a,b).map(s=>[s.lat,s.lng]);
  const doneLine=road.legs?road.legs.slice(0,nextIdx).flat():straight(0,nextIdx+1);
  const remLine=road.legs?road.legs.slice(nextIdx).flat():straight(nextIdx);
  const isPaused=status===S.PAUSED;
  const openStop=stops.find(s=>s.id===openId);

  const startDialog=askStart&&(
    <div onClick={()=>!starting&&setAskStart(false)} style={{position:'fixed',inset:0,zIndex:3000,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px 16px'}}>
      <div role="dialog" aria-modal="true" aria-labelledby="start-title" onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:360,background:'var(--card)',borderRadius:20,padding:'22px 20px 18px',boxShadow:'0 10px 30px rgba(0,0,0,0.3)',textAlign:'center'}}>
        <i className="ti ti-player-play" style={{fontSize:36,color:'var(--grn)'}}/>
        <h3 id="start-title" style={{margin:'6px 0 2px'}}>Start Route</h3>
        <div style={{color:'var(--pl)',fontSize:13,fontWeight:600}}>{route.name}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,margin:'16px 0'}}>
          <div className="stat-card"><i className="ti ti-calendar" style={{fontSize:20,color:'var(--grn)'}}/><div style={{color:'var(--mut)',fontSize:11,marginTop:4}}>Date</div><div style={{fontSize:14,fontWeight:700}}>{now.toLocaleDateString('en-FI',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</div></div>
          <div className="stat-card"><i className="ti ti-clock" style={{fontSize:20,color:'var(--grn)'}}/><div style={{color:'var(--mut)',fontSize:11,marginTop:4}}>Start time</div><div style={{fontSize:14,fontWeight:700}}>{now.toLocaleTimeString('en-FI',{hour:'2-digit',minute:'2-digit'})}</div></div>
        </div>
        <button className="btn btn-green" disabled={starting} onClick={confirmStart}><i className="ti ti-check" style={{fontSize:18}}/> {starting?'Starting…':'Confirm'}</button>
        <button className="btn btn-ghost" style={{width:'100%',marginTop:8}} disabled={starting} onClick={()=>setAskStart(false)}>Cancel</button>
      </div>
    </div>
  );

  const sum=summary||{delivered:doneCount,total:totalStops,pct,missed:stops.map((s,i)=>missed.has(s.id)?i+1:null).filter(Boolean)};
  if(status===S.DONE)return(
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 24px 60px',textAlign:'center'}}>
      <i className="ti ti-circle-check" style={{fontSize:90,color:'var(--grn)',marginBottom:16}}/>
      <h2>Route Complete!</h2>
      <p data-testid="route-summary" style={{marginTop:8}}>Route complete: {sum.pct}% delivered ({sum.delivered} of {sum.total}).{sum.missed.length>0&&<> Missed: {sum.missed.join(', ')}</>}</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,margin:'28px 0',width:'100%'}}>
        {[['ti-mailbox','Total',sum.total,'var(--grn)'],['ti-check','Delivered',sum.delivered,'var(--grn)'],['ti-alert-circle','Missed',sum.missed.length,sum.missed.length?'var(--red)':'var(--grn)']].map(([ic,l,v,c])=>(
          <div key={l} className="stat-card"><i className={`ti ${ic}`} style={{fontSize:22,color:c,display:'block',marginBottom:6}}/><div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div><div style={{color:'var(--mut)',fontSize:11}}>{l}</div></div>
        ))}
      </div>
      <button className="btn btn-green" style={{marginBottom:10}} onClick={handleStart}><i className="ti ti-refresh" style={{fontSize:18}}/> Start Again</button>
      <button className="btn btn-primary" onClick={()=>navigate('/rider')}>Back to Dashboard</button>
      {startDialog}
    </div>
  );

  return(
    <div className="screen-full">
      <div style={{padding:'48px 22px 8px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <button className="btn btn-ghost btn-sm" onClick={handleExit}>← Exit</button>
        <div style={{textAlign:'center'}}>
          <div style={{color:'var(--pl)',fontSize:12,fontWeight:600}}>{route.name}</div>
          <div style={{fontSize:13,fontWeight:700}}>
            {status===S.IDLE&&'Ready to start'}
            {status===S.RUNNING&&`Stop ${Math.min(nextIdx+1,totalStops)} / ${totalStops}`}
            {status===S.PAUSED&&<span style={{color:'var(--apt)'}}>⏸ Paused</span>}
          </div>
        </div>
        <div style={{background:'var(--grn-tint)',borderRadius:12,padding:'6px 10px',color:isPaused?'var(--apt)':'var(--grn)',fontSize:12,fontWeight:700}}>{pct}%</div>
      </div>

      <div style={{margin:'0 22px 8px',height:4,background:'var(--el)',borderRadius:2,flexShrink:0}}>
        <div style={{height:'100%',width:`${pct}%`,background:isPaused?'var(--apt)':'var(--grn)',borderRadius:2,transition:'width 0.5s'}}/>
      </div>

      <div style={mapMax?{position:'absolute',inset:0,zIndex:1500,background:'var(--bg)',overflow:'hidden'}:{flex:'0 0 42%',margin:'0 22px',borderRadius:16,overflow:'hidden',border:`2px solid ${isPaused?'#B5720A88':'#C8C4BC'}`,flexShrink:0,position:'relative'}}>
        <MapCanvas center={riderPos||[stops[0]?.lat||61.1282,stops[0]?.lng||21.5117]} zoom={16}>
          <MapFollow pos={riderPos} follow={status===S.RUNNING}/>
          <RouteLine path={doneLine} color="#1C9A54" weight={5} opacity={0.85}/>
          <RouteLine path={remLine} color="#4285F4" weight={road.legs?4:3} opacity={road.legs?0.6:0.3} dashed={!road.legs}/>
          {status===S.RUNNING&&approach.path&&<RouteLine path={approach.path} color="#4285F4" weight={approach.status==='ready'?5:3} opacity={approach.status==='ready'?0.85:0.5} dashed={approach.status!=='ready'}/>}
          {nextStop&&status===S.RUNNING&&!aptStop&&nextStop.type==='mailbox'&&<RadiusCircle center={[nextStop.lat,nextStop.lng]} radius={PROXIMITY_METRES} color="#4285F4"/>}
          {stops.map((s,i)=>{const isDone=delivered.has(s.id);const isMissed=!isDone&&missed.has(s.id)&&status!==S.IDLE;const isCurr=i===nextIdx&&status!==S.IDLE;const color=isDone?'#1C9A54':isMissed?'#C23438':isCurr?(s.type==='apartment'?'#B5720A':'#4285F4'):'#888';return<CircleMarker key={s.id} position={[s.lat,s.lng]} color={color} label={isDone?'✓':i+1} size={isCurr?36:28} onClick={()=>setOpenId(s.id)}/>;})}
          {openStop&&<InfoWindow position={{lat:openStop.lat,lng:openStop.lng}} pixelOffset={[0,-18]} onCloseClick={()=>setOpenId(null)}><div style={{color:'#222',fontSize:13}}>{openStop.address}<br/><small>{openStop.type}</small></div></InfoWindow>}
          {riderPos&&<DotMarker position={riderPos} size={24}/>}
        </MapCanvas>
        <button className="btn btn-ghost btn-sm" onClick={()=>setMapMax(m=>!m)} title={mapMax?'Exit full screen':'Full screen map'} aria-label={mapMax?'Exit full screen map':'Maximize the map'}
          style={{position:'absolute',top:mapMax?'calc(12px + var(--safe-top))':10,right:10,zIndex:1100,width:40,height:40,padding:0,borderRadius:12,background:'var(--card)',color:'var(--tx)',boxShadow:'0 2px 8px rgba(0,0,0,0.25)'}}>
          <i className={`ti ti-${mapMax?'arrows-minimize':'arrows-maximize'}`} style={{fontSize:20}}/>
        </button>
        {mapMax&&status===S.RUNNING&&nextStop&&<div style={{position:'absolute',left:12,right:12,bottom:'calc(34px + var(--safe-bot))',zIndex:1100,background:'var(--card)',borderRadius:14,padding:'10px 12px',border:'1.5px solid #4285F444',boxShadow:'0 4px 14px rgba(0,0,0,0.2)',display:'flex',alignItems:'center',gap:10}}>
          <i className={`ti ti-${nextStop.type==='apartment'?'building':'navigation'}`} style={{fontSize:18,color:nextStop.type==='apartment'?'var(--apt)':'#4285F4',flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:'var(--mut)',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Stop {Math.min(nextIdx+1,totalStops)} / {totalStops} · {pct}%</div>
            <div style={{fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nextStop.address}</div>
          </div>
        </div>}
        {isPaused&&<div style={{position:'absolute',inset:0,background:'rgba(255,255,255,0.85)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:1000}}><i className="ti ti-player-pause" style={{fontSize:48,color:'var(--apt)',marginBottom:8}}/><div style={{color:'var(--apt)',fontWeight:700,fontSize:16}}>GPS Paused</div><div style={{color:'var(--mut)',fontSize:12,marginTop:4}}>Map tracking stopped</div></div>}
      </div>

      {status!==S.IDLE&&<div style={{display:'flex',gap:8,padding:'8px 22px 0',flexShrink:0}}>
        {[['#1C9A54','Done',doneCount],['var(--red)','Missed',missed.size],['var(--pl)','Left',totalStops-doneCount],['#4285F4','Auto',Array.from(delivered).filter(id=>stops.find(s=>s.id===id)?.type==='mailbox').length],['var(--apt)','Apt',Array.from(delivered).filter(id=>stops.find(s=>s.id===id)?.type==='apartment').length]].map(([c,l,v])=>(
          <div key={l} style={{flex:1,background:'var(--card)',borderRadius:12,padding:'8px 6px',border:'1px solid var(--border)',textAlign:'center'}}>
            <div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:10,color:'var(--mut)'}}>{l}</div>
          </div>
        ))}
      </div>}

      <div style={{padding:'8px 22px 0',flexShrink:0}}>
        {status===S.IDLE&&<button className="btn btn-green" style={{fontSize:16}} onClick={handleStart}><i className="ti ti-player-play" style={{fontSize:20}}/> Start Route</button>}

        {canComplete&&<button className="btn btn-green" style={{fontSize:16,marginBottom:10}} onClick={handleComplete}><i className="ti ti-flag-check" style={{fontSize:20}}/> Complete route</button>}

        {status===S.RUNNING&&!aptStop&&nextStop&&<div style={{background:'var(--card)',borderRadius:18,padding:'12px 14px',border:'1.5px solid #4285F444',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:12,background:nextStop.type==='apartment'?'#B5720A22':'#4285F422',border:`1.5px solid ${nextStop.type==='apartment'?'#B5720A44':'#4285F444'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <i className={`ti ti-${nextStop.type==='apartment'?'building':'navigation'}`} style={{fontSize:18,color:nextStop.type==='apartment'?'var(--apt)':'#4285F4'}}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:'var(--mut)',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{nextStop.type==='apartment'?'Apartment — tap when inside':'Auto-detects within 20m'}</div>
                <div style={{fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nextStop.address}</div>
              </div>
              <span className={`badge badge-${nextStop.type}`}><i className={`ti ti-${nextStop.type==='mailbox'?'mailbox':'building'}`} style={{fontSize:10}}/></span>
            </div>
          </div>}

        {status===S.RUNNING&&!aptStop&&<button className="btn" style={{width:'100%',background:'var(--amber-tint)',border:'1.5px solid #B5720A55',color:'var(--apt)',fontSize:14,fontWeight:600}} onClick={handlePause}>
            <i className="ti ti-player-pause" style={{fontSize:18}}/> Pause Route
          </button>}

        {status===S.RUNNING&&aptStop&&<div style={{background:'var(--card)',borderRadius:20,padding:16,border:`2px solid ${aptMissed?'var(--red)':'var(--apt)'}`}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
            <div style={{width:44,height:44,borderRadius:14,background:'#B5720A22',border:'1.5px solid #B5720A55',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i className="ti ti-building" style={{fontSize:24,color:'var(--apt)'}}/>
            </div>
            <div><div style={{color:aptMissed?'var(--red)':'var(--apt)',fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{aptMissed?'Missed apartment — deliver inside':'Apartment — deliver inside'}</div><div style={{fontSize:15,fontWeight:700}}>{aptStop.address}</div></div>
          </div>
          <button className="btn btn-apt" onClick={()=>markDelivered(aptStop,'manual')}><i className="ti ti-check" style={{fontSize:22}}/> Delivered</button>
        </div>}

        {status===S.PAUSED&&<div>
          <div style={{background:'var(--amber-tint)',borderRadius:16,padding:'12px 16px',marginBottom:10,border:'1px solid #B5720A44',display:'flex',alignItems:'center',gap:12}}>
            <i className="ti ti-player-pause" style={{fontSize:24,color:'var(--apt)',flexShrink:0}}/>
            <div><div style={{color:'var(--apt)',fontWeight:600,fontSize:14}}>Route paused</div><div style={{color:'var(--mut)',fontSize:12}}>GPS stopped · {doneCount}/{totalStops} delivered</div></div>
          </div>
          <button className="btn btn-green" onClick={handleRestart}><i className="ti ti-player-play" style={{fontSize:20}}/> Restart Tracking</button>
          <button className="btn btn-danger" style={{width:'100%',marginTop:8,fontSize:14}} onClick={handleEnd}><i className="ti ti-flag-check" style={{fontSize:18}}/> End Route</button>
        </div>}
      </div>

      <div style={{margin:'8px 22px 0',background:'var(--el)',borderRadius:12,padding:'8px 14px',border:'1px solid var(--border)',display:'flex',alignItems:'center',gap:9,flexShrink:0,fontSize:11,color:'var(--mut)'}}>
        <i className="ti ti-info-circle" style={{fontSize:15,color:'var(--pl)',flexShrink:0}}/>
        <span>{isPaused?'Press Restart to resume GPS and continue tracking':<><strong style={{color:'var(--grn)'}}>Mailboxes</strong> auto {PROXIMITY_METRES}m · <strong style={{color:'var(--apt)'}}>Apartments</strong> tap</>}</span>
      </div>

      {(road.legs||approach.status==='ready')&&MODE_WARNING&&<div style={{margin:'6px 22px 0',fontSize:10,lineHeight:1.4,color:'var(--mut)',flexShrink:0}}>{MODE_WARNING}</div>}

      {startDialog}
      {toast&&<div key={toast.key} className={`toast${toast.type==='apartment'||toast.type==='info'?' apt':toast.type==='missed'?' miss':''}`}>{toast.msg}</div>}
    </div>
  );
}
