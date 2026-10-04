import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { TrashIcon, PlusIcon, DELETE_BTN } from '../../components/RowActions';

// one-line "name + Add" form, used for new regions and new cities
function AddForm({ placeholder, onAdd }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await onAdd(name.trim()); setName(''); }
    catch (err) { alert(err?.error || 'Could not add it'); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ display:'flex', gap:8 }}>
      <input className="input" style={{ flex:1, padding:'9px 12px', fontSize:13 }} placeholder={placeholder} value={name} onChange={e => setName(e.target.value)} />
      <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !name.trim()} style={{ width:'auto', padding:'0 14px', gap:4 }}>
        <PlusIcon /> Add
      </button>
    </form>
  );
}

const ICON_BTN = { flex:'0 0 auto', width:34, height:32, padding:0, borderRadius:10 };

export default function AdminAreas() {
  const navigate = useNavigate();
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.getAreas().then(setAreas).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // run an API call, show its error if it fails, then reload the list
  const act = async fn => {
    try { await fn(); }
    catch (err) { alert(err?.error || 'Something went wrong'); }
    load();
  };

  const rename = (current, save) => {
    const name = prompt('New name', current);
    if (name && name.trim() && name.trim() !== current) act(() => save(name.trim()));
  };

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin')}><i className="ti ti-arrow-left" /></button>
        <h3>Areas</h3>
        <div style={{ width:30 }} />
      </div>

      <div style={{ padding:'0 22px 20px' }}>
        <p style={{ fontSize:12, color:'var(--mut)', marginBottom:12 }}>
          Every route is in a city, and every city is in a region. Route owners choose from these when they create a route.
        </p>
        <div style={{ marginBottom:20 }}>
          <AddForm placeholder="New region, e.g. Satakunta" onAdd={name => api.createRegion(name).then(load)} />
        </div>

        {loading && <div className="spinner" />}
        {areas.map(region => (
          <div key={region.id} className="card" style={{ marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:15 }}>{region.name}</div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:2 }}>
                  {region.cities.length} {region.cities.length === 1 ? 'city' : 'cities'} · {region.cities.reduce((n, c) => n + c.route_count, 0)} routes
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" title="Rename region" aria-label={`Rename ${region.name}`} style={ICON_BTN}
                onClick={() => rename(region.name, name => api.renameRegion(region.id, name))}>
                <i className="ti ti-edit" style={{ fontSize:14 }} />
              </button>
              <button className="btn btn-danger btn-sm" title="Delete region" aria-label={`Delete ${region.name}`} style={DELETE_BTN}
                onClick={() => confirm(`Delete the region "${region.name}"?`) && act(() => api.deleteRegion(region.id))}>
                <TrashIcon />
              </button>
            </div>

            {region.cities.map(city => (
              <div key={city.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderTop:'1px solid var(--border)' }}>
                <i className="ti ti-map-pin" style={{ color:'var(--pl)', fontSize:14 }} />
                <div style={{ flex:1, minWidth:0, fontSize:13, fontWeight:500 }}>{city.name}</div>
                <span style={{ fontSize:12, color:'var(--mut)' }}>{city.route_count} routes</span>
                <button className="btn btn-ghost btn-sm" title="Rename city" aria-label={`Rename ${city.name}`} style={ICON_BTN}
                  onClick={() => rename(city.name, name => api.updateCity(city.id, { name }))}>
                  <i className="ti ti-edit" style={{ fontSize:14 }} />
                </button>
                <button className="btn btn-danger btn-sm" title="Delete city" aria-label={`Delete ${city.name}`} style={DELETE_BTN}
                  onClick={() => confirm(`Delete the city "${city.name}"?`) && act(() => api.deleteCity(city.id))}>
                  <TrashIcon />
                </button>
              </div>
            ))}

            <div style={{ paddingTop:10, borderTop:'1px solid var(--border)' }}>
              <AddForm placeholder={`New city in ${region.name}`} onAdd={name => api.createCity(region.id, name).then(load)} />
            </div>
          </div>
        ))}
        {!loading && areas.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:40 }}>No regions yet. Add the first one above.</div>
        )}
      </div>
    </div>
  );
}
