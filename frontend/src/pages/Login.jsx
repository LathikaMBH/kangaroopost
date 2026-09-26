import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const INPUT_STYLE = { padding:'9px 12px', fontSize:13, borderRadius:10 };
const BUTTON_STYLE = { width:'100%', maxWidth:300, alignSelf:'center', padding:'10px 16px', fontSize:14, borderRadius:10 };
const FIELD_STYLE = { width:'100%', maxWidth:300, alignSelf:'center' };

const LOGO = () => (
  <svg width="72" height="72" viewBox="0 0 36 36">
    <rect width="36" height="36" rx="10" fill="#7C5CEA"/>
    <path d="M18 8C13.6 8 10 11.6 10 16.2C10 21.4 18 29 18 29S26 21.4 26 16.2C26 11.6 22.4 8 18 8Z" fill="#F0EDFF"/>
    <circle cx="18" cy="16" r="5.5" fill="#7C5CEA"/>
    <rect x="15.5" y="14" width="5" height="1.1" rx="0.55" fill="#F0EDFF"/>
    <rect x="15.5" y="15.8" width="5" height="1.1" rx="0.55" fill="#F0EDFF"/>
    <rect x="15.5" y="17.5" width="3.5" height="1.1" rx="0.55" fill="#F0EDFF"/>
  </svg>
);

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const user = await login(email, password);
      if (user.role === 'admin')       navigate('/admin');
      else if (user.role === 'route_owner') navigate('/owner');
      else navigate('/rider');
    } catch (err) { setError(err.error || 'Login failed'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ height:'100%', overflowY:'auto', overscrollBehaviorY:'contain' }}>
    <div style={{ minHeight:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 24px 40px' }}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <LOGO />
        <h1 style={{ marginTop:16 }}>KangarooPost</h1>
        <p style={{ marginTop:6 }}>Precision delivery, every street</p>
      </div>
      <form onSubmit={handleSubmit} style={{ width:'100%', display:'flex', flexDirection:'column', gap:14 }}>
        <div className="field" style={FIELD_STYLE}>
          <label className="label">Email address</label>
          <input className="input" style={INPUT_STYLE} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required />
        </div>
        <div className="field" style={FIELD_STYLE}>
          <label className="label">Password</label>
          <input className="input" style={INPUT_STYLE} type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required />
        </div>
        {error && <div style={{ background:'var(--red-tint)', border:'1px solid #C2343855', borderRadius:12, padding:'10px 14px', color:'var(--red)', fontSize:13 }}><i className="ti ti-alert-triangle" /> {error}</div>}
        <button className="btn btn-primary" style={BUTTON_STYLE} type="submit" disabled={loading}>
          {loading ? 'Signing in...' : <><i className="ti ti-arrow-right" /> Sign In</>}
        </button>
      </form>
      {import.meta.env.DEV && <div style={{ marginTop:24, padding:14, background:'var(--card)', borderRadius:16, border:'1px solid var(--border)', width:'100%', fontSize:12 }}>
        <div style={{ color:'var(--mut)', marginBottom:8, fontWeight:600, fontSize:11, textTransform:'uppercase', letterSpacing:'0.06em' }}>Demo credentials</div>
        <div style={{ color:'var(--sub)' }}>Admin: <span style={{ color:'var(--pl)' }}>admin@kangaroopost.com</span> / <span style={{ color:'var(--pl)' }}>admin123</span></div>
      </div>}
    </div>
    </div>
  );
}
