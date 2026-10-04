import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
  ];
  const ownerTabs = [
    { icon:'ti-home',    label:'Home',   path:'/owner' },
    { icon:'ti-map-2',   label:'Routes', path:'/owner/routes' },
    { icon:'ti-users',   label:'Riders', path:'/owner/riders' },
  ];

  const tabs = user?.role === 'admin' ? adminTabs : user?.role === 'route_owner' ? ownerTabs : [];
  const showNav = tabs.length > 0 && !isNav;
  const isActive = p => loc.pathname === p || (p !== '/admin' && p !== '/owner' && loc.pathname.startsWith(p));

  return (
    <div className="app-shell">
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
          <button className="nav-btn" onClick={() => { logout(); navigate('/login'); }}>
            <i className="ti ti-logout" /><span>Logout</span>
          </button>
        </nav>
      )}
    </div>
  );
}
