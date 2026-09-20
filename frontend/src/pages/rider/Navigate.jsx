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




const S={IDLE:'idle',RUNNING:'running',PAUSED:'paused',DONE:'done'};

export default function RiderNavigate(){
  const{routeId}=useParams();const navigate=useNavigate();const{user}=useAuth();const socket=useSocket();
  const[route,setRoute]=useState(null);const[stops,setStops]=useState([]);
  const[status,setStatus]=useState(S.IDLE);const[riderPos,setRiderPos]=useState(null);
  const[nextIdx,setNextIdx]=useState(0);const[delivered,setDelivered]=useState(new Set());
  const[waitingApt,setWaitingApt]=useState(false);const[toast,setToast]=useState(null);
  const[openId,setOpenId]=useState(null);
  const[savedPath,setSavedPath]=useState(null);
  const watchRef=useRef(null);const pingRef=useRef(null);const processingRef=useRef(false);const pausedRef=useRef(false);const stopsRef=useRef([]);

  useEffect(()=>{api.getRoute(routeId).then(r=>{setRoute(r);setStops(r.stops||[]);setSavedPath(r.road_path||null);stopsRef.current=r.stops||[];});if(socket)socket.emit('join:route',routeId);return()=>stopGPS();},[routeId]);

  const road=useRoadPath({routeId,stops,saved:savedPath,canSave:true});   // roads between the stops (saved path, or asked from Google once)

  const showToast=(msg,type='mailbox')=>{setToast({msg,type,key:Date.now()});setTimeout(()=>setToast(null),3000);};

  const markDelivered=useCallback(async(stop,method)=>{
    if(processingRef.current)return;processingRef.current=true;
    try{const res=await api.deliverStop(stop.id,method);setDelivered(prev=>new Set([...prev,stop.id]));showToast(method==='auto'?`📬 Auto-delivered: ${stop.address}`:`🏢 Delivered: ${stop.address}`,stop.type);setWaitingApt(false);setNextIdx(prev=>prev+1);if(res.routeCompleted){setStatus(S.DONE);stopGPS();}}
    finally{processingRef.current=false;}
  },[]);

  const startGPS=()=>{
    pausedRef.current=false;
    if(!navigator.geolocation)return alert('Geolocation not supported');
    watchRef.current=navigator.geolocation.watchPosition(pos=>{
      if(pausedRef.current)return;
      const p=[pos.coords.latitude,pos.coords.longitude];setRiderPos(p);
      setNextIdx(curIdx=>{
        const curStops=stopsRef.current;
        if(curIdx>=curStops.length||processingRef.current)return curIdx;
        const ns=curStops[curIdx];const dist=getDistance(p[0],p[1],ns.lat,ns.lng);
        if(dist<=PROXIMITY_METRES){if(ns.type==='mailbox')markDelivered(ns,'auto');else setWaitingApt(true);}
        return curIdx;
      });
    },err=>console.warn('GPS:',err),{enableHighAccuracy:true,maximumAge:2000});
    pingRef.current=setInterval(()=>{if(pausedRef.current)return;navigator.geolocation?.getCurrentPosition(pos=>api.pingLocation({routeId,lat:pos.coords.latitude,lng:pos.coords.longitude}).catch(()=>{}));},10000);
  };

  const stopGPS=()=>{if(watchRef.current){navigator.geolocation?.clearWatch(watchRef.current);watchRef.current=null;}if(pingRef.current){clearInterval(pingRef.current);pingRef.current=null;}};

  const handleStart=async()=>{if(status===S.IDLE&&route?.status==='completed'&&!confirm('This route was already completed. Starting it again resets its delivered stops. Start again?'))return;try{await api.startRoute(routeId);}catch(e){alert(e?.error||'Could not start the route');return;}setStatus(S.RUNNING);setDelivered(new Set());setNextIdx(0);setWaitingApt(false);startGPS();};
  const handlePause=async()=>{pausedRef.current=true;await api.pauseRoute(routeId);setStatus(S.PAUSED);showToast('⏸ Route paused — GPS stopped','info');};
  const handleRestart=async()=>{await api.resumeRoute(routeId);setStatus(S.RUNNING);pausedRef.current=false;showToast('▶ Tracking resumed!','mailbox');};
  const handleEnd=async()=>{stopGPS();await api.endRoute(routeId);navigate('/rider');};

  if(!route)return<div className="spinner" style={{marginTop:80}}/>;
  const totalStops=stops.length,doneCount=delivered.size,pct=totalStops?Math.round(doneCount/totalStops*100):0;
  const nextStop=stops[nextIdx],lastDone=nextIdx>0?stops[nextIdx-1]:null;
  const straight=(a,b)=>stops.slice(a,b).map(s=>[s.lat,s.lng]);
  const doneLine=road.legs?road.legs.slice(0,nextIdx).flat():straight(0,nextIdx+1);
  const remLine=road.legs?road.legs.slice(nextIdx).flat():straight(nextIdx);
  const isPaused=status===S.PAUSED;
  const openStop=stops.find(s=>s.id===openId);

  if(status===S.DONE)return(
    <div className="screen" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'0 24px 60px',textAlign:'center'}}>
      <i className="ti ti-circle-check" style={{fontSize:90,color:'var(--grn)',marginBottom:16}}/>
      <h2>Route Complete!</h2><p style={{marginTop:8}}>All {totalStops} stops delivered 🎉</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,margin:'28px 0',width:'100%'}}>
        {[['ti-mailbox','Total',totalStops],['ti-current-location','Auto',stops.filter(s=>s.type==='mailbox').length],['ti-building','Manual',stops.filter(s=>s.type==='apartment').length]].map(([ic,l,v])=>(
          <div key={l} className="stat-card"><i className={`ti ${ic}`} style={{fontSize:22,color:'var(--grn)',display:'block',marginBottom:6}}/><div style={{fontSize:22,fontWeight:700,color:'var(--grn)'}}>{v}</div><div style={{color:'var(--mut)',fontSize:11}}>{l}</div></div>
        ))}
      </div>
      <button className="btn btn-green" style={{marginBottom:10}} onClick={handleStart}><i className="ti ti-refresh" style={{fontSize:18}}/> Start Again</button>
      <button className="btn btn-primary" onClick={()=>navigate('/rider')}>Back to Dashboard</button>
    </div>
  );

  return(
    <div className="screen-full">
      <div style={{padding:'48px 22px 8px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <button className="btn btn-ghost btn-sm" onClick={handleEnd}>← Exit</button>
        <div style={{textAlign:'center'}}>
          <div style={{color:'var(--pl)',fontSize:12,fontWeight:600}}>{route.name}</div>
          <div style={{fontSize:13,fontWeight:700}}>
            {status===S.IDLE&&'Ready to start'}
            {status===S.RUNNING&&`Stop ${Math.min(nextIdx+1,totalStops)} / ${totalStops}`}
            {status===S.PAUSED&&<span style={{color:'#F59E0B'}}>⏸ Paused</span>}
          </div>
        </div>
        <div style={{background:'#082E20',borderRadius:12,padding:'6px 10px',color:isPaused?'#F59E0B':'var(--grn)',fontSize:12,fontWeight:700}}>{pct}%</div>
      </div>

      <div style={{margin:'0 22px 8px',height:4,background:'var(--el)',borderRadius:2,flexShrink:0}}>
        <div style={{height:'100%',width:`${pct}%`,background:isPaused?'#F59E0B':'var(--grn)',borderRadius:2,transition:'width 0.5s'}}/>
      </div>

      <div style={{flex:'0 0 42%',margin:'0 22px',borderRadius:16,overflow:'hidden',border:`2px solid ${isPaused?'#F59E0B88':'#C8C4BC'}`,flexShrink:0,position:'relative'}}>
        <MapCanvas center={riderPos||[stops[0]?.lat||61.1282,stops[0]?.lng||21.5117]} zoom={16}>
          <MapFollow pos={riderPos} follow={status===S.RUNNING}/>
          <RouteLine path={doneLine} color="#22A05B" weight={5} opacity={0.85}/>
          <RouteLine path={remLine} color="#4285F4" weight={road.legs?4:3} opacity={road.legs?0.6:0.3} dashed={!road.legs}/>
          {nextStop&&status===S.RUNNING&&!waitingApt&&nextStop.type==='mailbox'&&<RadiusCircle center={[nextStop.lat,nextStop.lng]} radius={PROXIMITY_METRES} color="#4285F4"/>}
          {stops.map((s,i)=>{const isDone=delivered.has(s.id);const isCurr=i===nextIdx&&status!==S.IDLE;const color=isDone?'#22A05B':isCurr?(s.type==='apartment'?'#F59E0B':'#4285F4'):'#888';return<CircleMarker key={s.id} position={[s.lat,s.lng]} color={color} label={isDone?'✓':i+1} size={isCurr?36:28} onClick={()=>setOpenId(s.id)}/>;})}
          {openStop&&<InfoWindow position={{lat:openStop.lat,lng:openStop.lng}} pixelOffset={[0,-18]} onCloseClick={()=>setOpenId(null)}><div style={{color:'#222',fontSize:13}}>{openStop.address}<br/><small>{openStop.type}</small></div></InfoWindow>}
          {riderPos&&<DotMarker position={riderPos} size={24}/>}
        </MapCanvas>
        {isPaused&&<div style={{position:'absolute',inset:0,background:'rgba(14,9,48,0.75)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:1000}}><i className="ti ti-player-pause" style={{fontSize:48,color:'#F59E0B',marginBottom:8}}/><div style={{color:'#F59E0B',fontWeight:700,fontSize:16}}>GPS Paused</div><div style={{color:'#B8A4F8',fontSize:12,marginTop:4}}>Map tracking stopped</div></div>}
      </div>

      {status!==S.IDLE&&<div style={{display:'flex',gap:8,padding:'8px 22px 0',flexShrink:0}}>
        {[['#22A05B','Done',doneCount],['var(--pl)','Left',totalStops-doneCount],['#4285F4','Auto',Array.from(delivered).filter(id=>stops.find(s=>s.id===id)?.type==='mailbox').length],['var(--apt)','Apt',Array.from(delivered).filter(id=>stops.find(s=>s.id===id)?.type==='apartment').length]].map(([c,l,v])=>(
          <div key={l} style={{flex:1,background:'var(--card)',borderRadius:12,padding:'8px 6px',border:'1px solid var(--border)',textAlign:'center'}}>
            <div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:10,color:'var(--mut)'}}>{l}</div>
          </div>
        ))}
      </div>}

      <div style={{padding:'8px 22px 0',flexShrink:0}}>
        {status===S.IDLE&&<button className="btn btn-green" style={{fontSize:16}} onClick={handleStart}><i className="ti ti-player-play" style={{fontSize:20}}/> Start Route</button>}

        {status===S.RUNNING&&!waitingApt&&nextStop&&<>
          <div style={{background:'var(--card)',borderRadius:18,padding:'12px 14px',border:'1.5px solid #4285F444',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:12,background:nextStop.type==='apartment'?'var(--apt)22':'#4285F422',border:`1.5px solid ${nextStop.type==='apartment'?'var(--apt)44':'#4285F444'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <i className={`ti ti-${nextStop.type==='apartment'?'building':'navigation'}`} style={{fontSize:18,color:nextStop.type==='apartment'?'var(--apt)':'#4285F4'}}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:'var(--mut)',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{nextStop.type==='apartment'?'Apartment — tap when inside':'Auto-detects within 20m'}</div>
                <div style={{fontSize:14,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nextStop.address}</div>
              </div>
              <span className={`badge badge-${nextStop.type}`}><i className={`ti ti-${nextStop.type==='mailbox'?'mailbox':'building'}`} style={{fontSize:10}}/></span>
            </div>
          </div>
          <button className="btn" style={{width:'100%',background:'#2D1A00',border:'1.5px solid #F59E0B55',color:'#F59E0B',fontSize:14,fontWeight:600}} onClick={handlePause}>
            <i className="ti ti-player-pause" style={{fontSize:18}}/> Pause Route
          </button>
        </>}

        {status===S.RUNNING&&waitingApt&&nextStop&&<div style={{background:'var(--card)',borderRadius:20,padding:16,border:'2px solid var(--apt)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
            <div style={{width:44,height:44,borderRadius:14,background:'var(--apt)22',border:'1.5px solid var(--apt)55',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i className="ti ti-building" style={{fontSize:24,color:'var(--apt)'}}/>
            </div>
            <div><div style={{color:'var(--apt)',fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>Apartment — deliver inside</div><div style={{fontSize:15,fontWeight:700}}>{nextStop.address}</div></div>
          </div>
          <button className="btn btn-apt" onClick={()=>markDelivered(nextStop,'manual')}><i className="ti ti-check" style={{fontSize:22}}/> Delivered</button>
        </div>}

        {status===S.PAUSED&&<div>
          <div style={{background:'#2D1A00',borderRadius:16,padding:'12px 16px',marginBottom:10,border:'1px solid #F59E0B44',display:'flex',alignItems:'center',gap:12}}>
            <i className="ti ti-player-pause" style={{fontSize:24,color:'#F59E0B',flexShrink:0}}/>
            <div><div style={{color:'#F59E0B',fontWeight:600,fontSize:14}}>Route paused</div><div style={{color:'var(--mut)',fontSize:12}}>GPS stopped · {doneCount}/{totalStops} delivered</div></div>
          </div>
          <button className="btn btn-green" onClick={handleRestart}><i className="ti ti-player-play" style={{fontSize:20}}/> Restart Tracking</button>
        </div>}
      </div>

      <div style={{margin:'8px 22px 0',background:'var(--el)',borderRadius:12,padding:'8px 14px',border:'1px solid var(--border)',display:'flex',alignItems:'center',gap:9,flexShrink:0,fontSize:11,color:'var(--mut)'}}>
        <i className="ti ti-info-circle" style={{fontSize:15,color:'var(--pl)',flexShrink:0}}/>
        <span>{isPaused?'Press Restart to resume GPS and continue tracking':<><strong style={{color:'var(--grn)'}}>Mailboxes</strong> auto {PROXIMITY_METRES}m · <strong style={{color:'var(--apt)'}}>Apartments</strong> tap</>}</span>
      </div>

      {road.legs&&MODE_WARNING&&<div style={{margin:'6px 22px 0',fontSize:10,lineHeight:1.4,color:'var(--mut)',flexShrink:0}}>{MODE_WARNING}</div>}

      {toast&&<div key={toast.key} className={`toast${toast.type==='apartment'||toast.type==='info'?' apt':''}`}>{toast.msg}</div>}
    </div>
  );
}
