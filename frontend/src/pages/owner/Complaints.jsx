import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import ComplaintCard, { COMPLAINT_STATUS } from '../../components/ComplaintCard';

export default function OwnerComplaints() {
  const navigate = useNavigate();
  const socket = useSocket();
  const [riders, setRiders] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riderId, setRiderId] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [filter, setFilter] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadComplaints = () => api.getComplaints().then(setComplaints);

  useEffect(() => {
    Promise.all([api.getRiders(), api.getComplaints()])
      .then(([ri, c]) => {
        setRiders(ri); setComplaints(c);
        if (ri.length === 1) setRiderId(String(ri[0].id)); // only one rider: pick them
      })
      .finally(() => setLoading(false));
  }, []);

  // the rider accepted one or marked it as done
  useEffect(() => {
    if (!socket) return;
    const events = ['complaint:accepted', 'complaint:resolved'];
    events.forEach(e => socket.on(e, loadComplaints));
    return () => events.forEach(e => socket.off(e, loadComplaints));
  }, [socket]);

  const visible = filter ? complaints.filter(c => c.status === filter) : complaints;

  const submit = async e => {
    e.preventDefault(); setError(''); setSaved(''); setSaving(true);
    try {
      const c = await api.createComplaint({ rider_id: Number(riderId), address });
      setAddress('');
      setSaved(`Complaint sent to ${c.rider_name}`);
      loadComplaints();
    } catch (err) { setError(err.error || 'Could not create complaint'); }
    finally { setSaving(false); }
  };

  // the owner can close a complaint themselves, without waiting for the rider
  const resolve = async c => {
    if (!confirm('Mark this complaint as resolved?')) return;
    setBusyId(c.id);
    try { await api.resolveComplaint(c.id); } catch (err) { alert(err.error || 'Could not resolve the complaint'); }
    finally { setBusyId(null); loadComplaints(); }
  };

  const remove = async c => {
    if (!confirm('Delete this complaint?')) return;
    await api.deleteComplaint(c.id); loadComplaints();
  };

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/owner')}><i className="ti ti-arrow-left" /></button>
        <h3>Complaints</h3>
        <div style={{ width:40 }} />
      </div>

      <div style={{ padding:'0 22px 20px' }}>
        <div className="card" style={{ marginBottom:20, borderColor:'var(--pr)44' }}>
          <div style={{ color:'var(--pl)', fontWeight:600, fontSize:14, marginBottom:14 }}><i className="ti ti-alert-triangle" /> Report a missed delivery</div>
          {!loading && riders.length === 0 ? (
            <div style={{ color:'var(--mut)', fontSize:13 }}>
              You have no riders yet. <a href="/owner/riders" onClick={e => { e.preventDefault(); navigate('/owner/riders'); }} style={{ color:'var(--pl)' }}>Add a rider</a> first.
            </div>
          ) : (
            <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <select className="input" aria-label="Rider" value={riderId} onChange={e => setRiderId(e.target.value)} required>
                <option value="" disabled>Select rider</option>
                {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <textarea className="input" rows={3} placeholder="Address of the missed delivery" value={address}
                onChange={e => setAddress(e.target.value)} maxLength={500} required style={{ resize:'vertical', fontFamily:'inherit' }} />
              {error && <div style={{ color:'var(--red)', fontSize:13 }}>{error}</div>}
              {saved && <div style={{ color:'var(--grn)', fontSize:13 }}><i className="ti ti-circle-check" /> {saved}</div>}
              <button className="btn btn-primary" type="submit" disabled={saving || !riderId || !address.trim()}>
                {saving ? 'Sending...' : 'Send complaint'}
              </button>
            </form>
          )}
        </div>

        <div className="section-label">Sent complaints{filter ? ' · filtered' : ''}</div>
        {/* counts per status; tap one to show only those, tap again for all */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:14 }}>
          {Object.entries(COMPLAINT_STATUS).map(([key, s]) => {
            const on = filter === key;
            return (
              <button key={key} onClick={() => setFilter(on ? null : key)} aria-pressed={on}
                style={{ background: on ? s.bg : 'var(--card)', border:`1.5px solid ${on ? s.color : 'var(--border)'}`, borderRadius:14, padding:'10px 8px', cursor:'pointer', textAlign:'center' }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{complaints.filter(c => c.status === key).length}</div>
                <div style={{ fontSize:11, color:'var(--mut)', fontWeight:600 }}>{s.label}</div>
              </button>
            );
          })}
        </div>
        {loading && <div className="spinner" />}
        {visible.map(c => <ComplaintCard key={c.id} complaint={c} showRider busy={busyId === c.id}
          onResolve={resolve} resolveLabel="Resolve" onDelete={remove} />)}
        {!loading && visible.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:30 }}>
            <i className="ti ti-mood-smile" style={{ fontSize:48, display:'block', marginBottom:12 }} />
            {filter ? `No ${COMPLAINT_STATUS[filter].label.toLowerCase()} complaints` : 'No complaints yet'}
          </div>
        )}
      </div>
    </div>
  );
}
