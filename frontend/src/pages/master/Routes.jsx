import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const StatusBadge = ({ status }) => (
  <span className={`badge badge-${status}`}>
    {{ not_started:'Not started', ongoing:'In progress', paused:'Paused', completed:'Completed' }[status] || 'Not started'}
  </span>
);

export default function MasterRoutes({ base = '/owner' }) {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = () => api.getRoutes().then(setRoutes).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const deleteRoute = async (id, e) => {
    e.stopPropagation();
    const route = routes.find(r => r.id === id);
    const live = route && (route.status === 'ongoing' || route.status === 'paused');
    if (!confirm(live
      ? 'A rider is on this route right now. Deleting it will stop their delivery.\n\nDelete this route and all its stops anyway?'
      : 'Delete this route and all its stops?')) return;
    try { await api.deleteRoute(id); }
    catch (err) { alert(err?.error || 'Could not delete the route'); }
    load();
  };

  const filtered = filter === 'all' ? routes : routes.filter(r => r.status === filter);
  const filters = [
    { k:'all', l:'All' }, { k:'not_started', l:'Not started' },
    { k:'ongoing', l:'In progress' }, { k:'paused', l:'Paused' }, { k:'completed', l:'Completed' }
  ];

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(base)}><i className="ti ti-arrow-left" /></button>
        <h3>Routes</h3>
        <button className="btn btn-sm" style={{ background:'var(--pr)', color:'#fff', padding:'8px 12px' }}
          onClick={() => navigate(`${base}/routes/new`)}>
          <i className="ti ti-plus" />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding:'0 22px 12px' }}>
        <div style={{ background:'var(--el)', borderRadius:14, padding:'11px 14px', display:'flex', alignItems:'center', gap:10, border:'1px solid var(--border)' }}>
          <i className="ti ti-search" style={{ color:'var(--mut)', fontSize:18 }} />
          <span style={{ color:'var(--mut)', fontSize:14 }}>Search routes...</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:8, padding:'0 22px 16px', overflowX:'auto' }}>
        {filters.map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            style={{ padding:'8px 14px', borderRadius:20, border:'none', cursor:'pointer', whiteSpace:'nowrap',
              background: filter===f.k ? 'var(--pr)' : 'var(--el)',
              color: filter===f.k ? '#fff' : 'var(--mut)',
              fontSize:12, fontWeight:500, fontFamily:'inherit' }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Route cards */}
      <div style={{ padding:'0 22px' }}>
        {loading && <div className="spinner" />}
        {filtered.map(r => (
          <div key={r.id} className="card" style={{ marginBottom:14, cursor:'pointer' }} onClick={() => navigate(`${base}/routes/${r.id}`)}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15, color:'var(--tx)' }}>{r.name}</div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:3 }}>
                  {r.rider_name ? <><i className="ti ti-user" style={{ fontSize:11 }} /> {r.rider_name}</> : <span style={{ color:'var(--amb)' }}><i className="ti ti-alert-triangle" style={{ fontSize:11 }} /> Unassigned</span>}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div style={{ display:'flex', gap:16, marginBottom:14 }}>
              <span style={{ color:'var(--sub)', fontSize:13 }}><i className="ti ti-mailbox" style={{ fontSize:12 }} /> {r.stop_count} stops</span>
              {r.delivered_count > 0 && <span style={{ color:'var(--grn)', fontSize:13 }}><i className="ti ti-check" style={{ fontSize:12 }} /> {r.delivered_count} done</span>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={e => { e.stopPropagation(); navigate(`${base}/routes/${r.id}/edit`); }}>
                <i className="ti ti-edit" style={{ fontSize:13 }} /> Edit
              </button>
              <button className="btn btn-ghost btn-sm" style={{ flex:1, color:'var(--pl)' }} onClick={e => { e.stopPropagation(); navigate(`${base}/routes/${r.id}`); }}>
                <i className="ti ti-eye" style={{ fontSize:13 }} /> View
              </button>
              <button className="btn btn-danger btn-sm" onClick={e => deleteRoute(r.id, e)}>
                <i className="ti ti-trash" style={{ fontSize:13 }} />
              </button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:40 }}>
            No routes found
          </div>
        )}
      </div>
    </div>
  );
}
