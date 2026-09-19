import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import PasswordField, { CredentialsNotice, ResetPassword } from '../../components/PasswordField';
import PhoneInput, { toE164 } from '../../components/PhoneInput';
import { TrashIcon, ACTION_BTN, DELETE_BTN } from '../../components/RowActions';

function OwnerForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ name:'', email:'', password:'', city:'', phone:'' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try { await onSave(form); }
    catch (err) { setError(err.error || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginBottom:20, borderColor:'var(--pr)44' }}>
      <div style={{ color:'var(--pl)', fontWeight:600, fontSize:14, marginBottom:16 }}>
        <i className="ti ti-user-plus" /> New Route Owner
      </div>
      <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <input className="input" placeholder="Full name *" value={form.name} onChange={f('name')} required />
          <input className="input" placeholder="City" value={form.city} onChange={f('city')} />
        </div>
        <PhoneInput value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} />
        <input className="input" type="email" placeholder="Email address *" value={form.email} onChange={f('email')} required />
        <PasswordField value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} />
        {error && <div style={{ color:'var(--red)', fontSize:13 }}>{error}</div>}
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-primary" type="submit" style={{ flex:2 }} disabled={saving}>
            {saving ? 'Creating...' : 'Create Route Owner'}
          </button>
          <button className="btn btn-ghost" type="button" style={{ flex:1 }} onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function OwnerEditForm({ owner, onSaved, onCancel }) {
  const [form, setForm] = useState({ name: owner.name || '', email: owner.email || '', phone: toE164(owner.phone || ''), city: owner.city || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try { onSaved(await api.updateOwner(owner.id, form)); }
    catch (err) { setError(err.error || 'Could not save changes'); setSaving(false); }
  };

  return (
    <form onSubmit={submit} style={{ marginTop:12, padding:14, background:'var(--bg)', border:'1px solid var(--pr)44', borderRadius:14, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--pl)' }}><i className="ti ti-edit" /> Edit route owner</div>
      <input className="input" placeholder="Full name *" value={form.name} onChange={f('name')} required />
      <input className="input" type="email" placeholder="Email address *" value={form.email} onChange={f('email')} required />
      <PhoneInput value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} />
      {owner.phone && !owner.phone.startsWith('+') && (
        <div style={{ fontSize:11, color:'var(--amb)' }}>The saved number ({owner.phone}) had no country code. +358 (Finland) was assumed. Please check it.</div>
      )}
      <input className="input" placeholder="City" value={form.city} onChange={f('city')} />
      <div style={{ fontSize:11, color:'var(--mut)' }}>The email is their sign-in name. After changing it they sign in with the new one; their password stays the same.</div>
      {error && <div style={{ color:'var(--red)', fontSize:13 }}>{error}</div>}
      <div style={{ display:'flex', gap:10 }}>
        <button className="btn btn-primary btn-sm" type="submit" style={{ flex:2 }} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
        <button className="btn btn-ghost btn-sm" type="button" style={{ flex:1 }} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function AdminOwners() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [riderMap, setRiderMap] = useState({});
  const [created, setCreated] = useState(null);
  const [resetFor, setResetFor] = useState(null); // 'owners:<id>' or 'riders:<id>'
  const toggleReset = key => setResetFor(k => k === key ? null : key);
  const [editFor, setEditFor] = useState(null); // owner id
  const [saved, setSaved] = useState('');

  const load = () => api.getOwners().then(setOwners).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const createOwner = async (form) => {
    await api.createOwner(form);
    setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
    setShowForm(false);
    load();
  };

  const deleteOwner = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this route owner and all their data?')) return;
    await api.deleteOwner(id);
    load();
  };

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!riderMap[id]) {
      const riders = await api.getOwnerRiders(id);
      setRiderMap(p => ({ ...p, [id]: riders }));
    }
  };

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin')}><i className="ti ti-arrow-left" /></button>
        <h3>Route Owners</h3>
        <button className="btn btn-sm" style={{ background:'var(--pr)', color:'#fff', padding:'8px 12px' }}
          onClick={() => { setCreated(null); setShowForm(!showForm); }}>
          <i className={`ti ti-${showForm?'x':'plus'}`} />
        </button>
      </div>

      <div style={{ padding:'0 22px' }}>
        {saved && <div style={{ background:'#082E20', border:'1px solid var(--grn)66', color:'var(--grn)', borderRadius:12, padding:'10px 14px', fontSize:13, marginBottom:14 }}><i className="ti ti-circle-check" /> {saved}</div>}
        {created && <CredentialsNotice title="Route owner created" email={created.email} password={created.password} onDismiss={() => setCreated(null)} />}
        {showForm && <OwnerForm onSave={createOwner} onCancel={() => setShowForm(false)} />}

        {loading && <div className="spinner" />}

        {owners.map(o => (
          <div key={o.id} className="card" style={{ marginBottom:14 }}>
            {/* Owner header */}
            <div style={{ display:'flex', alignItems:'center', gap:14, cursor:'pointer' }} onClick={() => toggleExpand(o.id)}>
              <div style={{ width:48, height:48, borderRadius:16, background:'var(--pr)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:18, flexShrink:0 }}>{o.name[0]}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:15 }}>{o.name}</div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:2 }}>
                  {o.email}
                </div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:1 }}>
                  {o.city && <><i className="ti ti-map-pin" style={{ fontSize:11 }} /> {o.city} · </>}
                  {o.phone && <><i className="ti ti-phone" style={{ fontSize:11 }} /> {o.phone}</>}
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ color:'var(--pl)', fontWeight:700, fontSize:14 }}>{o.route_count} routes</div>
                <div style={{ color:'var(--mut)', fontSize:11 }}>{o.rider_count}/5 riders</div>
                <i className={`ti ti-chevron-${expanded===o.id?'up':'down'}`} style={{ color:'var(--mut)', fontSize:14 }} />
              </div>
            </div>

            {/* Expanded: riders */}
            {expanded === o.id && (
              <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
                <div className="section-label" style={{ marginBottom:8 }}>Riders</div>
                {(riderMap[o.id] || []).length === 0 && <div style={{ color:'var(--mut)', fontSize:13 }}>No riders yet</div>}
                {(riderMap[o.id] || []).map(r => (
                  <div key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:'var(--el)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--pl)', fontWeight:700, fontSize:14, flexShrink:0 }}>{r.name[0]}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{r.name}</div>
                      <div style={{ fontSize:11, color:'var(--mut)' }}>{r.email}{r.phone && ` · ${r.phone}`}</div>
                    </div>
                    <span className="badge badge-mailbox" style={{ fontSize:10 }}><i className="ti ti-bike" style={{ fontSize:10 }} /> Rider</span>
                    <button className="btn btn-ghost btn-sm" title="Reset password" aria-label={`Reset password for ${r.name}`} style={{ padding:'6px 10px' }} onClick={() => toggleReset(`riders:${r.id}`)}>
                      <i className="ti ti-key" style={{ fontSize:14 }} />
                    </button>
                  </div>
                  {resetFor === `riders:${r.id}` && (
                    <div style={{ paddingBottom:10 }}><ResetPassword user={r} onSubmit={pw => api.resetPassword('riders', r.id, pw)} onClose={() => setResetFor(null)} /></div>
                  )}
                  </div>
                ))}
              </div>
            )}

            {editFor === o.id && (
              <OwnerEditForm owner={o} onCancel={() => setEditFor(null)}
                onSaved={u => { setEditFor(null); setSaved(`Saved. ${u.name} now signs in with ${u.email}`); load(); }} />
            )}
            {resetFor === `owners:${o.id}` && (
              <ResetPassword user={o} onSubmit={pw => api.resetPassword('owners', o.id, pw)} onClose={() => setResetFor(null)} />
            )}

            {/* Actions */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:14 }}>
              <div style={{ flex:1, minWidth:0, display:'flex', flexWrap:'wrap', gap:6 }}>
              <button className="btn btn-ghost btn-sm" style={ACTION_BTN} onClick={() => toggleExpand(o.id)}>
                <i className="ti ti-users" style={{ fontSize:13 }} /> {expanded===o.id?'Hide':'Riders'}
              </button>
              <button className="btn btn-ghost btn-sm" style={ACTION_BTN} onClick={() => navigate(`/admin/routes?owner=${o.id}`)}>
                <i className="ti ti-map-2" style={{ fontSize:13 }} /> Routes
              </button>
              <button className="btn btn-ghost btn-sm" style={ACTION_BTN} onClick={() => { setSaved(''); setEditFor(id => id === o.id ? null : o.id); }}>
                <i className="ti ti-edit" style={{ fontSize:13 }} /> Edit
              </button>
              <button className="btn btn-ghost btn-sm" style={ACTION_BTN} onClick={() => toggleReset(`owners:${o.id}`)}>
                <i className="ti ti-key" style={{ fontSize:13 }} /> Password
              </button>
              </div>
              <button className="btn btn-danger btn-sm" title="Delete owner" aria-label="Delete owner" style={DELETE_BTN} onClick={e => deleteOwner(o.id, e)}>
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}

        {!loading && owners.length === 0 && !showForm && (
          <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:60 }}>
            <i className="ti ti-users-group" style={{ fontSize:48, display:'block', marginBottom:12 }} />
            No route owners yet
          </div>
        )}
      </div>
    </div>
  );
}
