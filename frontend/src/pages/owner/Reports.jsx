import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import {
  time, day, weekKey, weekLabel, rangeLabel, pct, hours, MUTED, SELECT, Outcome, WeekPicker, WeekRangePicker,
  riderTotals, STATUS_LABEL, StatusText, ReportTabs,
} from '../../components/ReportBits';

// Route owner reports (KAN-13), on the phone: cards rather than wide tables. Only the owner's own routes, riders and
// complaints (the server checks). Each report keeps its week(s) in the address (?week= or ?from=&to=).
//   Weekly summary (KAN-42)  one card per route for a week, with totals
//   Missed stops   (KAN-42)  the stops of a week not delivered, or marked missed
//   Riders         (KAN-44)  one card per own rider for a range of weeks
//   Complaints     (KAN-45)  every complaint filed for a range of weeks, withdrawn ones included
export const OWNER_REPORT_PAGES = [
  { path:'/owner/reports',            label:'Weekly summary' },
  { path:'/owner/reports/missed',     label:'Missed stops' },
  { path:'/owner/reports/riders',     label:'Riders' },
  { path:'/owner/reports/complaints', label:'Complaints' },
];


// loads a report again whenever its ?week / ?from / ?to change
function useReport(load) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = params.toString();
  useEffect(() => {
    setLoading(true); setError('');
    load(params).then(setData).catch(e => setError(e?.error || 'Could not load the report')).finally(() => setLoading(false));
  }, [key]);
  const set = values => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k));
    setParams(next);
  };
  return { data, loading, error, set };
}

