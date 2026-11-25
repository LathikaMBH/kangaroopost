import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { REPORT_PAGES } from '../pages/admin/Reports';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const isNav = loc.pathname.includes('/navigate');

  const adminTabs = [
    { icon:'ti-home',    label:'Home',   path:'/admin' },
    { icon:'ti-users',   label:'Owners', path:'/admin/owners' },
    { icon:'ti-map-2',   label:'Routes', path:'/admin/routes' },
    { icon:'ti-map-pin', label:'Areas',  path:'/admin/areas' },
    // sub: shown indented under it in the sidebar (the first report page is Reports itself)
    { icon:'ti-report-analytics', label:'Reports', path:'/admin/reports', sub: REPORT_PAGES.slice(1) },
  ];
  const ownerTabs = [
    { icon:'ti-home',    label:'Home',   path:'/owner' },
    { icon:'ti-map-2',   label:'Routes', path:'/owner/routes' },
    { icon:'ti-users',   label:'Riders', path:'/owner/riders' },
    { icon:'ti-report-analytics', label:'Reports', path:'/owner/reports' },
  ];

  const isAdmin = user?.role === 'admin';
  const tabs = isAdmin ? adminTabs : user?.role === 'route_owner' ? ownerTabs : [];
  const showNav = tabs.length > 0 && !isNav;
  const isActive = p => loc.pathname === p || (p !== '/admin' && p !== '/owner' && loc.pathname.startsWith(p));

  // Admin only: on a wide screen (>= 1024px) the shell fills the monitor and the sidebar replaces the
  // bottom bar (see .app-shell--admin in index.css). Owners and riders always get the phone layout.
  return (
    <div className={`app-shell${isAdmin ? ' app-shell--admin' : ''}`}>
      {isAdmin && (
        <aside className="side-nav" aria-label="Admin menu">
          <div className="side-nav-brand">Kangodrop<span>Admin</span></div>
          {tabs.map(t => [
            // an item with sub-items is highlighted only on its own page; on a sub-page the sub-item is
            <button key={t.path} className={`side-nav-btn ${(t.sub ? loc.pathname === t.path : isActive(t.path))?'active':''}`} onClick={() => navigate(t.path)}>
              <i className={`ti ${t.icon}`} /><span>{t.label}</span>
            </button>,
            ...(t.sub || []).map(s => (
              <button key={s.path} className={`side-nav-btn side-nav-sub ${loc.pathname === s.path?'active':''}`} onClick={() => navigate(s.path)}>
                <span>{s.label}</span>
              </button>
            )),
          ])}
          <button className="side-nav-btn side-nav-logout" onClick={() => { logout(); navigate('/login'); }}>
            <i className="ti ti-logout" /><span>Logout</span>
          </button>
        </aside>
      )}
      <div className="status-bar" />
      {children}
      {showNav && (
        <nav className="bottom-nav">
          {tabs.map(t => (
            <button key={t.path} className={`nav-btn ${isActive(t.path)?'active':''}`} onClick={() => navigate(t.path)}>
              <i className={`ti ${t.icon}`} /><span>{t.label}</span>
            </button>
          ))}
          <button className="nav-btn" onClick={() => { logout(); navigate('/login'); }}>
            <i className="ti ti-logout" /><span>Logout</span>
          </button>
        </nav>
      )}
      {user?.role === 'rider' && !isNav && (
        <nav className="bottom-nav">
          <button className={`nav-btn ${loc.pathname==='/rider'?'active':''}`} onClick={() => navigate('/rider')}>
            <i className="ti ti-home" /><span>Home</span>
          </button>
          <button className={`nav-btn ${loc.pathname.startsWith('/rider/reports')?'active':''}`} onClick={() => navigate('/rider/reports')}>
            <i className="ti ti-report-analytics" /><span>My reports</span>
          </button>
          <button className="nav-btn" onClick={() => { logout(); navigate('/login'); }}>
            <i className="ti ti-logout" /><span>Logout</span>
          </button>
        </nav>
      )}
    </div>
  );
}
