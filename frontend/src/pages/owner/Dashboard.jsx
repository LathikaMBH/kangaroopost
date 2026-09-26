import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import RouteStatusTiles, { routeStatus } from '../../components/RouteStatusTiles';
import RouteTable, { ViewToggle } from '../../components/RouteTable';

const StatusBadge = ({ status }) => {
  const m = {
    not_started: ['Not started', 'var(--mut)', 'var(--el)', 'var(--border)'],
    ongoing:     ['Ongoing', 'var(--amb)', 'var(--amber-tint)', 'rgba(181,114,10,0.3)'],
    paused:      ['Paused', 'var(--apt)', 'var(--amber-tint)', 'rgba(181,114,10,0.3)'],
    completed:   ['Completed', 'var(--grn)', 'var(--grn-tint)', 'rgba(28,154,84,0.3)'],
  };
  const [l, c, bg, bd] = m[status] || m.not_started;
  return <span style={{ fontSize:11, fontWeight:600, color:c, background:bg, padding:'3px 10px', borderRadius:20, border:`1px solid ${bd}` }}>{l}</span>;
};

export default function OwnerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const [routes, setRoutes] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [view, setView] = useState('cards');

  const load = () => Promise.all([api.getRoutes(), api.getRiders()])
    .then(([r, ri]) => { setRoutes(r); setRiders(ri); })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('route:started',   load);
    socket.on('route:paused',    load);
    socket.on('route:resumed',   load);
    socket.on('route:completed', load);
    socket.on('stop:delivered',  load);
    return () => { ['route:started','route:paused','route:resumed','route:completed','stop:delivered'].forEach(e => socket.off(e)); };
  }, [socket]);

  const visibleRoutes = statusFilter ? routes.filter(r => routeStatus(r) === statusFilter) : routes;

  return (
    <div className="screen">
      <div className="page-header">
        <div>
          <p style={{ fontSize:11, color:'rgba(255,255,255,0.75)', margin:0, textTransform:'uppercase', letterSpacing:'0.06em' }}>Route Owner</p>
          <h2 style={{ fontSize:20, color:'#fff' }}>{user?.name}</h2>
          {user?.city && <p style={{ fontSize:12, color:'rgba(255,255,255,0.75)', margin:0 }}><i className="ti ti-map-pin" style={{ fontSize:11 }} /> {user.city}</p>}
        </div>
        <button onClick={() => { logout(); navigate('/login'); }} className="btn btn-ghost btn-sm">
          <i className="ti ti-logout" style={{ fontSize:16 }} />
        </button>
      </div>

      <div style={{ padding:'0 22px 20px' }}>

      {/* Route status */}
      <div className="section-label">Route status</div>
      <RouteStatusTiles routes={routes} value={statusFilter} onChange={setStatusFilter} />
      <div style={{ marginBottom:10 }} />

      {/* Quick actions */}
      <div className="section-label">Actions</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
        <button onClick={() => navigate('/owner/routes/new')} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:'16px 14px', textAlign:'left', cursor:'pointer' }}>
          <i className="ti ti-route" style={{ fontSize:26, color:'var(--pl)', display:'block', marginBottom:8 }} />
          <div style={{ color:'var(--tx)', fontSize:13, fontWeight:600 }}>New Route</div>
          <div style={{ color:'var(--mut)', fontSize:11 }}>Create & pin stops</div>
        </button>
        <button onClick={() => navigate('/owner/riders')} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:'16px 14px', textAlign:'left', cursor:'pointer' }}>
          <i className="ti ti-users" style={{ fontSize:26, color:'var(--pl)', display:'block', marginBottom:8 }} />
          <div style={{ color:'var(--tx)', fontSize:13, fontWeight:600 }}>Riders</div>
          <div style={{ color:'var(--mut)', fontSize:11 }}>{riders.length}/5 accounts</div>
        </button>
      </div>

      {/* Live routes */}
      <div className="section-label">Routes{statusFilter ? ' · filtered' : ''}</div>
      <ViewToggle value={view} onChange={setView} />
      {loading && <div className="spinner" />}
      {view === 'list' && !loading && <RouteTable routes={visibleRoutes} role="route_owner" onRowClick={r => navigate(`/owner/routes/${r.id}`)} emptyText={statusFilter ? 'No routes with this status' : 'No routes yet'} />}
      {view === 'cards' && visibleRoutes.map(r => {
        const pct = r.stop_count ? Math.round(r.delivered_count / r.stop_count * 100) : 0;
        return (
          <div key={r.id} className="card" style={{ marginBottom:12, cursor:'pointer' }} onClick={() => navigate(`/owner/routes/${r.id}`)}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>{r.name}</div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:2 }}>
                  {r.rider_name ? <><i className="ti ti-bike" style={{ fontSize:11 }} /> {r.rider_name}</> : <span style={{ color:'var(--amb)' }}>Unassigned</span>}
                  {' · '}{r.stop_count} stops
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            {r.status !== 'not_started' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--mut)', marginBottom:4 }}>
                  <span>{r.delivered_count}/{r.stop_count} delivered</span>
                  <span style={{ color: pct===100?'var(--grn)':'var(--pl)', fontWeight:700 }}>{pct}%</span>
                </div>
                <div style={{ height:5, background:'var(--el)', borderRadius:3 }}>
                  <div style={{ height:'100%', width:`${pct}%`, background: pct===100?'var(--grn)':'var(--pr)', borderRadius:3, transition:'width 0.5s' }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {view === 'cards' && !loading && visibleRoutes.length === 0 && (
        <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:40 }}>
          <i className="ti ti-map-off" style={{ fontSize:48, display:'block', marginBottom:12 }} />
          {statusFilter ? 'No routes with this status' : 'No routes yet'}
        </div>
      )}
      </div>
    </div>
  );
}
