import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function MasterUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', password:'' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.getUsers().then(setUsers);
  useEffect(() => { load(); }, []);

  const createUser = async (e) => {
    e.preventDefault(); setError(''); setSaving(true);
    try {
      await api.createUser({ ...form, role:'rider' });
      setForm({ name:'', email:'', password:'' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.error || 'Failed to create rider');
    } finally { setSaving(false); }
  };

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/master')}><i className="ti ti-arrow-left" /></button>
        <h3>Riders</h3>
        <button className="btn btn-sm" style={{ background:'#fff', color:'var(--pr)', padding:'8px 12px' }}
          onClick={() => setShowForm(!showForm)}>
          <i className={`ti ti-${showForm?'x':'plus'}`} />
        </button>
      </div>

      <div style={{ padding:'0 22px' }}>
        {/* Create rider form */}
        {showForm && (
          <div className="card" style={{ marginBottom:20, borderColor:'var(--pr)44' }}>
            <div style={{ color:'var(--pl)', fontWeight:600, fontSize:14, marginBottom:14 }}>
              <i className="ti ti-user-plus" /> Add new rider
            </div>
            <form onSubmit={createUser} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <input className="input" placeholder="Full name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required />
              <input className="input" type="email" placeholder="Email address" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} required />
              <input className="input" type="password" placeholder="Password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} required />
              {error && <div style={{ color:'var(--red)', fontSize:13 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Rider Account'}
              </button>
            </form>
          </div>
        )}

        {/* Rider list */}
        {users.map(u => (
          <div key={u.id} className="card" style={{ marginBottom:12, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:50, height:50, borderRadius:18, background:'var(--pr)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:18, flexShrink:0 }}>
              {u.name[0]}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:15 }}>{u.name}</div>
              <div style={{ color:'var(--mut)', fontSize:12, marginTop:3 }}>{u.email}</div>
            </div>
            <span className="badge badge-mailbox" style={{ fontSize:10 }}>
              <i className="ti ti-bike" style={{ fontSize:10 }} /> Rider
            </span>
          </div>
        ))}

        {users.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--mut)', paddingTop:60 }}>
            <i className="ti ti-users" style={{ fontSize:48, display:'block', marginBottom:12 }} />
            No riders yet<br/>
            <span style={{ fontSize:13 }}>Tap + to add one</span>
          </div>
        )}
      </div>
    </div>
  );
}
