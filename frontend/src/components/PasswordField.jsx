import { useState } from 'react';

// No look-alike characters (0/O, 1/l/I) so passwords are easy to read out or type
const LOWER = 'abcdefghijkmnopqrstuvwxyz', UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ', DIGITS = '23456789', SYMBOLS = '!@#$%&*?';

function randInt(max) {
  const limit = Math.floor(0x100000000 / max) * max; // avoid modulo bias
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}
const pick = set => set[randInt(set.length)];

export function generatePassword(length = 10) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = randInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch { return false; }
  }
}

const smallBtn = { background:'var(--el)', border:'1px solid var(--border)', borderRadius:12, color:'var(--pl)', cursor:'pointer', padding:'8px 12px', fontFamily:'inherit', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' };
const mono = 'ui-monospace, Menlo, Consolas, monospace';

export default function PasswordField({ value, onChange, placeholder = 'Password *', defaultShow = false }) {
  const [show, setShow] = useState(defaultShow);
  const [copied, setCopied] = useState(false);

  const generate = () => { onChange(generatePassword()); setShow(true); setCopied(false); };
  const copy = async () => { if (value && await copyText(value)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ position:'relative' }}>
        <input className="input" type={show ? 'text' : 'password'} placeholder={placeholder} value={value}
          onChange={e => { onChange(e.target.value); setCopied(false); }} required minLength={6}
          style={{ paddingRight:44, fontFamily: show ? mono : 'inherit' }} autoComplete="new-password" />
        <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
          style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--mut)', cursor:'pointer', fontSize:18, padding:6 }}>
          <i className={`ti ti-${show ? 'eye-off' : 'eye'}`} />
        </button>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button type="button" onClick={generate} style={smallBtn}><i className="ti ti-wand" /> Generate password</button>
        <button type="button" onClick={copy} disabled={!value} style={{ ...smallBtn, opacity: value ? 1 : 0.4, color: copied ? 'var(--grn)' : 'var(--pl)' }}>
          <i className={`ti ti-${copied ? 'check' : 'copy'}`} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// Inline panel for setting a new password on an existing account.
// Starts with a generated password so it is one tap to save; the admin/owner can also type their own.
export function ResetPassword({ user, onSubmit, onClose }) {
  const [pw, setPw] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const save = async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try { await onSubmit(pw); setDone(pw); }
    catch (err) { setError(err.error || 'Could not update password'); }
    finally { setSaving(false); }
  };

  if (done) return <CredentialsNotice title={`Password updated for ${user.name}`} email={user.email} password={done} onDismiss={onClose} />;

  return (
    <form onSubmit={save} style={{ marginTop:12, padding:14, background:'var(--bg)', border:'1px solid var(--pr)44', borderRadius:14, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--pl)' }}><i className="ti ti-key" /> New password for {user.name}</div>
      <PasswordField value={pw} onChange={setPw} placeholder="New password" defaultShow />
      <div style={{ fontSize:11, color:'var(--mut)' }}>The old password stops working immediately. Anyone already signed in stays signed in until they log out.</div>
      {error && <div style={{ color:'var(--red)', fontSize:13 }}>{error}</div>}
      <div style={{ display:'flex', gap:10 }}>
        <button className="btn btn-primary btn-sm" type="submit" style={{ flex:2 }} disabled={saving}>{saving ? 'Saving...' : 'Save new password'}</button>
        <button className="btn btn-ghost btn-sm" type="button" style={{ flex:1 }} onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// Shown once after an account is created: the password is stored hashed, so it cannot be retrieved later
export function CredentialsNotice({ title, email, password, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const text = `Email: ${email}\nPassword: ${password}`;
  return (
    <div className="card" style={{ marginBottom:20, borderColor:'var(--grn)66', background:'var(--grn-tint)' }}>
      <div style={{ color:'var(--grn)', fontWeight:600, fontSize:14, marginBottom:8 }}><i className="ti ti-circle-check" /> {title}</div>
      <div style={{ fontSize:12, color:'var(--sub)', marginBottom:10 }}>
        Share these login details now. The password is stored encrypted and <b>cannot be shown again</b>.
      </div>
      <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px', fontFamily:mono, fontSize:13, lineHeight:1.7, wordBreak:'break-all' }}>
        <div><span style={{ color:'var(--mut)' }}>Email:</span> {email}</div>
        <div><span style={{ color:'var(--mut)' }}>Password:</span> {password}</div>
      </div>
      <div style={{ display:'flex', gap:10, marginTop:12 }}>
        <button className="btn btn-primary btn-sm" type="button" style={{ flex:2 }}
          onClick={async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>
          <i className={`ti ti-${copied ? 'check' : 'copy'}`} /> {copied ? 'Copied' : 'Copy login details'}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" style={{ flex:1 }} onClick={onDismiss}>Done</button>
      </div>
    </div>
  );
}
