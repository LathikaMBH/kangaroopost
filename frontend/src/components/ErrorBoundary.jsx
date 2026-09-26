import { Component } from 'react';

// Catches a crash in any page so the user sees a message instead of a blank screen.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI error:', error, info?.componentStack); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:24, textAlign:'center', color:'var(--tx)', background:'var(--bg)' }}>
        <div style={{ fontSize:40 }}>⚠️</div>
        <div style={{ fontSize:18, fontWeight:600 }}>Something went wrong</div>
        <div style={{ fontSize:13, color:'var(--sub)', maxWidth:300 }}>The page hit an unexpected problem. Reloading usually fixes it.</div>
        <div style={{ display:'flex', gap:10, marginTop:6 }}>
          <button onClick={() => window.location.reload()} style={{ padding:'10px 18px', borderRadius:12, border:'none', background:'var(--pr)', color:'#fff', fontWeight:600, cursor:'pointer' }}>Reload</button>
          <button onClick={() => window.location.assign('/')} style={{ padding:'10px 18px', borderRadius:12, border:'1px solid var(--border)', background:'var(--el)', color:'var(--pl)', fontWeight:600, cursor:'pointer' }}>Go home</button>
        </div>
      </div>
    );
  }
}
