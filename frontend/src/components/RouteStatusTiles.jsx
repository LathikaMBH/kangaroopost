export const STATUSES = [
  { key:'not_started', label:'Not started', color:'var(--mut)', tint:'var(--el)',        icon:'ti-clock' },
  { key:'ongoing',     label:'In progress', color:'var(--amb)', tint:'var(--amber-tint)', icon:'ti-run' },
  { key:'paused',      label:'Paused',      color:'var(--apt)', tint:'var(--amber-tint)', icon:'ti-player-pause' },
  { key:'completed',   label:'Completed',   color:'var(--grn)', tint:'var(--grn-tint)',   icon:'ti-circle-check' },
];

export const routeStatus = r => r.status || 'not_started';

// With onChange the tiles are buttons that filter a list; without it they only show the counts.
export default function RouteStatusTiles({ routes, value, onChange }) {
  return (
    <div className="status-tiles">
      {STATUSES.map(st => {
        const active = value === st.key;
        const count = routes.filter(r => routeStatus(r) === st.key).length;
        const Tile = onChange ? 'button' : 'div';
        return (
          <Tile key={st.key} onClick={onChange ? () => onChange(active ? null : st.key) : undefined}
            style={{ background: active ? st.tint : 'var(--card)', border:`1px solid ${active ? st.color : 'var(--border)'}`, borderRadius:16, padding:'14px', textAlign:'left', cursor: onChange ? 'pointer' : 'default', display:'flex', alignItems:'center', gap:12 }}>
            <i className={`ti ${st.icon}`} style={{ fontSize:24, color:st.color }} />
            <div>
              <div style={{ fontSize:22, fontWeight:700, color:st.color, lineHeight:1 }}>{count}</div>
              <div style={{ fontSize:11, color:'var(--mut)', marginTop:3 }}>{st.label}</div>
            </div>
          </Tile>
        );
      })}
    </div>
  );
}
