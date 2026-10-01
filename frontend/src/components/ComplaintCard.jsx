// One missed-delivery complaint. Used on the route owner's Complaints page and on the rider's home page.
import { PinIcon, TrashIcon, DELETE_BTN, LOCATE_BTN } from './RowActions';

// Opens Google Maps (the app on phones) with the address pinned
export const googleMapsUrl = address => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// open -> accepted -> resolved
export const COMPLAINT_STATUS = {
  open:     { label:'Open',     color:'var(--red)', bg:'var(--red-tint)',   border:'rgba(194,52,56,0.35)' },
  accepted: { label:'Accepted', color:'var(--amb)', bg:'var(--amber-tint)', border:'rgba(181,114,10,0.35)' },
  resolved: { label:'Resolved', color:'var(--grn)', bg:'var(--grn-tint)',   border:'rgba(28,154,84,0.35)' },
};

const when = d => new Date(d).toLocaleString([], { dateStyle:'medium', timeStyle:'short' });

export function ComplaintBadge({ status }) {
  const s = COMPLAINT_STATUS[status] || COMPLAINT_STATUS.open;
  return <span style={{ fontSize:11, fontWeight:600, color:s.color, background:s.bg, padding:'3px 10px', borderRadius:20, border:`1px solid ${s.border}`, whiteSpace:'nowrap' }}>{s.label}</span>;
}

// Rider: onAccept + onResolve (Accept, then Mark as done). Owner: onResolve (any time before resolved) + onDelete.
export default function ComplaintCard({ complaint: c, showRider, onAccept, onResolve, onDelete, busy, resolveLabel = 'Mark as done' }) {
  const s = COMPLAINT_STATUS[c.status] || COMPLAINT_STATUS.open;
  const action = c.status === 'open' && onAccept ? { label:'Accept', icon:'ti-hand-click', run: onAccept, cls:'btn-primary' }
               : c.status !== 'resolved' && onResolve ? { label: resolveLabel, icon:'ti-check', run: onResolve, cls:'btn-green' }
               : null;
  return (
    <div className="card" style={{ marginBottom:12, borderColor: c.status === 'resolved' ? 'var(--border)' : s.border }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ color:'var(--mut)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Missed delivery</span>
            <ComplaintBadge status={c.status} />
          </div>
          <div style={{ fontWeight:600, fontSize:14, marginTop:6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{c.address}</div>
          <div style={{ color:'var(--mut)', fontSize:12, marginTop:4 }}>
            {showRider ? <><i className="ti ti-bike" style={{ fontSize:11 }} /> {c.rider_name} · </> : c.owner_name ? <>From {c.owner_name} · </> : null}
            {when(c.created_at)}
          </div>
          {c.accepted_at && <div style={{ color:'var(--mut)', fontSize:12, marginTop:2 }}>Accepted {when(c.accepted_at)}</div>}
          {c.resolved_at && <div style={{ color:'var(--mut)', fontSize:12, marginTop:2 }}>Resolved {when(c.resolved_at)}</div>}
        </div>
        <a href={googleMapsUrl(c.address)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm"
          title="Open in Google Maps" aria-label="Open in Google Maps" style={{ ...LOCATE_BTN, width:40, height:40 }}>
          <PinIcon size={20} />
        </a>
      </div>

      {(action || onDelete) && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            {action && (
              <button className={`btn btn-sm ${action.cls}`} style={{ width:'100%' }} disabled={busy} onClick={() => action.run(c)}>
                <i className={`ti ${action.icon}`} style={{ fontSize:15 }} /> {action.label}
              </button>
            )}
          </div>
          {onDelete && (
            <button className="btn btn-danger btn-sm" title="Delete complaint" aria-label="Delete complaint" style={DELETE_BTN} onClick={() => onDelete(c)}>
              <TrashIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
