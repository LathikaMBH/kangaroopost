import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { TrashIcon, PlusIcon, PinIcon, DELETE_BTN, LOCATE_BTN } from '../../components/RowActions';
import MapCanvas, { MapFocus, CircleMarker } from '../../components/GoogleMapView';

// base: '/owner' (route owners). The page is shared, so every link is built from it.
export default function RouteDetail({ base = '/owner' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState(null);
  const [riders, setRiders] = useState([]);
  const [error, setError] = useState('');
  const [assignError, setAssignError] = useState('');
  const [stopError, setStopError] = useState('');
  const [locateStop, setLocateStop] = useState(null);

  useEffect(() => {
    setError('');
    api.getRoute(id).then(setRoute).catch(e => setError(e?.error || 'Could not load this route'));
    api.getRiders().then(setRiders).catch(() => setRiders([]));
  }, [id]);

  const assign = async (rider_id) => {
    setAssignError('');
    try {
      await api.assignRoute(id, rider_id === '' ? null : Number(rider_id));
      setRoute(await api.getRoute(id));
    } catch (e) { setAssignError(e?.error || 'Could not assign the rider'); }
  };

  const deleteStop = async (stop, index) => {
    if (!confirm(`Delete stop ${index + 1} (${stop.address})?`)) return;
    setStopError('');
    try {
      await api.deleteStop(stop.id);
      setRoute(await api.getRoute(id));
    } catch (e) { setStopError(e?.error || 'Could not delete the stop'); }
  };

  const back = () => navigate(`${base}/routes`);

  if (error) return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={back}><i className="ti ti-arrow-left" /></button>
        <h3>Route</h3><div style={{ width:30 }} />
      </div>
      <div style={{ padding:'0 22px', textAlign:'center', color:'var(--mut)', paddingTop:40 }}>{error}</div>
    </div>
  );

  if (!route) return <div className="spinner" style={{ marginTop:80 }} />;

  const mbox = route.stops?.filter(s=>s.type==='mailbox').length || 0;
  const apt  = route.stops?.filter(s=>s.type==='apartment').length || 0;
  const done = route.stops?.filter(s=>s.delivered).length || 0;
  const inProgress = route.status === 'ongoing' || route.status === 'paused';
  const stopCount = route.stops?.length || 0;

  // "+" between two stops (position = where the new stop will sit: 1 = first ... n+1 = last)
  const insertGap = position => {
    const label = position === 1 ? 'Add a stop at the start'
      : position === stopCount + 1 ? 'Add a stop at the end'
      : `Add a stop between stop ${position - 1} and stop ${position}`;
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, height:26 }}>
        <div style={{ flex:1, height:1, background:'var(--border)' }} />
        <button title={label} aria-label={label} onClick={() => navigate(`${base}/routes/${id}/edit?insert=${position}`)}
          style={{ width:22, height:22, borderRadius:11, border:'1px solid var(--pr)', background:'var(--card)', color:'var(--pl)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0, flexShrink:0 }}>
          <PlusIcon size={12} />
        </button>
        <div style={{ flex:1, height:1, background:'var(--border)' }} />
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={back}><i className="ti ti-arrow-left" /></button>
        <h3>{route.name}</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`${base}/routes/${id}/edit`)}>
          <i className="ti ti-edit" style={{ fontSize:14 }} /> Edit
        </button>
      </div>

      <div style={{ padding:'0 22px' }}>
        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
          <div className="stat-card"><div className="stat-val" style={{ color:'var(--grn)', fontSize:22 }}>{done}</div><div className="stat-lbl">Delivered</div></div>
          <div className="stat-card"><div className="stat-val" style={{ color:'var(--pl)', fontSize:22 }}>{mbox}</div><div className="stat-lbl">Mailboxes</div></div>
          <div className="stat-card"><div className="stat-val" style={{ color:'var(--apt)', fontSize:22 }}>{apt}</div><div className="stat-lbl">Apartments</div></div>
        </div>

        {/* Assign rider */}
        <div className="card" style={{ marginBottom:16 }}>
          <div className="label" style={{ marginBottom:8 }}>Assigned rider</div>
          <select className="input" value={route.rider_id || ''} onChange={e => assign(e.target.value)}
            style={{ appearance:'auto' }}>
            <option value="">— Unassigned —</option>
            {riders.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {assignError && <div style={{ color:'var(--red)', fontSize:13, marginTop:8 }}>{assignError}</div>}
          {riders.length === 0 && (
            <div style={{ color:'var(--mut)', fontSize:12, marginTop:8 }}>
              You have no riders yet. <span style={{ color:'var(--pl)', cursor:'pointer' }} onClick={() => navigate(`${base}/riders`)}>Add a rider</span> to assign this route.
            </div>
          )}
        </div>

        {/* Locate a single stop on the map */}
        {locateStop && (
          <div className="card" style={{ marginBottom:16, padding:0, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ color:'var(--tx)', fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{locateStop.address}</div>
                <div style={{ color:'var(--mut)', fontSize:11 }}>{locateStop.lat.toFixed(5)}°, {locateStop.lng.toFixed(5)}°</div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ flexShrink:0, padding:'4px 8px' }} onClick={() => setLocateStop(null)}>
                <i className="ti ti-x" style={{ fontSize:14 }} />
              </button>
            </div>
            <div style={{ height:260 }}>
              <MapCanvas center={[locateStop.lat, locateStop.lng]} zoom={17}>
                <MapFocus target={[locateStop.lat, locateStop.lng]} zoom={17} />
                <CircleMarker position={[locateStop.lat, locateStop.lng]} color="#E11D48" size={36} label={<PinIcon size={16} />} />
              </MapCanvas>
            </div>
          </div>
        )}

        {/* Stop list */}
        <div className="section-label">Stops ({route.stops?.length || 0})</div>
        {stopError && <div style={{ color:'var(--red)', fontSize:13, marginBottom:8 }}>{stopError}</div>}
        {inProgress && route.stops?.length > 0 && (
          <div style={{ color:'var(--mut)', fontSize:12, marginBottom:8 }}>This route is in progress, so stops can't be added or deleted until it is finished.</div>
        )}
        {stopCount > 0 && !inProgress && insertGap(1)}
        {route.stops?.map((s, i) => (
          <div key={s.id}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--el)', borderRadius:12, border:`1px solid ${s.delivered?'var(--grn)44':s.type==='apartment'?'var(--apt)44':'var(--border)'}` }}>
              <div style={{ width:28, height:28, borderRadius:9, background:s.delivered?'var(--grn)':s.type==='apartment'?'var(--apt)':'var(--pr)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:12, flexShrink:0 }}>
                {s.delivered ? <i className="ti ti-check" style={{ fontSize:14 }} /> : i+1}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'var(--tx)', fontSize:13, fontWeight:500 }}>{s.address}</div>
                <div style={{ color:'var(--mut)', fontSize:11, marginTop:1 }}>
                  {s.lat.toFixed(5)}°, {s.lng.toFixed(5)}°
                  {s.delivered && <span style={{ color:'var(--grn)' }}> · ✓ {s.delivered_method}</span>}
                </div>
              </div>
              <span className={`badge badge-${s.type}`}><i className={`ti ti-${s.type==='mailbox'?'mailbox':'building'}`} style={{ fontSize:10 }} /> {s.type}</span>
              <button className="btn btn-ghost btn-sm" title="Show this stop's location on the map" aria-label={`Locate stop ${i+1} on the map`}
                style={LOCATE_BTN} onClick={() => setLocateStop(s)}>
                <PinIcon />
              </button>
              <button className="btn btn-danger btn-sm" title={inProgress ? "Can't delete while the route is in progress" : 'Delete stop'} aria-label={`Delete stop ${i+1}`}
                disabled={inProgress} style={{ ...DELETE_BTN, opacity: inProgress ? 0.4 : 1, cursor: inProgress ? 'not-allowed' : 'pointer' }}
                onClick={() => deleteStop(s, i)}>
                <TrashIcon />
              </button>
            </div>
            {!inProgress && insertGap(i + 2)}
          </div>
        ))}
        {(!route.stops || route.stops.length === 0) && (
          <div style={{ color:'var(--mut)', fontSize:13, textAlign:'center', padding:'16px 0' }}>No stops yet. Use the edit button to pin some on the map.</div>
        )}
      </div>
    </div>
  );
}
