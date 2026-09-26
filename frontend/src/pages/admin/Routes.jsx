import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';

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

export default function AdminRoutes() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const filterOwner = params.get('owner');
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRoutes().then(r => setRoutes(filterOwner ? r.filter(x => String(x.owner_id) === filterOwner) : r))
      .finally(() => setLoading(false));
  }, [filterOwner]);

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin')}><i className="ti ti-arrow-left" /></button>
        <h3>All Routes {filterOwner ? '(filtered)' : ''}</h3>
        <div style={{ width:30 }} />
      </div>
      <div style={{ padding:'0 22px' }}>
        {loading && <div className="spinner" />}
        {routes.map(r => (
          <div key={r.id} className="card" style={{ marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15 }}>{r.name}</div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:3 }}>
                  Owner: <span style={{ color:'var(--pl)' }}>{r.owner_name || '—'}</span>
                  {r.rider_name && <> · Rider: <span style={{ color:'var(--sub)' }}>{r.rider_name}</span></>}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div style={{ display:'flex', gap:16 }}>
              <span style={{ color:'var(--sub)', fontSize:13 }}><i className="ti ti-mailbox" style={{ fontSize:12 }} /> {r.stop_count} stops</span>
              <span style={{ color:'var(--grn)', fontSize:13 }}><i className="ti ti-check" style={{ fontSize:12 }} /> {r.delivered_count} done</span>
              {r.stop_count > 0 && <span style={{ color:'var(--pl)', fontSize:13 }}>{Math.round(r.delivered_count/r.stop_count*100)}%</span>}
            </div>
          </div>
        ))}
        {!loading && routes.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:60 }}>No routes found</div>
        )}
      </div>
    </div>
  );
}
