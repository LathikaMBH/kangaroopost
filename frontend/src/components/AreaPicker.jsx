import { useState, useEffect } from 'react';
import api from '../services/api';

// Region -> City picker for a route. `cityId` is the chosen city (or null); onChange(cityId) when it changes.
// When only one city exists it is chosen automatically.
export default function AreaPicker({ cityId, onChange, style }) {
  const [areas, setAreas] = useState(null);
  const [regionId, setRegionId] = useState('');

  useEffect(() => { api.getAreas().then(setAreas).catch(() => setAreas([])); }, []);

  // keep the region in step with the chosen city (e.g. when an existing route loads)
  useEffect(() => {
    if (!areas) return;
    const all = areas.flatMap(r => r.cities.map(c => ({ ...c, region_id: r.id })));
    if (cityId) {
      const c = all.find(x => x.id === Number(cityId));
      if (c) setRegionId(String(c.region_id));
    } else if (all.length === 1) {
      setRegionId(String(all[0].region_id));
      onChange(all[0].id);
    }
  }, [areas, cityId]);

  if (!areas) return null;
  if (areas.every(r => r.cities.length === 0)) {
    return <div style={{ fontSize:12, color:'var(--red)', ...style }}>No cities yet. Ask the admin to add your city under Areas.</div>;
  }

  const region = areas.find(r => String(r.id) === regionId);
  const sel = { padding:'9px 12px', fontSize:13, flex:1, minWidth:0 };
  return (
    <div style={{ display:'flex', gap:8, ...style }}>
      <select className="input" style={sel} aria-label="Region" value={regionId}
        onChange={e => { setRegionId(e.target.value); onChange(null); }}>
        <option value="">Region…</option>
        {areas.filter(r => r.cities.length > 0).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className="input" style={{ ...sel, borderColor: cityId ? undefined : 'var(--pr)' }} aria-label="City"
        value={cityId || ''} disabled={!region} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">City…</option>
        {region?.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

// "All cities / Rauma (Satakunta) / …" filter for a route list, built from the routes themselves.
export function CityFilter({ routes, value, onChange }) {
  const cities = [...new Map(routes.filter(r => r.city_id).map(r => [r.city_id, r])).values()]
    .sort((a, b) => a.city_name.localeCompare(b.city_name));
  if (cities.length < 2) return null;
  return (
    <select className="input" aria-label="City" style={{ padding:'9px 12px', fontSize:13, marginBottom:12 }}
      value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">All cities</option>
      {cities.map(r => <option key={r.city_id} value={r.city_id}>{r.city_name} ({r.region_name})</option>)}
    </select>
  );
}

export const areaLabel = r => r.city_name ? `${r.city_name}, ${r.region_name}` : '';
