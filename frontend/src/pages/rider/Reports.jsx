import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { time, day, weekLabel, pct, MUTED, Outcome, StatusText, ReportTabs } from '../../components/ReportBits';

// A rider's own reports (KAN-41), on the phone. Only runs where they were the rider (the server checks).
//   My week       this week's runs, and the routes assigned to me that were not run (after Thu 23:00).
//                 Kept on the phone, so with no signal it shows the last loaded copy and when it was loaded.
//   My history    the last 12 months, newest first, 20 at a time ("Load more")
//   My complaints every complaint against me, withdrawn ones left out
const PAGES = [
  { path:'/rider/reports',            label:'My week' },
  { path:'/rider/reports/history',    label:'My history' },
  { path:'/rider/reports/complaints', label:'My complaints' },
];

const Line = ({ label, children }) => (
  <div style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12, padding:'3px 0' }}>
    <span style={MUTED}>{label}</span><span style={{ textAlign:'right' }}>{children}</span>
  </div>
);
const Empty = ({ children }) => <div style={{ textAlign:'center', color:'var(--mut)', fontSize:13, padding:'24px 0' }}>{children}</div>;
const Error = ({ children }) => <div style={{ color:'var(--red)', fontSize:13, marginBottom:12 }}><i className="ti ti-alert-triangle" /> {children}</div>;

function RunCard({ r, history }) {
  return (
    <div className="card" data-testid="run-card" style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:6 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:14 }}>{r.route_name}</div>
          {history && <div style={{ ...MUTED, fontSize:12 }}>{day(r.started_at, { day:'numeric', month:'short', year:'numeric' })} · Week {r.iso_week}</div>}
        </div>
        <Outcome r={r} />
      </div>
      <Line label="Start">{time(r.started_at)}</Line>
      <Line label="Finish">{r.finished_at ? time(r.finished_at) : '—'}</Line>
      <Line label="Delivered">{r.delivered}/{r.stops} · {pct(r.delivered, r.stops)}</Line>
      {history
        ? <>
            <Line label="On time">{pct(r.on_time, r.delivered)}</Line>
            <Line label="Complaints"><span style={r.complaints ? { color:'var(--red)', fontWeight:600 } : null}>{r.complaints}</span></Line>
          </>
        : <Line label="Not delivered">
            <span data-testid="not-delivered" style={r.not_delivered.length ? { color:'var(--red)' } : null}>
              {r.not_delivered.length ? `Stops ${r.not_delivered.join(', ')}` : r.finished_at ? 'None' : '—'}
            </span>
          </Line>}
    </div>
  );
}

// ── My week ──────────────────────────────────────────────────────────────────
function MyWeek() {
  const { user } = useAuth();
  const cacheKey = `kp_my_week_${user?.id}`;
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyWeek()
      .then(d => { setData(d); try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch { /* storage full or blocked */ } })
      .catch(e => {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(cacheKey)); } catch { /* none */ }
        if (e?.network && cached) { setData(cached); setOffline(true); } else setError(e?.error || 'Could not load your week');
      })
      .finally(() => setLoading(false));
  }, [cacheKey]);

  if (loading) return <div className="spinner" />;
  if (error) return <Error>{error}</Error>;
  const { week, runs, not_run } = data;
  return <>
    {offline && (
      <div data-testid="offline-note" style={{ color:'var(--amb)', fontSize:12, marginBottom:10 }}>
        <i className="ti ti-wifi-off" /> No connection. Showing what was loaded {time(data.loaded_at)}.
      </div>
    )}
    <div className="section-label">{weekLabel(week)}</div>
    {runs.map(r => <RunCard key={r.run_id} r={r} />)}
    {not_run.map(r => (
      <div key={`nr-${r.route_id}`} className="card" data-testid="not-run-card" style={{ marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:600, fontSize:14 }}>{r.route_name}</div>
        <span className="badge badge-not_started">Not run</span>
      </div>
    ))}
    {runs.length + not_run.length === 0 && <Empty>No routes run this week yet</Empty>}
    {!week.finished && <div style={{ ...MUTED, fontSize:11, marginTop:8 }}>Routes you haven't run show as Not run after the window closes on Thursday at 23:00.</div>}
  </>;
}

// ── My history ───────────────────────────────────────────────────────────────
function MyHistory() {
  const [runs, setRuns] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = before => {
    setLoading(true); setError('');
    api.getMyHistory(before)
      .then(d => { setRuns(rs => before ? [...rs, ...d.runs] : d.runs); setMore(d.more); })
      .catch(e => setError(e?.error || 'Could not load your history'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(null); }, []);

  return <>
    <div className="section-label">Last 12 months</div>
    {runs.map(r => <RunCard key={r.run_id} r={r} history />)}
    {!loading && !error && runs.length === 0 && <Empty>No runs in the last 12 months</Empty>}
    {error && <Error>{error}</Error>}
    {loading && <div className="spinner" />}
    {!loading && more && (
      <button className="btn btn-ghost" style={{ width:'100%', marginTop:4 }} onClick={() => load(runs[runs.length - 1].started_at)}>Load more</button>
    )}
  </>;
}

// ── My complaints ────────────────────────────────────────────────────────────
function MyComplaints() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getComplaints().then(setList).catch(e => setError(e?.error || 'Could not load your complaints')); }, []);
  if (error) return <Error>{error}</Error>;
  if (!list) return <div className="spinner" />;
  const at = d => d ? time(d) : '—';
  return <>
    <div className="section-label">{list.length} {list.length === 1 ? 'complaint' : 'complaints'}</div>
    {list.map(c => (
      <div key={c.id} className="card" data-testid="my-complaint" style={{ marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:4 }}>
          <div style={{ fontWeight:600, fontSize:13 }}>{c.route_name ? `${c.route_name}${c.iso_week ? ` · Week ${c.iso_week}` : ''}` : 'Route unknown'}</div>
          <StatusText status={c.status} />
        </div>
        <div style={{ fontSize:12, marginBottom:4 }}>{c.address}</div>
        <Line label="Filed">{at(c.created_at)}</Line>
        <Line label="Accepted">{at(c.accepted_at)}</Line>
        <Line label="Resolved">{at(c.resolved_at)}</Line>
      </div>
    ))}
    {list.length === 0 && <Empty>No complaints against you</Empty>}
  </>;
}

const VIEWS = { '/rider/reports': MyWeek, '/rider/reports/history': MyHistory, '/rider/reports/complaints': MyComplaints };

export default function RiderReports() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const View = VIEWS[pathname] || MyWeek;
  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/rider')}><i className="ti ti-arrow-left" /></button>
        <h3>{PAGES.find(p => p.path === pathname)?.label || 'My week'}</h3>
        <div style={{ width:30 }} />
      </div>
      <div style={{ padding:'0 22px 20px' }}>
        <ReportTabs pages={PAGES} label="My reports" />
        <View key={pathname} />
      </div>
    </div>
  );
}
