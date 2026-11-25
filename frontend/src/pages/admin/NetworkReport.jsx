import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { ReportsNav } from './Reports';
import { time, weekKey, weekLabel, pct, grid, MUTED, SELECT, Outcome, Table } from '../../components/ReportBits';

// KAN-43: one row per route owner for a delivery week, with a total row; click an owner for their routes that week.
// The server sends every route of the week; the totals per owner are worked out here, so the region, city and owner
// filters, the owner rows and the total row always agree. ?week=2026-47&owner=3 keeps the view in the address.
// Missed stops need KAN-28 (riders can't mark a stop missed yet), so that column shows "—" for now.

// totals of some route rows
const total = rows => rows.reduce((t, r) => {
  t.routes++;
  t[r.outcome]++;
  if (r.outside_window) t.outside++;
  if (r.attempt > 1) t.restarted++;
  t.stops += r.stops; t.delivered += r.delivered; t.on_time += r.on_time;
  t.complaints_open += r.complaints_open; t.complaints_resolved += r.complaints_resolved;
  return t;
}, { routes:0, completed:0, force_ended:0, in_progress:0, not_run:0, outside:0, restarted:0, stops:0, delivered:0, on_time:0, complaints_open:0, complaints_resolved:0 });

const OWNER_COLUMNS = [['Route owner', '1.5fr'], ['Cities', '1.3fr'], ['Routes', '0.7fr'], ['Completed', '0.9fr'], ['Force-ended', '0.9fr'],
  ['In progress', '0.8fr'], ['Not run', '0.7fr'], ['Outside window', '0.8fr'], ['Restarted', '0.8fr'], ['Delivered', '0.8fr'],
  ['On time', '0.7fr'], ['Missed', '0.6fr'], ['Open complaints', '0.9fr'], ['Resolved complaints', '0.9fr']];
const ROUTE_COLUMNS = [['Route', '1.5fr'], ['City', '1fr'], ['Rider', '1.2fr'], ['Start', '1.2fr'], ['Finish', '1.2fr'],
  ['Delivered', '1fr'], ['On time', '0.7fr'], ['Missed', '0.6fr'], ['Outcome', '1.6fr'], ['Open complaints', '0.8fr'], ['Resolved complaints', '0.8fr']];

// open = open or accepted; withdrawn ones are not counted
const Complaints = ({ t }) => <>
  <span style={t.complaints_open ? { color:'var(--red)', fontWeight:600 } : MUTED}>{t.complaints_open}</span>
  <span style={t.complaints_resolved ? null : MUTED}>{t.complaints_resolved}</span>
</>;

// the columns after the owner's name; the total row has no cities
const OwnerCells = ({ t, cities }) => <>
  <span style={cities?.length ? null : MUTED}>{cities ? cities.join(', ') || '—' : ''}</span>
  <span>{t.routes}</span>
  <span>{t.completed}</span>
  <span>{t.force_ended}</span>
  <span>{t.in_progress}</span>
  <span style={t.not_run ? { color:'var(--red)', fontWeight:600 } : null}>{t.not_run}</span>
  <span>{t.outside}</span>
  <span>{t.restarted}</span>
  <span>{pct(t.delivered, t.stops)}</span>
  <span>{pct(t.on_time, t.delivered)}</span>
  <span style={MUTED}>—</span>
  <Complaints t={t} />
</>;

