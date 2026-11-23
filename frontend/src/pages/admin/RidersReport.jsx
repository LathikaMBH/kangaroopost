import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

// KAN-46: every rider (and route owner with the Rider role) with their owner, cities, routes and last run.
// No email or phone on purpose. Riders have no city of their own: the cities are those of their routes.

const day = d => new Date(d).toLocaleDateString('en-FI', { day:'numeric', month:'short', year:'numeric', timeZone:'Europe/Helsinki' });

const COLUMNS = [['Rider', '1.4fr'], ['Route owner', '1.2fr'], ['Cities', '1.6fr'], ['Routes', '0.6fr'], ['Last ran', '1.3fr'], ['Created', '1fr']];
const GRID = { display:'grid', gridTemplateColumns: COLUMNS.map(([, w]) => w).join(' '), gap:10, alignItems:'center', padding:'10px 14px' };
const MUTED = { color:'var(--mut)' };

export default function RidersReport() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [cityId, setCityId] = useState('');

  useEffect(() => {
    api.getRidersDirectory().then(setRows).catch(e => setError(e?.error || 'Could not load the report')).finally(() => setLoading(false));
  }, []);

  const owners = [...new Map(rows.filter(r => r.owner_id).map(r => [r.owner_id, r.owner_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cities = [...new Map(rows.flatMap(r => r.cities).map(c => [c.id, c])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const shown = rows.filter(r => (!ownerId || r.owner_id === Number(ownerId)) && (!cityId || r.cities.some(c => c.id === Number(cityId))));

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin/reports')}><i className="ti ti-arrow-left" /></button>
        <h3>Riders directory</h3>
        <div style={{ width:30 }} />
      </div>

      <div style={{ padding:'0 22px 20px' }}>
        <div className="admin-narrow" style={{ display:'flex', gap:10, marginBottom:14 }}>
          <select className="input" aria-label="Route owner" style={{ padding:'9px 12px', fontSize:13 }} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            <option value="">All route owners</option>
            {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="input" aria-label="City" style={{ padding:'9px 12px', fontSize:13 }} value={cityId} onChange={e => setCityId(e.target.value)}>
            <option value="">All cities</option>
            {cities.map(c => <option key={c.id} value={c.id}>{c.name}{c.region ? ` (${c.region})` : ''}</option>)}
          </select>
        </div>

        {loading && <div className="spinner" />}
        {error && <div style={{ color:'var(--red)', fontSize:13, marginBottom:12 }}><i className="ti ti-alert-triangle" /> {error}</div>}

        {!loading && !error && (
          <>
            <div className="section-label">{shown.length} {shown.length === 1 ? 'rider' : 'riders'}</div>
            {/* the table scrolls sideways inside its box on a phone; the page itself never does */}
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, overflowX:'auto' }}>
              <div style={{ minWidth:720 }}>
                <div style={{ ...GRID, background:'var(--el)', fontSize:10, fontWeight:600, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                  {COLUMNS.map(([label]) => <span key={label}>{label}</span>)}
                </div>
                {shown.map(r => (
                  <div key={r.id} data-testid="rider-row" style={{ ...GRID, fontSize:12, borderTop:'1px solid var(--border)' }}>
                    <span style={{ fontWeight:600, minWidth:0 }}>
                      {r.name}
                      {r.role === 'route_owner' && <span className="badge badge-not_started" style={{ fontSize:9, padding:'1px 6px', marginLeft:6 }}>Route owner</span>}
                    </span>
                    <span style={r.owner_name ? null : MUTED}>{r.owner_name || '—'}</span>
                    <span style={r.cities.length ? null : MUTED}>{r.cities.map(c => c.name).join(', ') || '—'}</span>
                    <span>{r.route_count}</span>
                    <span style={r.last_run_at ? null : MUTED}>
                      {r.last_run_at ? <>Week {r.last_run_week}, {r.last_run_year}<br /><span style={MUTED}>{day(r.last_run_at)}</span></> : 'Never'}
                    </span>
                    <span>{day(r.created_at)}</span>
                  </div>
                ))}
                {shown.length === 0 && (
                  <div style={{ textAlign:'center', color:'var(--mut)', fontSize:13, padding:'16px 12px', borderTop:'1px solid var(--border)' }}>
                    {rows.length ? 'No riders match these filters' : 'No riders yet'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
