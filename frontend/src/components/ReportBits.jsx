// Shared pieces of the report pages (admin KAN-14, route owner KAN-13, rider KAN-41): dates in Finnish time, week
// pickers, percentages, the outcome badge, the sideways-scrolling table and the per-rider totals.
import { useNavigate, useLocation } from 'react-router-dom';

export const TZ = { timeZone:'Europe/Helsinki' };
export const day = (d, o) => new Date(d).toLocaleDateString('en-GB', { ...TZ, ...o });
export const time = d => new Date(d).toLocaleString('en-GB', { ...TZ, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
export const weekKey = w => `${w.iso_year}-${w.iso_week}`;
export const weekLabel = w => `Week ${w.iso_week}, ${w.iso_year} · ${day(w.window_start, { day:'numeric', month:'short' })}–${day(w.window_end, { day:'numeric', month:'short' })}${w.finished ? '' : ' (window open)'}`;
export const pct = (n, of) => of ? `${Math.round(n * 100 / of)}%` : '—';
// 2.5 -> "2 h 30 min", 0.25 -> "15 min"
export const hours = h => {
  if (h == null) return '—';
  const m = Math.round(h * 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

export const grid = cols => ({ display:'grid', gridTemplateColumns: cols.map(([, w]) => w).join(' '), gap:8, alignItems:'center', padding:'10px 14px' });
export const HEAD = { background:'var(--el)', fontSize:10, fontWeight:600, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'0.06em' };
export const MUTED = { color:'var(--mut)' };
export const SELECT = { padding:'9px 12px', fontSize:13 };
export const ROW = { fontSize:12, borderTop:'1px solid var(--border)' };
export const TOTAL_ROW = { fontSize:12, fontWeight:700, background:'var(--el)', borderTop:'1.5px solid var(--border)' };

export const OUTCOME_LABEL = { completed:'Completed', force_ended:'Completed (force-ended)', in_progress:'In progress', not_run:'Not run' };
const OUTCOME_BADGE = { completed:'completed', force_ended:'completed', in_progress:'ongoing', not_run:'not_started' };

// outcome of one run, with who force-ended it, the outside-window flag, the attempt and a "time adjusted" marker
export function Outcome({ r }) {
  return (
    <span style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:3 }}>
      <span className={`badge badge-${OUTCOME_BADGE[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</span>
      {r.outcome === 'force_ended' && r.ended_by_name && <span style={{ ...MUTED, fontSize:11 }}>by {r.ended_by_name}</span>}
      {r.outside_window && <span style={{ color:'var(--amb)', fontSize:11 }}>Outside window</span>}
      {r.attempt_count > 1 && <span style={{ ...MUTED, fontSize:11 }}>Attempt {r.attempt} of {r.attempt_count}</span>}
      {r.time_adjusted > 0 && <span style={{ ...MUTED, fontSize:11 }} title="A delivery time from the phone was corrected">Time adjusted</span>}
    </span>
  );
}

export function Table({ columns, minWidth, children }) {
  // the table scrolls sideways inside its box on a phone; the page itself never does
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, overflowX:'auto' }}>
      <div style={{ minWidth }}>
        <div style={{ ...grid(columns), ...HEAD }}>{columns.map(([label]) => <span key={label}>{label}</span>)}</div>
        {children}
      </div>
    </div>
  );
}

export const EmptyRow = ({ children }) => (
  <div style={{ textAlign:'center', color:'var(--mut)', fontSize:13, padding:'16px 12px', borderTop:'1px solid var(--border)' }}>{children}</div>
);

// one delivery week, as ?week=
export function WeekPicker({ weeks, week, onChange }) {
  return (
    <select className="input" aria-label="Week" style={{ ...SELECT, flex:'1 1 240px', maxWidth:320 }} value={weekKey(week)} onChange={e => onChange(e.target.value)}>
      {weeks.map(w => <option key={weekKey(w)} value={weekKey(w)}>{weekLabel(w)}</option>)}
    </select>
  );
}

// a range of delivery weeks, as ?from=&to= (one week: the same in both)
export function WeekRangePicker({ weeks, from, to, onChange }) {
  const short = w => `Week ${w.iso_week}, ${w.iso_year}${w.finished ? '' : ' (open)'}`;
  const pick = (label, value, key) => (
    <select className="input" aria-label={label} style={{ ...SELECT, flex:'1 1 150px', maxWidth:220 }} value={weekKey(value)}
      onChange={e => onChange(key, e.target.value)}>
      {weeks.map(w => <option key={weekKey(w)} value={weekKey(w)}>{short(w)}</option>)}
    </select>
  );
  return <>{pick('From week', from, 'from')}{pick('To week', to, 'to')}</>;
}

export const rangeLabel = (from, to) => weekKey(from) === weekKey(to)
  ? weekLabel(from)
  : `Week ${from.iso_week}, ${from.iso_year} – Week ${to.iso_week}, ${to.iso_year}`;

// Totals for one rider (KAN-47/44): runs, delivered %, on-time %, average run time and complaints.
// The average run time counts only runs the rider finished themselves (a force-ended run's finish is the owner's).
export function riderTotals(runs, complaints) {
  const t = runs.reduce((t, r) => {
    t.runs++; t.stops += r.stops; t.delivered += r.delivered; t.on_time += r.on_time;
    if (r.outcome === 'completed') { t.timed++; t.minutes += (new Date(r.finished_at) - new Date(r.started_at)) / 60000; }
    return t;
  }, { runs:0, stops:0, delivered:0, on_time:0, timed:0, minutes:0 });
  return { ...t, avg_hours: t.timed ? t.minutes / t.timed / 60 : null, complaints: complaints.length };
}

// The values in a rider performance row, after the rider's name (and owner)
export const RiderCells = ({ t }) => <>
  <span>{t.runs}</span>
  <span>{pct(t.delivered, t.stops)}</span>
  <span>{pct(t.on_time, t.delivered)}</span>
  <span style={t.avg_hours == null ? MUTED : null}>{hours(t.avg_hours)}</span>
  <span style={t.complaints ? { color:'var(--red)', fontWeight:600 } : MUTED}>{t.complaints}</span>
</>;

export const STATUS_LABEL = { open:'Open', accepted:'Accepted', resolved:'Resolved', withdrawn:'Withdrawn' };
const STATUS_COLOR = { open:'var(--red)', accepted:'var(--amb)', resolved:'var(--grn)', withdrawn:'var(--mut)' };
export const StatusText = ({ status }) => <span style={{ color: STATUS_COLOR[status], fontWeight:600 }}>{STATUS_LABEL[status]}</span>;

// The switcher at the top of every report page (a phone has no sidebar): pages = [{ path, label }]
export function ReportTabs({ pages, label = 'Reports' }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div role="tablist" aria-label={label} style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
      {pages.map(p => {
        const active = pathname === p.path;
        return (
          <button key={p.path} role="tab" aria-selected={active} onClick={() => navigate(p.path)}
            style={{ padding:'7px 14px', borderRadius:20, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600,
              border:`1px solid ${active ? 'var(--pr)' : 'var(--border)'}`, background: active ? 'var(--pr)' : 'var(--el)', color: active ? '#fff' : 'var(--sub)' }}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
