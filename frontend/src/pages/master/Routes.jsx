import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { CityFilter, areaLabel } from '../../components/AreaPicker';

const StatusBadge = ({ status }) => (
  <span className={`badge badge-${status}`}>
    {{ not_started:'Not started', ongoing:'In progress', paused:'Paused', completed:'Completed' }[status] || 'Not started'}
  </span>
);

export default function MasterRoutes({ base = '/owner' }) {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [filter, setFilter] = useState('all');
  const [cityId, setCityId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState([]);
  const [changing, setChanging] = useState(null); // KAN-52: { id, rider } of the card whose rider is being changed
  const [changeError, setChangeError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.getRoutes().then(setRoutes).finally(() => setLoading(false));
  useEffect(() => { load(); api.getRiders().then(setRiders).catch(() => setRiders([])); }, []);

  const startChange = (r, e) => {
    e.stopPropagation();
    setChangeError('');
    setChanging({ id: r.id, rider: r.rider_id ? String(r.rider_id) : '' });
  };

  // a run in progress stays credited to the rider who started it; the change is logged on the run (KAN-38)
  const saveRider = async (r, e) => {
    e.stopPropagation();
    const rider_id = changing.rider === '' ? null : Number(changing.rider);
    if (rider_id === r.rider_id) { setChanging(null); return; }
    const live = r.status === 'ongoing' || r.status === 'paused';
    if (live && !confirm(`${r.rider_name || 'A rider'} is delivering this route right now. Give it to another rider?`)) return;
    setSaving(true); setChangeError('');
    try {
      const updated = await api.assignRoute(r.id, rider_id);
      setRoutes(rs => rs.map(x => x.id === r.id ? { ...x, ...updated } : x));
      setChanging(null);
    } catch (err) { setChangeError(err?.error || 'Could not change the rider'); }
    finally { setSaving(false); }
  };

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

  const filtered = routes.filter(r => (filter === 'all' || r.status === filter) && (!cityId || r.city_id === cityId));
  const filters = [
    { k:'all', l:'All' }, { k:'not_started', l:'Not started' },
    { k:'ongoing', l:'In progress' }, { k:'paused', l:'Paused' }, { k:'completed', l:'Completed' }
  ];

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(base)}><i className="ti ti-arrow-left" /></button>
        <h3>Routes</h3>
        <button className="btn btn-sm" style={{ background:'#fff', color:'var(--pr)', padding:'8px 12px' }}
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

      <div style={{ padding:'0 22px' }}><CityFilter routes={routes} value={cityId} onChange={setCityId} /></div>

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
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:12 }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontWeight:600, fontSize:15, color:'var(--tx)' }}>{r.name}</div>
                {r.city_name && <div style={{ color:'var(--mut)', fontSize:12, marginTop:3 }}><i className="ti ti-map-pin" style={{ fontSize:11 }} /> {areaLabel(r)}</div>}
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:3 }}>
                  {r.rider_name ? <><i className="ti ti-user" style={{ fontSize:11 }} /> {r.rider_name}</> : <span style={{ color:'var(--amb)' }}><i className="ti ti-alert-triangle" style={{ fontSize:11 }} /> Unassigned</span>}
                </div>
              </div>
              {/* stacked, so the route name keeps its width on a phone */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
                <StatusBadge status={r.status} />
                <button className="btn btn-ghost btn-sm" style={{ padding:'4px 10px', fontSize:11, borderRadius:20 }}
                  aria-label={`Change rider of ${r.name}`} onClick={e => startChange(r, e)}>
                  <i className="ti ti-user-edit" style={{ fontSize:13 }} /> Change rider
                </button>
              </div>
            </div>
            {changing?.id === r.id && (
              <div onClick={e => e.stopPropagation()} style={{ marginBottom:14 }}>
                <select className="input" aria-label="Rider" value={changing.rider} autoFocus
                  onChange={e => setChanging({ ...changing, rider: e.target.value })} style={{ padding:'10px 12px', fontSize:14 }}>
                  <option value="">Unassigned</option>
                  {riders.map(rd => <option key={rd.id} value={rd.id}>{rd.name}</option>)}
                </select>
                {changeError && <div style={{ color:'var(--red)', fontSize:13, marginTop:8 }}>{changeError}</div>}
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex:1 }} disabled={saving} onClick={e => saveRider(r, e)}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={e => { e.stopPropagation(); setChanging(null); }}>Cancel</button>
                </div>
              </div>
            )}
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
