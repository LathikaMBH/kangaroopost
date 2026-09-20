import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import RouteStatusTiles, { STATUSES, routeStatus } from '../../components/RouteStatusTiles';
import RouteTable, { ViewToggle } from '../../components/RouteTable';

export default function RiderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);
  const [view, setView] = useState('cards');

  useEffect(() => {
    const load = () => api.getRoutes().then(setRoutes).catch(() => {}).finally(() => setLoading(false));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const visibleRoutes = statusFilter ? routes.filter(r => routeStatus(r) === statusFilter) : routes;

  return (
    <div className="screen" style={{ padding:'0 22px 20px' }}>
      <div style={{ paddingTop:56, display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <p style={{ fontSize:12, color:'var(--mut)', margin:0 }}>Rider dashboard</p>
          <h2 style={{ fontSize:20 }}>{user?.name}</h2>
        </div>
        <div style={{ width:44, height:44, borderRadius:22, background:'var(--pr)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:18 }}>
          {user?.name?.[0]}
        </div>
      </div>

      <div className="section-label">Route status</div>
      <RouteStatusTiles routes={routes} value={statusFilter} onChange={setStatusFilter} />

      <div className="section-label" style={{ marginTop:10 }}>Your Assigned Routes{statusFilter ? ' · filtered' : ''}</div>

      <ViewToggle value={view} onChange={setView} />
      {loading && <div className="spinner" />}
      {view === 'list' && !loading && <RouteTable routes={visibleRoutes} role="rider" onRowClick={r => navigate(`/rider/navigate/${r.id}`)} emptyText={statusFilter ? 'No routes with this status' : 'No routes assigned yet'} />}

      {view === 'cards' && visibleRoutes.map(r => {
        const mbox = 0; // would need stop details — shown as total for now
        const done = r.delivered_count || 0;
        const total = r.stop_count || 0;
        const pct = total ? Math.round(done/total*100) : 0;

        return (
          <div key={r.id} className="card" style={{ marginBottom:16, border:'1.5px solid var(--pr)44' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ color:'var(--pl)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Assigned route</div>
                <div style={{ fontSize:20, fontWeight:700, marginTop:3 }}>{r.name}</div>
              </div>
              <span className={`badge badge-${r.status}`}>
                {STATUSES.find(x => x.key === routeStatus(r))?.label}
              </span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { icon:'ti-mailbox', label:'Total stops', val:total },
                { icon:'ti-check', label:'Delivered', val:done },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--bg)', borderRadius:14, padding:12, border:'1px solid var(--border)' }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize:20, color:'var(--pl)', display:'block', marginBottom:4 }} />
                  <div style={{ color:'var(--mut)', fontSize:11 }}>{s.label}</div>
                  <div style={{ fontSize:16, fontWeight:700 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {(r.status === 'ongoing' || r.status === 'paused') && (
              <div style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--mut)', marginBottom:6 }}>
                  <span>Progress</span><span style={{ color:'var(--grn)', fontWeight:700 }}>{pct}%</span>
                </div>
                <div style={{ height:6, background:'var(--el)', borderRadius:3 }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:'var(--grn)', borderRadius:3, transition:'width 0.5s' }} />
                </div>
              </div>
            )}

            {r.status === 'completed' && (
              <div style={{ background:'#082E20', borderRadius:12, padding:'12px 16px', color:'var(--grn)', fontWeight:600, textAlign:'center', marginBottom:10 }}>
                <i className="ti ti-circle-check" /> Route Complete!
              </div>
            )}
            <button className="btn btn-green" onClick={() => navigate(`/rider/navigate/${r.id}`)}>
              <i className={`ti ${r.status === 'completed' ? 'ti-refresh' : 'ti-player-play'}`} style={{ fontSize:18 }} />
              {r.status === 'ongoing' || r.status === 'paused' ? 'Continue Route' : r.status === 'completed' ? 'Start Again' : 'Start Route'}
            </button>
          </div>
        );
      })}

      {view === 'cards' && !loading && visibleRoutes.length === 0 && (
        <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:60 }}>
          <i className="ti ti-calendar-off" style={{ fontSize:48, display:'block', marginBottom:12 }} />
          {statusFilter ? 'No routes with this status' : <>No routes assigned yet<br/><span style={{ fontSize:13 }}>Contact your admin</span></>}
        </div>
      )}

      <div className="card" style={{ marginTop:16 }}>
        <div className="section-label" style={{ marginBottom:10 }}>How delivery works</div>
        {[
          ['ti-current-location', '#4285F4', 'Mailboxes auto-detect', 'GPS marks delivered when you ride within 20m'],
          ['ti-building',         'var(--apt)', 'Apartments pause the app', 'Tap Delivered button after going inside'],
          ['ti-rosette-discount-check', 'var(--grn)', 'No tapping for mailboxes', 'Just keep riding — it tracks automatically'],
        ].map(([ic, col, t, s]) => (
          <div key={t} style={{ display:'flex', gap:11, marginBottom:10, alignItems:'flex-start' }}>
            <i className={`ti ${ic}`} style={{ fontSize:18, color:col, flexShrink:0, marginTop:1 }} />
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>{t}</div>
              <div style={{ color:'var(--mut)', fontSize:12 }}>{s}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