export default function NetworkReport() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regionId, setRegionId] = useState('');
  const [cityId, setCityId] = useState('');
  const week = params.get('week');
  const ownerParam = params.get('owner');

  useEffect(() => {
    setLoading(true); setError('');
    api.getNetworkReport(week).then(setData).catch(e => setError(e?.error || 'Could not load the report')).finally(() => setLoading(false));
  }, [week]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  const routes = data?.routes || [];
  const regions = [...new Map(routes.filter(r => r.region_id).map(r => [r.region_id, r.region_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cities = [...new Map(routes.filter(r => r.city_id && (!regionId || r.region_id === Number(regionId))).map(r => [r.city_id, r.city_name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const areaFiltered = !!(regionId || cityId);
  const inArea = routes.filter(r => (!regionId || r.region_id === Number(regionId)) && (!cityId || r.city_id === Number(cityId)));

  // every route owner shows, even with no routes (zeros); with a region or city picked, only those with routes there
  const owners = new Map((data?.owners || []).map(o => [o.id, o.name]));
  routes.forEach(r => { if (r.owner_id != null && !owners.has(r.owner_id)) owners.set(r.owner_id, r.owner_name || 'Unknown owner'); });
  const ownerRows = [...owners.entries()]
    .map(([id, name]) => {
      const rs = inArea.filter(r => r.owner_id === id);
      return { id, name, rows: rs, t: total(rs), cities: [...new Set(rs.map(r => r.city_name).filter(Boolean))].sort() };
    })
    .filter(o => !areaFiltered || o.rows.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownerId = params.get('owners_filter') || '';
  const shownOwners = ownerRows.filter(o => !ownerId || o.id === Number(ownerId));
  const grand = total(shownOwners.flatMap(o => o.rows));
  const detail = ownerParam ? ownerRows.find(o => o.id === Number(ownerParam)) || { id: Number(ownerParam), name: owners.get(Number(ownerParam)) || 'Route owner', rows: [], t: total([]) } : null;


  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => detail ? setParam('owner', null) : navigate('/admin/reports')}><i className="ti ti-arrow-left" /></button>
        <h3>{detail ? detail.name : 'Weekly network'}</h3>
        <div style={{ width:30 }} />
      </div>

      <div style={{ padding:'0 22px 20px' }}>
        <ReportsNav />

        {data && (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            <select className="input" aria-label="Week" style={{ ...SELECT, flex:'1 1 240px', maxWidth:320 }} value={weekKey(data.week)}
              onChange={e => setParam('week', e.target.value)}>
              {data.weeks.map(w => <option key={weekKey(w)} value={weekKey(w)}>{weekLabel(w)}</option>)}
            </select>
            <select className="input" aria-label="Region" style={{ ...SELECT, flex:'1 1 150px', maxWidth:220 }} value={regionId}
              onChange={e => { setRegionId(e.target.value); setCityId(''); }}>
              <option value="">All regions</option>
              {regions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select className="input" aria-label="City" style={{ ...SELECT, flex:'1 1 150px', maxWidth:220 }} value={cityId} onChange={e => setCityId(e.target.value)}>
              <option value="">All cities</option>
              {cities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            {!detail && (
              <select className="input" aria-label="Route owner" style={{ ...SELECT, flex:'1 1 180px', maxWidth:260 }} value={ownerId}
                onChange={e => setParam('owners_filter', e.target.value)}>
                <option value="">All route owners</option>
                {[...owners.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
          </div>
        )}

        {loading && <div className="spinner" />}
        {error && <div style={{ color:'var(--red)', fontSize:13, marginBottom:12 }}><i className="ti ti-alert-triangle" /> {error}</div>}
        {!loading && data && !data.week.finished && (
          <div style={{ color:'var(--amb)', fontSize:12, marginBottom:10 }}><i className="ti ti-clock" /> This week's delivery window is still open, so "Not run" can still change.</div>
        )}

        {!loading && !error && data && !detail && (
          <>
            <div className="section-label">{shownOwners.length} {shownOwners.length === 1 ? 'route owner' : 'route owners'}</div>
            <Table columns={OWNER_COLUMNS} minWidth={1000}>
              {shownOwners.map(o => (
                <button key={o.id} data-testid="owner-row" onClick={() => setParam('owner', String(o.id))}
                  style={{ ...grid(OWNER_COLUMNS), width:'100%', fontSize:12, borderTop:'1px solid var(--border)', borderLeft:'none', borderRight:'none', borderBottom:'none',
                    background:'none', textAlign:'left', fontFamily:'inherit', color:'var(--tx)', cursor:'pointer' }}>
                  <span style={{ fontWeight:600, color:'var(--pl)' }}>{o.name}</span>
                  <OwnerCells t={o.t} cities={o.cities} />
                </button>
              ))}
              {shownOwners.length === 0 && (
                <div style={{ textAlign:'center', color:'var(--mut)', fontSize:13, padding:'16px 12px', borderTop:'1px solid var(--border)' }}>
                  {owners.size ? 'No route owners match these filters' : 'No route owners yet'}
                </div>
              )}
              {shownOwners.length > 0 && (
                <div data-testid="total-row" style={{ ...grid(OWNER_COLUMNS), fontSize:12, fontWeight:700, background:'var(--el)', borderTop:'1.5px solid var(--border)' }}>
                  <span>Total</span>
                  <OwnerCells t={grand} />
                </div>
              )}
            </Table>
            <div style={{ ...MUTED, fontSize:11, marginTop:8 }}>
              Delivered = stops delivered of all stops on the routes that ran. On time = delivered inside the Tue 18:00 – Thu 23:00 window.
              Missed stops will show once riders can mark a stop as missed (KAN-28).
            </div>
          </>
        )}

        {!loading && !error && data && detail && (
          <>
            <div className="section-label">{detail.rows.length} {detail.rows.length === 1 ? 'route' : 'routes'} · {weekLabel(data.week)}</div>
            <Table columns={ROUTE_COLUMNS} minWidth={1000}>
              {detail.rows.map(r => (
                <div key={r.route_id} data-testid="route-row" style={{ ...grid(ROUTE_COLUMNS), fontSize:12, borderTop:'1px solid var(--border)' }}>
                  <span style={{ fontWeight:600 }}>{r.route_name}</span>
                  <span style={r.city_name ? null : MUTED}>{r.city_name || '—'}</span>
                  <span style={r.rider_name ? null : MUTED}>{r.rider_name || '—'}</span>
                  <span style={r.started_at ? null : MUTED}>{r.started_at ? time(r.started_at) : '—'}</span>
                  <span style={r.finished_at ? null : MUTED}>{r.finished_at ? time(r.finished_at) : '—'}</span>
                  <span style={r.run_id ? null : MUTED}>{r.run_id ? `${r.delivered}/${r.stops} · ${pct(r.delivered, r.stops)}` : '—'}</span>
                  <span style={r.run_id ? null : MUTED}>{r.run_id ? pct(r.on_time, r.delivered) : '—'}</span>
                  <span style={MUTED}>—</span>
                  <Outcome r={r} />
                  <Complaints t={r} />
                </div>
              ))}
              {detail.rows.length === 0 && (
                <div style={{ textAlign:'center', color:'var(--mut)', fontSize:13, padding:'16px 12px', borderTop:'1px solid var(--border)' }}>
                  {areaFiltered ? 'No routes in this area' : 'No routes'}
                </div>
              )}
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
