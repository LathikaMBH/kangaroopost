import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';

// base: '/owner' (route owners). The page is shared, so every link is built from it.
export default function RouteDetail({ base = '/owner' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [route, setRoute] = useState(null);
  const [riders, setRiders] = useState([]);
  const [error, setError] = useState('');
  const [assignError, setAssignError] = useState('');

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

        {/* Stop list */}
        <div className="section-label">Stops ({route.stops?.length || 0})</div>
        {route.stops?.map((s, i) => (
          <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--el)', borderRadius:12, marginBottom:8, border:`1px solid ${s.delivered?'var(--grn)44':s.type==='apartment'?'var(--apt)44':'var(--border)'}` }}>
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
          </div>
        ))}
        {(!route.stops || route.stops.length === 0) && (
          <div style={{ color:'var(--mut)', fontSize:13, textAlign:'center', padding:'16px 0' }}>No stops yet. Use the edit button to pin some on the map.</div>
        )}
      </div>
    </div>
  );
}
