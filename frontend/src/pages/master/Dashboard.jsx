import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';

const StatusBadge = ({ status }) => (
  <span className={`badge badge-${status}`}>
    {status === 'not_started' ? 'Not started' : status === 'ongoing' ? 'Ongoing' : 'Completed'}
  </span>
);

export default function MasterDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.getRoutes().then(setRoutes).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('route:started',   load);
    socket.on('route:completed', load);
    socket.on('stop:delivered',  load);
    return () => { socket.off('route:started'); socket.off('route:completed'); socket.off('stop:delivered'); };
  }, [socket]);

  const stats = {
    not_started: routes.filter(r => r.status === 'not_started').length,
    ongoing:     routes.filter(r => r.status === 'ongoing').length,
    completed:   routes.filter(r => r.status === 'completed').length,
  };
  const today = new Date().toLocaleDateString('en-FI', { weekday:'long', month:'long', day:'numeric' });

  return (
    <div className="screen">
      <div className="page-header">
        <div>
          <p style={{ fontSize:12, color:'rgba(255,255,255,0.75)', margin:0 }}>Good morning,</p>
          <h2 style={{ fontSize:20, color:'#fff' }}>{user?.name}</h2>
        </div>
        <div style={{ width:44, height:44, borderRadius:22, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--pr)', fontWeight:700, fontSize:18 }}>
          {user?.name?.[0]}
        </div>
      </div>

      <div style={{ padding:'0 22px 20px' }}>

      <p style={{ color:'var(--sub)', fontSize:13, marginBottom:20 }}>{today}</p>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom:24 }}>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--mut)' }}>{stats.not_started}</div><div className="stat-lbl">Not Started</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--amb)' }}>{stats.ongoing}</div><div className="stat-lbl">Ongoing</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color:'var(--grn)' }}>{stats.completed}</div><div className="stat-lbl">Completed</div></div>
      </div>

      {/* Quick actions */}
      <div className="section-label">Quick Actions</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:28 }}>
        {[
          { icon:'ti-route', label:'New Route', sub:'Create path', action: () => navigate('/master/routes/new') },
          { icon:'ti-users', label:'Riders', sub:`${routes.filter(r=>r.rider_id).length} assigned`, action: () => navigate('/master/users') },
          { icon:'ti-map-2', label:'Routes', sub:`${routes.length} total`, action: () => navigate('/master/routes') },
          { icon:'ti-chart-bar', label:'Reports', sub:'Coming soon', action: null },
        ].map(({ icon, label, sub, action }) => (
          <button key={label} onClick={action} disabled={!action}
            style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:'16px 14px', textAlign:'left', cursor:action?'pointer':'default', opacity:action?1:0.5 }}>
            <i className={`ti ${icon}`} style={{ fontSize:26, color:'var(--pl)', display:'block', marginBottom:8 }} />
            <div style={{ color:'var(--tx)', fontSize:13, fontWeight:600 }}>{label}</div>
            <div style={{ color:'var(--mut)', fontSize:11, marginTop:2 }}>{sub}</div>
          </button>
        ))}
      </div>

      {/* Route list */}
      <div className="section-label">Today's Routes</div>
      {loading && <div className="spinner" />}
      {routes.map(r => (
        <div key={r.id} className="card" style={{ marginBottom:10, cursor:'pointer' }} onClick={() => navigate(`/master/routes/${r.id}`)}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14, color:'var(--tx)' }}>{r.name}</div>
              <div style={{ color:'var(--mut)', fontSize:12, marginTop:3 }}>
                {r.rider_name || <span style={{ color:'var(--amb)' }}>Unassigned</span>} · {r.stop_count} stops
                {r.delivered_count > 0 && <span style={{ color:'var(--grn)' }}> · {r.delivered_count} done</span>}
              </div>
            </div>
            <StatusBadge status={r.status} />
          </div>
        </div>
      ))}
      {!loading && routes.length === 0 && (
        <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:40 }}>
          <i className="ti ti-map-off" style={{ fontSize:48, display:'block', marginBottom:12 }} />
          No routes yet — create one!
        </div>
      )}
      </div>
    </div>
  );
}
