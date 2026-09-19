export const STATUSES = [
  { key:'not_started', label:'Not started', color:'var(--mut)', icon:'ti-clock' },
  { key:'ongoing',     label:'In progress', color:'var(--amb)', icon:'ti-run' },
  { key:'paused',      label:'Paused',      color:'#F59E0B',    icon:'ti-player-pause' },
  { key:'completed',   label:'Completed',   color:'var(--grn)', icon:'ti-circle-check' },
];

export const routeStatus = r => r.status || 'not_started';

export default function RouteStatusTiles({ routes, value, onChange }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
      {STATUSES.map(st => {
        const active = value === st.key;
        const count = routes.filter(r => routeStatus(r) === st.key).length;
        return (
          <button key={st.key} onClick={() => onChange(active ? null : st.key)}
            style={{ background: active ? `${st.color}22` : 'var(--card)', border:`1px solid ${active ? st.color : 'var(--border)'}`, borderRadius:16, padding:'14px', textAlign:'left', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <i className={`ti ${st.icon}`} style={{ fontSize:24, color:st.color }} />
            <div>
              <div style={{ fontSize:22, fontWeight:700, color:st.color, lineHeight:1 }}>{count}</div>
              <div style={{ fontSize:11, color:'var(--mut)', marginTop:3 }}>{st.label}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