const Filters = ({ children }) => <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>{children}</div>;
const FilterSelect = ({ label, value, onChange, all, options }) => (
  <select className="input" aria-label={label} style={{ ...SELECT, flex:'1 1 140px' }} value={value} onChange={e => onChange(e.target.value)}>
    <option value="">{all}</option>
    {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select>
);
const Status = ({ loading, error }) => <>
  {loading && <div className="spinner" />}
  {error && <div style={{ color:'var(--red)', fontSize:13, marginBottom:12 }}><i className="ti ti-alert-triangle" /> {error}</div>}
</>;
const Empty = ({ children }) => <div style={{ textAlign:'center', color:'var(--mut)', fontSize:13, padding:'24px 0' }}>{children}</div>;
const Line = ({ label, children, testid }) => (
  <div data-testid={testid} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12, padding:'3px 0' }}>
    <span style={MUTED}>{label}</span><span style={{ textAlign:'right' }}>{children}</span>
  </div>
);
const Tile = ({ label, value, testid, danger }) => (
  <div data-testid={testid} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'10px 12px' }}>
    <div style={{ fontSize:18, fontWeight:700, color: danger ? 'var(--red)' : 'var(--tx)' }}>{value}</div>
    <div style={{ ...MUTED, fontSize:11 }}>{label}</div>
  </div>
);
const unique = (rows, id, name) => [...new Map(rows.filter(r => r[id] != null).map(r => [r[id], r[name]])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
const OpenWindow = ({ week }) => week && !week.finished
  ? <div style={{ color:'var(--amb)', fontSize:12, marginBottom:10 }}><i className="ti ti-clock" /> This week's delivery window is still open, so "Not run" can still change.</div>
  : null;

// ── KAN-42: weekly delivery summary ──────────────────────────────────────────
function WeeklySummary() {
  const { data, loading, error, set } = useReport(p => api.getOwnerWeekly(p.get('week')));
  const [routeId, setRouteId] = useState('');
  const [riderId, setRiderId] = useState('');
  const routes = data?.routes || [];
  const shown = routes.filter(r => (!routeId || r.route_id === Number(routeId)) && (!riderId || r.rider_id === Number(riderId)));
  const t = shown.reduce((t, r) => {
    t[r.outcome]++; t.stops += r.stops; t.delivered += r.delivered; t.on_time += r.on_time;
    t.not_delivered += r.finished_at ? r.stops - r.delivered : 0; t.complaints += r.complaints_open + r.complaints_resolved;
    return t;
  }, { completed:0, force_ended:0, in_progress:0, not_run:0, stops:0, delivered:0, on_time:0, not_delivered:0, complaints:0 });

  return <>
    {data?.week && (
      <Filters>
        <WeekPicker weeks={data.weeks} week={data.week} onChange={v => set({ week: v })} />
        <FilterSelect label="Route" value={routeId} onChange={setRouteId} all="All routes" options={unique(routes, 'route_id', 'route_name')} />
        <FilterSelect label="Rider" value={riderId} onChange={setRiderId} all="All riders" options={unique(routes, 'rider_id', 'rider_name')} />
      </Filters>
    )}
    <Status loading={loading} error={error} />
    {!loading && !error && data && <>
      <OpenWindow week={data.week} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
        <Tile testid="tile-completed" label="Completed" value={t.completed + t.force_ended} />
        <Tile testid="tile-not-run" label="Not run" value={t.not_run} danger={t.not_run > 0} />
        <Tile testid="tile-in-progress" label="In progress" value={t.in_progress} />
        <Tile testid="tile-delivered" label="Delivered" value={pct(t.delivered, t.stops)} />
        <Tile testid="tile-on-time" label="On time" value={pct(t.on_time, t.delivered)} />
        <Tile testid="tile-complaints" label="Complaints" value={t.complaints} danger={t.complaints > 0} />
      </div>
      <div className="section-label">{shown.length} {shown.length === 1 ? 'route' : 'routes'}</div>
      {shown.map(r => (
        <div key={r.route_id} className="card" data-testid="route-card" style={{ marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:6 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>{r.route_name}</div>
              <div style={{ ...MUTED, fontSize:12 }}><i className="ti ti-bike" style={{ fontSize:11 }} /> {r.rider_name || 'No rider'}</div>
            </div>
            <Outcome r={r} />
          </div>
          <Line label="Start">{r.started_at ? time(r.started_at) : '—'}</Line>
          <Line label="Finish">{r.finished_at ? time(r.finished_at) : '—'}</Line>
          <Line label="Delivered">{r.run_id ? `${r.delivered}/${r.stops} · ${pct(r.delivered, r.stops)}` : '—'}</Line>
          <Line label="On time">{r.run_id ? pct(r.on_time, r.delivered) : '—'}</Line>
          <Line label="Not delivered">{r.finished_at ? r.stops - r.delivered : '—'}</Line>
          <Line label="Complaints">{r.complaints_open} open · {r.complaints_resolved} resolved</Line>
        </div>
      ))}
      {shown.length === 0 && <Empty>{routes.length ? 'No routes match these filters' : 'No routes this week'}</Empty>}
    </>}
  </>;
}

// ── KAN-42: missed stops ─────────────────────────────────────────────────────
function MissedStops() {
  const { data, loading, error, set } = useReport(p => api.getOwnerWeekly(p.get('week')));
  const [routeId, setRouteId] = useState('');
  const [riderId, setRiderId] = useState('');
  const missed = data?.missed || [];
  const shown = missed.filter(s => (!routeId || s.route_id === Number(routeId)) && (!riderId || s.rider_id === Number(riderId)));

  return <>
    {data?.week && (
      <Filters>
        <WeekPicker weeks={data.weeks} week={data.week} onChange={v => set({ week: v })} />
        <FilterSelect label="Route" value={routeId} onChange={setRouteId} all="All routes" options={unique(missed, 'route_id', 'route_name')} />
        <FilterSelect label="Rider" value={riderId} onChange={setRiderId} all="All riders" options={unique(missed, 'rider_id', 'rider_name')} />
      </Filters>
    )}
    <Status loading={loading} error={error} />
    {!loading && !error && data && <>
      <div className="section-label">{shown.length} {shown.length === 1 ? 'stop' : 'stops'}{data.week ? ` · ${weekLabel(data.week)}` : ''}</div>
      {shown.map(s => (
        <div key={`${s.run_id}-${s.stop_id}`} className="card" data-testid="missed-stop" style={{ marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
            <div style={{ fontWeight:600, fontSize:13 }}>{s.route_name} · Stop {s.order_num}</div>
            <span style={{ fontSize:11, ...MUTED }}>{s.type === 'apartment' ? 'Apartment' : 'Mailbox'}</span>
          </div>
          <div style={{ fontSize:12, margin:'4px 0' }}>{s.address || 'No address'}</div>
          <Line label="Rider">{s.rider_name}</Line>
          <Line label="Status">
            {s.missed ? <span style={{ color:'var(--red)' }}>Missed{s.missed_at ? ` ${time(s.missed_at)}` : ''}</span> : <span style={{ color:'var(--red)' }}>Not delivered</span>}
            {s.missed && s.delivered_later && <span style={{ color:'var(--grn)' }}> · delivered later</span>}
          </Line>
        </div>
      ))}
      {shown.length === 0 && <Empty>No missed stops{missed.length ? ' match these filters' : ' this week'}</Empty>}
      <div style={{ ...MUTED, fontSize:11, marginTop:8 }}>
        Stops not delivered on a finished run. Riders will be able to mark a stop missed on the way once KAN-28 is done.
      </div>
    </>}
  </>;
}

// ── KAN-44: rider performance ────────────────────────────────────────────────
function RiderPerformance() {
  const { data, loading, error, set } = useReport(p => api.getOwnerRiderPerformance({ from: p.get('from'), to: p.get('to') }));
  const runs = data?.runs || [], complaints = data?.complaints || [];
  // current riders (zeros when they have no runs), plus anyone who rode the owner's routes since (e.g. a deleted rider)
  const riders = new Map((data?.riders || []).map(r => [r.id, r.name]));
  runs.forEach(r => { if (!riders.has(r.rider_id)) riders.set(r.rider_id, r.rider_name); });
  const rows = [...riders.entries()]
    .map(([id, name]) => ({ id, name, t: riderTotals(runs.filter(r => r.rider_id === id), complaints.filter(c => c.rider_id === id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const range = (key, v) => set({ from: key === 'from' ? v : weekKey(data.from), to: key === 'to' ? v : weekKey(data.to) });

  return <>
    {data?.from && <Filters><WeekRangePicker weeks={data.weeks} from={data.from} to={data.to} onChange={range} /></Filters>}
    <Status loading={loading} error={error} />
    {!loading && !error && data && <>
      <div className="section-label">{rows.length} {rows.length === 1 ? 'rider' : 'riders'}{data.from ? ` · ${rangeLabel(data.from, data.to)}` : ''}</div>
      {rows.map(r => (
        <div key={r.id} className="card" data-testid="rider-card" style={{ marginBottom:10 }}>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{r.name}</div>
          <Line label="Runs">{r.t.runs}</Line>
          <Line label="Delivered">{pct(r.t.delivered, r.t.stops)}</Line>
          <Line label="On time">{pct(r.t.on_time, r.t.delivered)}</Line>
          <Line label="Avg run time">{hours(r.t.avg_hours)}</Line>
          <Line label="Complaints"><span style={r.t.complaints ? { color:'var(--red)', fontWeight:600 } : null}>{r.t.complaints}</span></Line>
        </div>
      ))}
      {rows.length === 0 && <Empty>No riders yet</Empty>}
      <div style={{ ...MUTED, fontSize:11, marginTop:8 }}>
        Runs = your routes the rider started (the last attempt in a week). On time = delivered inside the Tue 18:00 – Thu 23:00
        window. Avg run time counts the runs the rider finished themselves. Withdrawn complaints are not counted.
        Riders see the same figures in their own history.
      </div>
    </>}
  </>;
}

// ── KAN-45: complaints log ───────────────────────────────────────────────────
function ComplaintsLog() {
  const { data, loading, error, set } = useReport(p => api.getOwnerComplaintsLog({ from: p.get('from'), to: p.get('to') }));
  const [status, setStatus] = useState('');
  const [riderId, setRiderId] = useState('');
  const complaints = data?.complaints || [];
  const shown = complaints.filter(c => (!status || c.status === status) && (!riderId || c.rider_id === Number(riderId)));
  const range = (key, v) => set({ from: key === 'from' ? v : weekKey(data.from), to: key === 'to' ? v : weekKey(data.to) });

  return <>
    {data?.from && (
      <Filters>
        <WeekRangePicker weeks={data.weeks} from={data.from} to={data.to} onChange={range} />
        <FilterSelect label="Status" value={status} onChange={setStatus} all="All statuses" options={Object.entries(STATUS_LABEL)} />
        <FilterSelect label="Rider" value={riderId} onChange={setRiderId} all="All riders" options={unique(complaints, 'rider_id', 'rider_name')} />
      </Filters>
    )}
    <Status loading={loading} error={error} />
    {!loading && !error && data && <>
      <div className="section-label">{shown.length} {shown.length === 1 ? 'complaint' : 'complaints'}{data.from ? ` · ${rangeLabel(data.from, data.to)}` : ''}</div>
      {shown.map(c => (
        <div key={c.id} className="card" data-testid="complaint-row" style={{ marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:4 }}>
            <div style={{ fontWeight:600, fontSize:13 }}>{c.route_name ? `${c.route_name}${c.iso_week ? ` · Week ${c.iso_week}` : ''}` : 'Route unknown'}</div>
            <StatusText status={c.status} />
          </div>
          <div style={{ fontSize:12, marginBottom:4 }}>{c.address}</div>
          <Line label="Rider">{c.rider_name}</Line>
          <Line label="Filed">{day(c.created_at, { day:'numeric', month:'short', year:'numeric' })}</Line>
          {c.status === 'withdrawn' && <Line label="Withdrawn">{c.withdrawn_at ? day(c.withdrawn_at, { day:'numeric', month:'short' }) : '—'}{c.withdrawn_by_name ? ` by ${c.withdrawn_by_name}` : ''}</Line>}
          <Line label="Time to resolve">{hours(c.hours_to_resolve)}</Line>
        </div>
      ))}
      {shown.length === 0 && <Empty>{complaints.length ? 'No complaints match these filters' : 'No complaints in these weeks'}</Empty>}
    </>}
  </>;
}

const VIEWS = { '/owner/reports': WeeklySummary, '/owner/reports/missed': MissedStops, '/owner/reports/riders': RiderPerformance, '/owner/reports/complaints': ComplaintsLog };

export default function OwnerReports() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const View = VIEWS[pathname] || WeeklySummary;
  const title = OWNER_REPORT_PAGES.find(p => p.path === pathname)?.label || 'Reports';
  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/owner')}><i className="ti ti-arrow-left" /></button>
        <h3>{title}</h3>
        <div style={{ width:30 }} />
      </div>
      <div style={{ padding:'0 22px 20px' }}>
        <ReportTabs pages={OWNER_REPORT_PAGES} />
        <View key={pathname} />
      </div>
    </div>
  );
}
