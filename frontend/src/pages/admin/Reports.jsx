import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import RouteTable from '../../components/RouteTable';
import { ReportTabs } from '../../components/ReportBits';

// Admin reports (KAN-14). The Reports home shows the route table (KAN-51); each other report is a sub-page.
// A new report gets an entry here; it then shows in the switcher on every report page and under Reports in the sidebar.
export const REPORT_PAGES = [
  { path:'/admin/reports',         label:'Routes' },
  { path:'/admin/reports/network', label:'Weekly network' },
  { path:'/admin/reports/rider-performance', label:'Rider performance' },
  { path:'/admin/reports/complaints', label:'Complaints' },
  { path:'/admin/reports/riders',  label:'Riders directory' },
];

// The phone has no sidebar sub-menu, so every report page starts with this switcher
export const ReportsNav = () => <ReportTabs pages={REPORT_PAGES} />;

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
