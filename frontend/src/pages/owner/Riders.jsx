import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import PasswordField, { CredentialsNotice, ResetPassword } from '../../components/PasswordField';
import PhoneInput, { toE164 } from '../../components/PhoneInput';
import { TrashIcon, ACTION_BTN, DELETE_BTN } from '../../components/RowActions';

function RiderEditForm({ rider, onSaved, onCancel }) {
  const [form, setForm] = useState({ name: rider.name || '', email: rider.email || '', phone: toE164(rider.phone || '') });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try { onSaved(await api.updateRider(rider.id, form)); }
    catch (err) { setError(err.error || 'Could not save changes'); setSaving(false); }
  };

  return (
    <form onSubmit={submit} style={{ marginTop:12, padding:14, background:'var(--bg)', border:'1px solid var(--pr)44', borderRadius:14, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--pl)' }}><i className="ti ti-edit" /> Edit rider</div>
      <input className="input" placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
      <input className="input" type="email" placeholder="Email address *" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
      <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
      <div style={{ fontSize:11, color:'var(--mut)' }}>The email is their sign-in name. After changing it they sign in with the new one; their password stays the same.</div>
      {error && <div style={{ color:'var(--red)', fontSize:13 }}>{error}</div>}
      <div style={{ display:'flex', gap:10 }}>
        <button className="btn btn-primary btn-sm" type="submit" style={{ flex:2 }} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
        <button className="btn btn-ghost btn-sm" type="button" style={{ flex:1 }} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function OwnerRiders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [riders, setRiders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', password:'', phone:'' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [saved, setSaved] = useState('');

  const load = () => api.getRiders().then(setRiders);
  useEffect(() => { load(); }, []);

  const createRider = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try {
      await api.createRider(form);
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
      setForm({ name:'', email:'', password:'', phone:'' });
      setShowForm(false); load();
    } catch (err) { setError(err.error || 'Failed to create rider'); }
    finally { setSaving(false); }
  };

  const deleteRider = async (id) => {
    if (!confirm('Remove this rider?')) return;
    await api.deleteRider(id); load();
  };

  const atLimit = riders.length >= 5;

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/owner')}><i className="ti ti-arrow-left" /></button>
        <h3>Riders ({riders.length}/5)</h3>
        <button className="btn btn-sm" style={{ background: atLimit ? 'var(--el)' : 'var(--pr)', color: atLimit ? 'var(--mut)' : '#fff', padding:'8px 12px' }}
          onClick={() => { if (atLimit) return; setCreated(null); setShowForm(!showForm); }} disabled={atLimit}>
          <i className={`ti ti-${showForm?'x':'plus'}`} />
        </button>
      </div>

      <div style={{ padding:'0 22px' }}>
        {/* Limit info */}
        <div style={{ background:'var(--card)', borderRadius:14, padding:'10px 14px', marginBottom:16, border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, color:'var(--mut)' }}>Number of riders belonging to {user?.name}</div>
            <div style={{ height:5, background:'var(--el)', borderRadius:3, marginTop:6 }}>
              <div style={{ height:'100%', width:`${riders.length/5*100}%`, background: atLimit ? 'var(--red)' : 'var(--pr)', borderRadius:3 }} />
            </div>
          </div>
          <div style={{ color: atLimit ? 'var(--red)' : 'var(--pl)', fontWeight:700, fontSize:16 }}>{riders.length}/5</div>
        </div>

        {atLimit && (
          <div style={{ background:'#2A0808', border:'1px solid #541212', borderRadius:12, padding:'10px 14px', color:'#F87171', fontSize:13, marginBottom:16 }}>
            <i className="ti ti-alert-triangle" /> Maximum 5 riders reached. Delete a rider to add a new one.
          </div>
        )}

        {saved && <div style={{ background:'#082E20', border:'1px solid var(--grn)66', color:'var(--grn)', borderRadius:12, padding:'10px 14px', fontSize:13, marginBottom:14 }}><i className="ti ti-circle-check" /> {saved}</div>}
        {created && <CredentialsNotice title="Rider created" email={created.email} password={created.password} onDismiss={() => setCreated(null)} />}

        {/* Create form */}
        {showForm && !atLimit && (
          <div className="card" style={{ marginBottom:20, borderColor:'var(--pr)44' }}>
            <div style={{ color:'var(--pl)', fontWeight:600, fontSize:14, marginBottom:14 }}><i className="ti ti-user-plus" /> Add rider</div>
            <form onSubmit={createRider} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <input className="input" placeholder="Full name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required />
              <input className="input" type="email" placeholder="Email address" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} required />
              <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
              <PasswordField value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} placeholder="Password" />
              {error && <div style={{ color:'var(--red)', fontSize:13 }}>{error}</div>}
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn btn-primary" type="submit" style={{ flex:2 }} disabled={saving}>{saving?'Creating...':'Create Rider'}</button>
                <button className="btn btn-ghost" type="button" style={{ flex:1 }} onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Rider list */}
        {riders.map(r => (
          <div key={r.id} className="card" style={{ marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:48, height:48, borderRadius:16, background:'var(--pr)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:18, flexShrink:0 }}>{r.name[0]}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:15 }}>{r.name}</div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:2, wordBreak:'break-all' }}>{r.email}</div>
                {r.phone && <div style={{ color:'var(--mut)', fontSize:12, marginTop:1 }}><i className="ti ti-phone" style={{ fontSize:11 }} /> {r.phone}</div>}
              </div>
            </div>

            {editFor === r.id && (
              <RiderEditForm rider={r} onCancel={() => setEditFor(null)}
                onSaved={u => { setEditFor(null); setSaved(`Saved. ${u.name} now signs in with ${u.email}`); load(); }} />
            )}
            {resetFor === r.id && <ResetPassword user={r} onSubmit={pw => api.resetPassword('riders', r.id, pw)} onClose={() => setResetFor(null)} />}

            {/* Actions */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:14 }}>
              <div style={{ flex:1, minWidth:0, display:'flex', flexWrap:'wrap', gap:6 }}>
                <button className="btn btn-ghost btn-sm" style={ACTION_BTN} onClick={() => { setSaved(''); setEditFor(id => id === r.id ? null : r.id); }}>
                  <i className="ti ti-edit" style={{ fontSize:13 }} /> Edit
                </button>
                <button className="btn btn-ghost btn-sm" style={ACTION_BTN} onClick={() => setResetFor(id => id === r.id ? null : r.id)}>
                  <i className="ti ti-key" style={{ fontSize:13 }} /> Password
                </button>
              </div>
              <button className="btn btn-danger btn-sm" title="Delete rider" aria-label={`Delete ${r.name}`} style={DELETE_BTN} onClick={() => deleteRider(r.id)}>
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}

        {riders.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:60 }}>
            <i className="ti ti-bike" style={{ fontSize:48, display:'block', marginBottom:12 }} />
            No riders yet — tap + to add one
          </div>
        )}
      </div>
    </div>
  );
}
