import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { ReportsNav } from './Reports';
import { weekKey, rangeLabel, grid, hours, MUTED, SELECT, ROW, TOTAL_ROW, Table, EmptyRow, WeekRangePicker } from '../../components/ReportBits';

// KAN-48: complaints of a range of weeks counted by status (open, accepted, resolved, withdrawn), with the average time
// to resolve, per route owner and per city, each with a total row. A complaint belongs to its delivery week, or, when it
// has none (filed before complaints had a route), to the week it was filed in; those have no city ("Unknown city").
// ?from=2026-40&to=2026-47 keeps the weeks in the address.

const STATUSES = ['open', 'accepted', 'resolved', 'withdrawn'];
const columns = first => [[first, '1.6fr'], ['Total', '0.6fr'], ['Open', '0.6fr'], ['Accepted', '0.8fr'], ['Resolved', '0.8fr'],
  ['Withdrawn', '0.8fr'], ['Avg time to resolve', '1.1fr']];

const count = list => {
  const t = { total: list.length, open:0, accepted:0, resolved:0, withdrawn:0, resolvedHours:0 };
  list.forEach(c => { t[c.status]++; if (c.hours_to_resolve != null) t.resolvedHours += c.hours_to_resolve; });
  return { ...t, avg: t.resolved ? t.resolvedHours / t.resolved : null };
};

const Cells = ({ t }) => <>
  <span>{t.total}</span>
  {STATUSES.map(s => <span key={s} style={t[s] ? (s === 'open' ? { color:'var(--red)', fontWeight:600 } : null) : MUTED}>{t[s]}</span>)}
  <span style={t.avg == null ? MUTED : null}>{hours(t.avg)}</span>
</>;

function Breakdown({ title, testid, groups }) {
  const cols = columns(title);
  const all = count(groups.flatMap(g => g.list));
  return (
    <Table columns={cols} minWidth={720}>
      {groups.map(g => (
        <div key={g.key} data-testid={testid} style={{ ...grid(cols), ...ROW }}>
          <span style={{ fontWeight:600, ...(g.unknown ? MUTED : null) }}>{g.name}</span>
          <Cells t={count(g.list)} />
        </div>
      ))}
      {groups.length === 0 && <EmptyRow>No complaints in these weeks</EmptyRow>}
      {groups.length > 0 && <div data-testid={`${testid}-total`} style={{ ...grid(cols), ...TOTAL_ROW }}><span>Total</span><Cells t={all} /></div>}
    </Table>
  );
}

const groupBy = (list, key, name, unknownName) => [...list.reduce((m, c) => {
  const k = c[key] ?? 'none';
  if (!m.has(k)) m.set(k, { key: k, name: c[key] == null ? unknownName : c[name] || unknownName, unknown: c[key] == null, list: [] });
  m.get(k).list.push(c);
  return m;
}, new Map()).values()].sort((a, b) => (a.unknown - b.unknown) || a.name.localeCompare(b.name));

export default function ComplaintsReport() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [cityId, setCityId] = useState('');
  const from = params.get('from'), to = params.get('to');

  useEffect(() => {
    setLoading(true); setError('');
    api.getComplaintsOverview({ from, to }).then(setData).catch(e => setError(e?.error || 'Could not load the report')).finally(() => setLoading(false));
  }, [from, to]);

  const setRange = (key, value) => {
    const next = new URLSearchParams(params);
    next.set('from', key === 'from' ? value : weekKey(data.from));
    next.set('to', key === 'to' ? value : weekKey(data.to));
    setParams(next);
  };

  const complaints = data?.complaints || [];
  const cities = [...new Map(complaints.filter(c => c.city_id && c.city_name).map(c => [c.city_id, c.city_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = complaints.filter(c => (!ownerId || c.owner_id === Number(ownerId)) && (!cityId || c.city_id === Number(cityId)));

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin/reports')}><i className="ti ti-arrow-left" /></button>
        <h3>Complaints</h3>
        <div style={{ width:30 }} />
      </div>

      <div style={{ padding:'0 22px 20px' }}>
        <ReportsNav />

        {data?.from && (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            <WeekRangePicker weeks={data.weeks} from={data.from} to={data.to} onChange={setRange} />
            <select className="input" aria-label="Route owner" style={{ ...SELECT, flex:'1 1 180px', maxWidth:260 }} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">All route owners</option>
              {data.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className="input" aria-label="City" style={{ ...SELECT, flex:'1 1 150px', maxWidth:220 }} value={cityId} onChange={e => setCityId(e.target.value)}>
              <option value="">All cities</option>
              {cities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        )}

        {loading && <div className="spinner" />}
        {error && <div style={{ color:'var(--red)', fontSize:13, marginBottom:12 }}><i className="ti ti-alert-triangle" /> {error}</div>}

        {!loading && !error && data && (
          <>
            <div className="section-label">
              By route owner · {shown.length} {shown.length === 1 ? 'complaint' : 'complaints'}{data.from ? ` · ${rangeLabel(data.from, data.to)}` : ''}
            </div>
            <Breakdown title="Route owner" testid="owner-row" groups={groupBy(shown, 'owner_id', 'owner_name', 'Unknown owner')} />
            <div className="section-label" style={{ marginTop:18 }}>By city</div>
            <Breakdown title="City" testid="city-row" groups={groupBy(shown, 'city_id', 'city_name', 'Unknown city')} />
            <div style={{ ...MUTED, fontSize:11, marginTop:8 }}>
              Avg time to resolve = from filing to resolved, over the resolved complaints. "Unknown city" = complaints filed before
              complaints were linked to a route.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
