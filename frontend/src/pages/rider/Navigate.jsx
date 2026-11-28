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
import { createHeading, pickMailbox, nearApartment } from '../../services/anyOrder';




const S={IDLE:'idle',RUNNING:'running',PAUSED:'paused',DONE:'done'};

export default function RiderNavigate(){
  const{routeId}=useParams();const navigate=useNavigate();const{user}=useAuth();const socket=useSocket();
  const[route,setRoute]=useState(null);const[stops,setStops]=useState([]);
  const[status,setStatus]=useState(S.IDLE);const[riderPos,setRiderPos]=useState(null);
  const[nextIdx,setNextIdx]=useState(0);const[delivered,setDelivered]=useState(new Set());
  const[waitingApt,setWaitingApt]=useState(false);const[toast,setToast]=useState(null);
  const[openId,setOpenId]=useState(null);
  const[savedPath,setSavedPath]=useState(null);
  const[mapMax,setMapMax]=useState(false);   // map fills the whole screen
  const[askStart,setAskStart]=useState(false);const[starting,setStarting]=useState(false);const[now,setNow]=useState(()=>new Date());   // start-route confirmation (KAN-4)
  const watchRef=useRef(null);const pingRef=useRef(null);const processingRef=useRef(false);const pausedRef=useRef(false);const stopsRef=useRef([]);
  // KAN-55: deliver in any order. The GPS callback reads the current state through refs.
  const[anyOrder,setAnyOrder]=useState(false);const[startAny,setStartAny]=useState(false);const[aptNear,setAptNear]=useState(null);const[undo,setUndo]=useState(null);
  const anyOrderRef=useRef(false);const deliveredRef=useRef(new Set());const nextIdxRef=useRef(0);const headingRef=useRef(createHeading());
  const pendingRef=useRef({id:null,count:0});   // a box must be picked on 2 GPS updates in a row before it is marked
  const undoneRef=useRef(new Set());            // boxes the rider undid: not marked again until they have left them
  const undoTimer=useRef(null);
  const setNext=i=>{nextIdxRef.current=i;setNextIdx(i);};
  const setDone=set=>{deliveredRef.current=set;setDelivered(set);};
  const firstLeft=set=>{const i=stopsRef.current.findIndex(s=>!set.has(s.id));return i<0?stopsRef.current.length:i;};
  const reloadStops=()=>api.getRoute(routeId).then(r=>{const list=r.stops||[];stopsRef.current=list;setStops(list);}).catch(()=>{});   // with the boxes' sides of the road
  const applyMode=on=>{anyOrderRef.current=on;setAnyOrder(on);pendingRef.current={id:null,count:0};setWaitingApt(false);setAptNear(null);setNext(firstLeft(deliveredRef.current));};

  useEffect(()=>{
    let alive=true;
    api.getRoute(routeId).then(r=>{
      if(!alive)return;
      const list=r.stops||[];
      setRoute(r);setStops(list);setSavedPath(r.road_path||null);stopsRef.current=list;
      // the server keeps the run (route status + delivered stops), so a refresh or coming back to this page picks it up where it was
      if(r.status==='ongoing'||r.status==='paused'){
        setDone(new Set(list.filter(s=>s.delivered).map(s=>s.id)));applyMode(r.order_mode==='any');
        startGPS();
        if(r.status==='paused'){pausedRef.current=true;setStatus(S.PAUSED);}else setStatus(S.RUNNING);
      }
    });
    if(socket)socket.emit('join:route',routeId);
    return()=>{alive=false;stopGPS();clearTimeout(undoTimer.current);};
  },[routeId]);

  // leave the full-screen map when the rider has to act on the controls below it (apartment delivery, route done)
  useEffect(()=>{if(waitingApt||aptNear||status===S.DONE)setMapMax(false);},[waitingApt,aptNear,status]);
  // keep the date and time in the start confirmation current while it is open
  useEffect(()=>{if(!askStart)return;setNow(new Date());const t=setInterval(()=>setNow(new Date()),1000);const onKey=e=>{if(e.key==='Escape')setAskStart(false);};window.addEventListener('keydown',onKey);return()=>{clearInterval(t);window.removeEventListener('keydown',onKey);};},[askStart]);
  useEffect(()=>{if(!mapMax)return;const onKey=e=>{if(e.key==='Escape')setMapMax(false);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[mapMax]);

  const road=useRoadPath({routeId,stops,saved:savedPath,canSave:true});   // roads between the stops (saved path, or asked from Google once)
  const toFirst=nextIdx===0&&!anyOrder&&status!==S.IDLE&&status!==S.DONE?stops[0]:null;
  const approach=useApproachPath(riderPos,toFirst);   // road from the rider to the 1st stop, until it is delivered

  const showToast=(msg,type='mailbox')=>{setToast({msg,type,key:Date.now()});setTimeout(()=>setToast(null),3000);};

  const markDelivered=useCallback(async(stop,method)=>{
    if(processingRef.current)return;processingRef.current=true;
    try{
      const res=await api.deliverStop(stop.id,method);const done=new Set([...deliveredRef.current,stop.id]);
      setDone(done);setWaitingApt(false);setAptNear(null);setNext(firstLeft(done));
      if(res.routeCompleted){setStatus(S.DONE);stopGPS();setUndo(null);}
      else if(anyOrderRef.current&&method==='auto'){   // a box marked in any order can be undone for a few seconds
        clearTimeout(undoTimer.current);setUndo({stop,key:Date.now()});undoTimer.current=setTimeout(()=>setUndo(null),5000);
      }
      else showToast(method==='auto'?`📬 Auto-delivered: ${stop.address}`:`${stop.type==='apartment'?'🏢':'📬'} Delivered: ${stop.address}`,stop.type);
    }
    finally{processingRef.current=false;}
  },[]);

  const undoDelivery=async stop=>{
    clearTimeout(undoTimer.current);setUndo(null);
    try{await api.undoDelivery(stop.id);}catch(e){alert(e?.error||'Could not undo the delivery');return;}
    const done=new Set(deliveredRef.current);done.delete(stop.id);undoneRef.current.add(stop.id);
    setDone(done);setNext(firstLeft(done));showToast(`↩ Not delivered: ${stop.address}`,'info');
  };

  const toggleOrder=async()=>{
    const on=!anyOrderRef.current;
    try{await api.setOrderMode(routeId,on);}catch(e){alert(e?.error||'Could not change the delivery order');return;}
    applyMode(on);if(on)reloadStops();
    showToast(on?'🔀 Any order: boxes on your left are marked':'➡ Saved order',on?'mailbox':'info');
  };

  // KAN-55, any order: mark the nearest box on the rider's left (or with no side) after 2 updates in a row; show the
  // Delivered button for an apartment while the rider is at it
  const checkAnyOrder=(p,heading)=>{
    const list=stopsRef.current;
    undoneRef.current.forEach(id=>{const s=list.find(x=>x.id===id);if(!s||getDistance(p[0],p[1],s.lat,s.lng)>PROXIMITY_METRES*1.5)undoneRef.current.delete(id);});
    const skip=new Set([...deliveredRef.current,...undoneRef.current]);
    const box=pickMailbox(list,skip,p,heading);const pend=pendingRef.current;
    pendingRef.current=box?{id:box.id,count:pend.id===box.id?pend.count+1:1}:{id:null,count:0};
    if(box&&pendingRef.current.count>=2){pendingRef.current={id:null,count:0};markDelivered(box,'auto');return;}
    const apt=nearApartment(list,deliveredRef.current,p);
    setAptNear(prev=>apt||(prev&&!deliveredRef.current.has(prev.id)&&getDistance(p[0],p[1],prev.lat,prev.lng)<=PROXIMITY_METRES*1.5?prev:null));
  };

  const startGPS=()=>{
    pausedRef.current=false;headingRef.current=createHeading();
    if(!navigator.geolocation)return alert('Geolocation not supported');
    watchRef.current=navigator.geolocation.watchPosition(pos=>{
      if(pausedRef.current)return;
      const p=[pos.coords.latitude,pos.coords.longitude];setRiderPos(p);
      const heading=headingRef.current.update(p,pos.coords);
      if(processingRef.current)return;
      if(anyOrderRef.current)return checkAnyOrder(p,heading);
      const curStops=stopsRef.current,curIdx=nextIdxRef.current;
      if(curIdx>=curStops.length)return;
      const ns=curStops[curIdx];const dist=getDistance(p[0],p[1],ns.lat,ns.lng);
      if(dist<=PROXIMITY_METRES){if(ns.type==='mailbox')markDelivered(ns,'auto');else setWaitingApt(true);}
    },err=>console.warn('GPS:',err),{enableHighAccuracy:true,maximumAge:2000});
    pingRef.current=setInterval(()=>{if(pausedRef.current)return;navigator.geolocation?.getCurrentPosition(pos=>api.pingLocation({routeId,lat:pos.coords.latitude,lng:pos.coords.longitude}).catch(()=>{}));},10000);
  };

  const stopGPS=()=>{if(watchRef.current){navigator.geolocation?.clearWatch(watchRef.current);watchRef.current=null;}if(pingRef.current){clearInterval(pingRef.current);pingRef.current=null;}};

  const handleStart=()=>{setStartAny(false);setAskStart(true);};   // the rider confirms the date and start time first
  const confirmStart=async()=>{if(starting)return;setStarting(true);try{await api.startRoute(routeId,startAny);}catch(e){alert(e?.error||'Could not start the route');return;}finally{setStarting(false);}setAskStart(false);setStatus(S.RUNNING);setDone(new Set());undoneRef.current.clear();applyMode(startAny);if(startAny)reloadStops();startGPS();};
  const handlePause=async()=>{pausedRef.current=true;await api.pauseRoute(routeId);setStatus(S.PAUSED);showToast('⏸ Route paused — GPS stopped','info');};
  const handleRestart=async()=>{await api.resumeRoute(routeId);setStatus(S.RUNNING);pausedRef.current=false;showToast('▶ Tracking resumed!','mailbox');};
  const handleExit=()=>navigate('/rider');   // only leaves the page: the run stays on the server and is picked up again on return
  const handleEnd=async()=>{const left=stops.length-delivered.size;if(!confirm(`End this route now?${left?` ${left} stop${left===1?' is':'s are'} not delivered yet.`:''} The route will be marked completed.`))return;stopGPS();try{await api.endRoute(routeId);}catch(e){alert(e?.error||'Could not end the route');return;}navigate('/rider');};

  if(!route)return<div className="spinner" style={{marginTop:80}}/>;
  const totalStops=stops.length,doneCount=delivered.size,pct=totalStops?Math.round(doneCount/totalStops*100):0;
  const nextStop=stops[nextIdx],lastDone=nextIdx>0?stops[nextIdx-1]:null;
  const straight=(a,b)=>stops.slice(a,b).map(s=>[s.lat,s.lng]);
  const doneLine=road.legs?road.legs.slice(0,nextIdx).flat():straight(0,nextIdx+1);
  const remLine=road.legs?road.legs.slice(nextIdx).flat():straight(nextIdx);
  const isPaused=status===S.PAUSED;
  const openStop=stops.find(s=>s.id===openId);
  const aptStop=anyOrder?aptNear:(waitingApt?nextStop:null);   // the apartment whose Delivered button shows
  const leftCount=totalStops-doneCount;
  // KAN-55: the switch between the saved order and any order (start dialog and route screen)
  const orderSwitch=(on,onChange,disabled)=>(
    <label style={{display:'flex',alignItems:'center',gap:10,background:'var(--el)',border:'1px solid var(--border)',borderRadius:14,padding:'9px 12px',cursor:disabled?'default':'pointer',textAlign:'left'}}>
      <i className="ti ti-arrows-shuffle" style={{fontSize:18,color:on?'var(--grn)':'var(--mut)',flexShrink:0}}/>
      <span style={{flex:1,minWidth:0}}>
        <span style={{display:'block',fontSize:13,fontWeight:700}}>Deliver in any order</span>
        <span style={{display:'block',fontSize:11,color:'var(--mut)'}}>{on?'Boxes on your left are marked as you reach them':'Follow the saved order of the stops'}</span>
      </span>
      <input type="checkbox" role="switch" aria-label="Deliver in any order" checked={on} disabled={disabled} onChange={onChange} style={{width:20,height:20,accentColor:'var(--grn)',flexShrink:0}}/>
    </label>
  );

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
        <div style={{marginBottom:14}}>{orderSwitch(startAny,e=>setStartAny(e.target.checked),starting)}</div>
        <button className="btn btn-green" disabled={starting} onClick={confirmStart}><i className="ti ti-check" style={{fontSize:18}}/> {starting?'Starting…':'Confirm'}</button>
        <button className="btn btn-ghost" style={{width:'100%',marginTop:8}} disabled={starting} onClick={()=>setAskStart(false)}>Cancel</button>
      </div>
    </div>
  );

  if(status===S.DONE)return(
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 24px 60px',textAlign:'center'}}>
      <i className="ti ti-circle-check" style={{fontSize:90,color:'var(--grn)',marginBottom:16}}/>
      <h2>Route Complete!</h2><p style={{marginTop:8}}>All {totalStops} stops delivered 🎉</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,margin:'28px 0',width:'100%'}}>
        {[['ti-mailbox','Total',totalStops],['ti-current-location','Auto',stops.filter(s=>s.type==='mailbox').length],['ti-building','Manual',stops.filter(s=>s.type==='apartment').length]].map(([ic,l,v])=>(
          <div key={l} className="stat-card"><i className={`ti ${ic}`} style={{fontSize:22,color:'var(--grn)',display:'block',marginBottom:6}}/><div style={{fontSize:22,fontWeight:700,color:'var(--grn)'}}>{v}</div><div style={{color:'var(--mut)',fontSize:11}}>{l}</div></div>
        ))}
      </div>
      <button className="btn btn-green" style={{marginBottom:10}} onClick={handleStart}><i className="ti ti-player-play" style={{fontSize:18}}/> Start Route</button>
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
            {status===S.RUNNING&&(anyOrder?`${leftCount} of ${totalStops} left · Any order`:`Stop ${Math.min(nextIdx+1,totalStops)} / ${totalStops}`)}
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
          {/* any order: no planned line, the rider chooses the way (KAN-55) */}
          {!anyOrder&&<RouteLine path={doneLine} color="#1C9A54" weight={5} opacity={0.85}/>}
          {!anyOrder&&<RouteLine path={remLine} color="#4285F4" weight={road.legs?4:3} opacity={road.legs?0.6:0.3} dashed={!road.legs}/>}
          {status===S.RUNNING&&approach.path&&<RouteLine path={approach.path} color="#4285F4" weight={approach.status==='ready'?5:3} opacity={approach.status==='ready'?0.85:0.5} dashed={approach.status!=='ready'}/>}
          {!anyOrder&&nextStop&&status===S.RUNNING&&!waitingApt&&nextStop.type==='mailbox'&&<RadiusCircle center={[nextStop.lat,nextStop.lng]} radius={PROXIMITY_METRES} color="#4285F4"/>}
          {stops.map((s,i)=>{const isDone=delivered.has(s.id);const isCurr=status!==S.IDLE&&(anyOrder?aptStop?.id===s.id:i===nextIdx);const color=isDone?'#1C9A54':isCurr?(s.type==='apartment'?'#B5720A':'#4285F4'):'#888';return<CircleMarker key={s.id} position={[s.lat,s.lng]} color={color} label={isDone?'✓':i+1} size={isCurr?36:28} onClick={()=>setOpenId(s.id)}/>;})}
          {openStop&&<InfoWindow position={{lat:openStop.lat,lng:openStop.lng}} pixelOffset={[0,-18]} onCloseClick={()=>setOpenId(null)}><div style={{color:'#222',fontSize:13}}>{openStop.address}<br/><small>{openStop.type}</small>
            {anyOrder&&status===S.RUNNING&&!delivered.has(openStop.id)&&<div><button className="btn btn-green btn-sm" style={{marginTop:8,width:'100%'}} onClick={()=>{markDelivered(openStop,'manual');setOpenId(null);}}><i className="ti ti-check"/> Mark delivered</button></div>}
          </div></InfoWindow>}
          {riderPos&&<DotMarker position={riderPos} size={24}/>}
        </MapCanvas>
        <button className="btn btn-ghost btn-sm" onClick={()=>setMapMax(m=>!m)} title={mapMax?'Exit full screen':'Full screen map'} aria-label={mapMax?'Exit full screen map':'Maximize the map'}
          style={{position:'absolute',top:mapMax?'calc(12px + var(--safe-top))':10,right:10,zIndex:1100,width:40,height:40,padding:0,borderRadius:12,background:'var(--card)',color:'var(--tx)',boxShadow:'0 2px 8px rgba(0,0,0,0.25)'}}>
          <i className={`ti ti-${mapMax?'arrows-minimize':'arrows-maximize'}`} style={{fontSize:20}}/>
        </button>
        {mapMax&&status===S.RUNNING&&anyOrder&&<div data-testid="any-order-mini" style={{position:'absolute',left:12,right:12,bottom:'calc(34px + var(--safe-bot))',zIndex:1100,background:'var(--card)',borderRadius:14,padding:'10px 12px',border:'1.5px solid #1C9A5444',boxShadow:'0 4px 14px rgba(0,0,0,0.2)',display:'flex',alignItems:'center',gap:10}}>
          <i className="ti ti-arrows-shuffle" style={{fontSize:18,color:'var(--grn)',flexShrink:0}}/>
          <div style={{fontSize:14,fontWeight:700}}>{leftCount} of {totalStops} left · {pct}%</div>
        </div>}
        {mapMax&&status===S.RUNNING&&!anyOrder&&nextStop&&<div style={{position:'absolute',left:12,right:12,bottom:'calc(34px + var(--safe-bot))',zIndex:1100,background:'var(--card)',borderRadius:14,padding:'10px 12px',border:'1.5px solid #4285F444',boxShadow:'0 4px 14px rgba(0,0,0,0.2)',display:'flex',alignItems:'center',gap:10}}>
          <i className={`ti ti-${nextStop.type==='apartment'?'building':'navigation'}`} style={{fontSize:18,color:nextStop.type==='apartment'?'var(--apt)':'#4285F4',flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:'var(--mut)',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Stop {Math.min(nextIdx+1,totalStops)} / {totalStops} · {pct}%</div>
            <div style={{fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nextStop.address}</div>
          </div>
        </div>}
        {isPaused&&<div style={{position:'absolute',inset:0,background:'rgba(255,255,255,0.85)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:1000}}><i className="ti ti-player-pause" style={{fontSize:48,color:'var(--apt)',marginBottom:8}}/><div style={{color:'var(--apt)',fontWeight:700,fontSize:16}}>GPS Paused</div><div style={{color:'var(--mut)',fontSize:12,marginTop:4}}>Map tracking stopped</div></div>}
      </div>

      {status!==S.IDLE&&<div style={{display:'flex',gap:8,padding:'8px 22px 0',flexShrink:0}}>
        {[['#1C9A54','Done',doneCount],['var(--pl)','Left',totalStops-doneCount],['#4285F4','Auto',Array.from(delivered).filter(id=>stops.find(s=>s.id===id)?.type==='mailbox').length],['var(--apt)','Apt',Array.from(delivered).filter(id=>stops.find(s=>s.id===id)?.type==='apartment').length]].map(([c,l,v])=>(
          <div key={l} style={{flex:1,background:'var(--card)',borderRadius:12,padding:'8px 6px',border:'1px solid var(--border)',textAlign:'center'}}>
            <div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:10,color:'var(--mut)'}}>{l}</div>
          </div>
        ))}
      </div>}

      <div style={{padding:'8px 22px 0',flexShrink:0}}>
        {status===S.IDLE&&<button className="btn btn-green" style={{fontSize:16}} onClick={handleStart}><i className="ti ti-player-play" style={{fontSize:20}}/> Start Route</button>}

        {status===S.RUNNING&&!aptStop&&<div style={{marginBottom:8}}>{orderSwitch(anyOrder,toggleOrder,false)}</div>}

        {status===S.RUNNING&&anyOrder&&!aptStop&&<>
          <div data-testid="any-order-card" style={{background:'var(--card)',borderRadius:18,padding:'12px 14px',border:'1.5px solid #1C9A5444',marginBottom:10}}>
            <div style={{color:'var(--mut)',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Any order · your left side</div>
            <div style={{fontSize:14,fontWeight:700}}>{leftCount} of {totalStops} stops left</div>
            <div style={{color:'var(--mut)',fontSize:11,marginTop:2}}>Boxes on your left are marked within {PROXIMITY_METRES} m. Tap a stop on the map to mark it by hand.</div>
          </div>
          <button className="btn" style={{width:'100%',background:'var(--amber-tint)',border:'1.5px solid #B5720A55',color:'var(--apt)',fontSize:14,fontWeight:600}} onClick={handlePause}>
            <i className="ti ti-player-pause" style={{fontSize:18}}/> Pause Route
          </button>
        </>}

        {status===S.RUNNING&&!anyOrder&&!waitingApt&&nextStop&&<>
          <div style={{background:'var(--card)',borderRadius:18,padding:'12px 14px',border:'1.5px solid #4285F444',marginBottom:10}}>
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
          </div>
          <button className="btn" style={{width:'100%',background:'var(--amber-tint)',border:'1.5px solid #B5720A55',color:'var(--apt)',fontSize:14,fontWeight:600}} onClick={handlePause}>
            <i className="ti ti-player-pause" style={{fontSize:18}}/> Pause Route
          </button>
        </>}

        {status===S.RUNNING&&aptStop&&<div style={{background:'var(--card)',borderRadius:20,padding:16,border:'2px solid var(--apt)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
            <div style={{width:44,height:44,borderRadius:14,background:'#B5720A22',border:'1.5px solid #B5720A55',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i className="ti ti-building" style={{fontSize:24,color:'var(--apt)'}}/>
            </div>
            <div><div style={{color:'var(--apt)',fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Apartment — deliver inside</div><div style={{fontSize:15,fontWeight:700}}>{aptStop.address}</div></div>
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
        <span>{isPaused?'Press Restart to resume GPS and continue tracking':<><strong style={{color:'var(--grn)'}}>Mailboxes</strong> auto {PROXIMITY_METRES}m{anyOrder&&' on your left'} · <strong style={{color:'var(--apt)'}}>Apartments</strong> tap</>}</span>
      </div>

      {(road.legs||approach.status==='ready')&&MODE_WARNING&&<div style={{margin:'6px 22px 0',fontSize:10,lineHeight:1.4,color:'var(--mut)',flexShrink:0}}>{MODE_WARNING}</div>}

      {startDialog}
      {toast&&!undo&&<div key={toast.key} className={`toast${toast.type==='apartment'||toast.type==='info'?' apt':''}`}>{toast.msg}</div>}
      {undo&&<div key={undo.key} className="toast-undo" role="status">
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📬 Delivered: {undo.stop.address}</span>
        <button onClick={()=>undoDelivery(undo.stop)}>Undo</button>
      </div>}
    </div>
  );
}
