import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api';
import RouteTable from '../../components/RouteTable';

// Admin reports (KAN-14). The Reports home shows the route table (KAN-51); each other report is a sub-page.
// A new report gets an entry here; it then shows in the switcher on every report page and under Reports in the sidebar.
export const REPORT_PAGES = [
  { path:'/admin/reports',         label:'Routes' },
  { path:'/admin/reports/network', label:'Weekly network' },
  { path:'/admin/reports/riders',  label:'Riders directory' },
];

// The phone has no sidebar sub-menu, so every report page starts with this switcher
export function ReportsNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div role="tablist" aria-label="Reports" style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
      {REPORT_PAGES.map(p => {
        const active = pathname === p.path;
        return (
          <button key={p.path} role="tab" aria-selected={active} onClick={() => navigate(p.path)}
            style={{ padding:'7px 14px', borderRadius:20, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600,
              border:`1px solid ${active ? 'var(--pr)' : 'var(--border)'}`, background: active ? 'var(--pr)' : 'var(--el)', color: active ? '#fff' : 'var(--sub)' }}>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminReports() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => api.getRoutes().then(setRoutes).catch(() => {}).finally(() => setLoading(false));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="screen">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin')}><i className="ti ti-arrow-left" /></button>
        <h3>Reports</h3>
        <div style={{ width:30 }} />
      </div>
      <div style={{ padding:'0 22px 20px' }}>
        <ReportsNav />
        <div className="section-label">All routes</div>
        {loading ? <div className="spinner" /> : <RouteTable routes={routes} role="admin" />}
      </div>
    </div>
  );
}
