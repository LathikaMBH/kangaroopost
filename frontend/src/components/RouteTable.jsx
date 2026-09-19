import { STATUSES, routeStatus } from './RouteStatusTiles';

const COLUMNS = {
  admin:       [['Route', 'name'], ['No.', 'number'], ['Owner', 'owner'], ['Rider', 'rider'], ['Status', 'status']],
  route_owner: [['Route', 'name'], ['No.', 'number'], ['Rider', 'rider'], ['Status', 'status']],
  rider:       [['Route', 'name'], ['No.', 'number'], ['Status', 'status']],
};

const SIZES = { name:'1.6fr', number:'0.6fr', owner:'1.1fr', rider:'1.1fr', status:'1.2fr' };

const Cell = ({ col, r }) => {
  if (col === 'status') {
    const st = STATUSES.find(s => s.key === routeStatus(r));
    return <span style={{ fontSize:10, fontWeight:600, color:st.color, background:`${st.color}18`, border:`1px solid ${st.color}44`, padding:'2px 8px', borderRadius:20, whiteSpace:'nowrap' }}>{st.label}</span>;
  }
  const v = col === 'name' ? r.name : col === 'number' ? `#${r.id}` : col === 'owner' ? r.owner_name : r.rider_name;
  return <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: v ? 'var(--tx)' : 'var(--mut)', fontWeight: col === 'name' ? 600 : 400 }}>{v || '—'}</span>;
};

export default function RouteTable({ routes, role, onRowClick, emptyText = 'No routes found' }) {
  const cols = COLUMNS[role] || COLUMNS.rider;
  const grid = { display:'grid', gridTemplateColumns: cols.map(([, k]) => SIZES[k]).join(' '), gap:8, alignItems:'center', padding:'10px 12px' };
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', marginBottom:16 }}>
      <div style={{ ...grid, background:'var(--el)', fontSize:10, fontWeight:600, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {cols.map(([label, k]) => <span key={k}>{label}</span>)}
      </div>
      {routes.map(r => (
        <div key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined}
          style={{ ...grid, fontSize:12, borderTop:'1px solid var(--border)', cursor: onRowClick ? 'pointer' : 'default' }}>
          {cols.map(([, k]) => <Cell key={k} col={k} r={r} />)}
        </div>
      ))}
      {routes.length === 0 && <div style={{ textAlign:'center', color:'var(--mut)', fontSize:13, padding:'16px 12px', borderTop:'1px solid var(--border)' }}>{emptyText}</div>}
    </div>
  );
}

export function ViewToggle({ value, onChange }) {
  return (
    <div style={{ display:'inline-flex', background:'var(--el)', borderRadius:12, padding:3, marginBottom:12, border:'1px solid var(--border)' }}>
      {[['cards', 'ti-layout-cards', 'Cards'], ['list', 'ti-list', 'List']].map(([k, ic, l]) => (
        <button key={k} onClick={() => onChange(k)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', border:'none', borderRadius:9, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:500,
            background: value === k ? 'var(--pr)' : 'transparent', color: value === k ? '#fff' : 'var(--mut)' }}>
          <i className={`ti ${ic}`} /> {l}
        </button>
      ))}
    </div>
  );
}
