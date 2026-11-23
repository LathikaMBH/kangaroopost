import { useNavigate } from 'react-router-dom';

// Admin reports (KAN-14). New reports get a card here and their own page under /admin/reports/.
const REPORTS = [
  { path:'/admin/reports/riders', icon:'ti-users', title:'Riders directory', text:'Every rider with their route owner, cities, routes and the last week they ran.' },
];

export default function AdminReports() {
  const navigate = useNavigate();
  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin')}><i className="ti ti-arrow-left" /></button>
        <h3>Reports</h3>
        <div style={{ width:30 }} />
      </div>
      <div style={{ padding:'0 22px 20px' }}>
        <div className="admin-grid">
          {REPORTS.map(r => (
            <button key={r.path} className="card" onClick={() => navigate(r.path)}
              style={{ display:'flex', alignItems:'center', gap:14, width:'100%', marginBottom:12, textAlign:'left', cursor:'pointer', fontFamily:'inherit' }}>
              <i className={`ti ${r.icon}`} style={{ fontSize:28, color:'var(--pl)', flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:15, color:'var(--tx)' }}>{r.title}</div>
                <div style={{ color:'var(--mut)', fontSize:12, marginTop:3 }}>{r.text}</div>
              </div>
              <i className="ti ti-chevron-right" style={{ color:'var(--mut)', fontSize:18 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
