import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Layout from './components/Layout';

import Login from './pages/Login';
// Admin
import AdminDashboard from './pages/admin/Dashboard';
import AdminOwners    from './pages/admin/Owners';
import AdminRoutes    from './pages/admin/Routes';
// Owner
import OwnerDashboard from './pages/owner/Dashboard';
import OwnerRiders    from './pages/owner/Riders';
// Shared route pages (owner uses master's pages)
import MasterRoutes   from './pages/master/Routes';
import CreateRoute    from './pages/master/CreateRoute';
import RouteDetail    from './pages/master/RouteDetail';
// Rider
import RiderDashboard from './pages/rider/Dashboard';
import RiderNavigate  from './pages/rider/Navigate';

function Guard({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const dest = user.role==='admin' ? '/admin' : user.role==='route_owner' ? '/owner' : '/rider';
    return <Navigate to={dest} replace />;
  }
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  const home = user ? (user.role==='admin' ? '/admin' : user.role==='route_owner' ? '/owner' : '/rider') : '/login';
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to={home} replace />} />

      {/* Admin */}
      <Route path="/admin"         element={<Guard roles={['admin']}><Layout><AdminDashboard /></Layout></Guard>} />
      <Route path="/admin/owners"  element={<Guard roles={['admin']}><Layout><AdminOwners /></Layout></Guard>} />
      <Route path="/admin/routes"  element={<Guard roles={['admin']}><Layout><AdminRoutes /></Layout></Guard>} />

      {/* Route Owner */}
      <Route path="/owner"                   element={<Guard roles={['route_owner']}><Layout><OwnerDashboard /></Layout></Guard>} />
      <Route path="/owner/riders"            element={<Guard roles={['route_owner']}><Layout><OwnerRiders /></Layout></Guard>} />
      <Route path="/owner/routes"            element={<Guard roles={['route_owner']}><Layout><MasterRoutes base="/owner" /></Layout></Guard>} />
      <Route path="/owner/routes/new"        element={<Guard roles={['route_owner']}><Layout><CreateRoute base="/owner" /></Layout></Guard>} />
      <Route path="/owner/routes/:id"        element={<Guard roles={['route_owner']}><Layout><RouteDetail base="/owner" /></Layout></Guard>} />
      <Route path="/owner/routes/:id/edit"   element={<Guard roles={['route_owner']}><Layout><CreateRoute base="/owner" /></Layout></Guard>} />

      {/* Rider */}
      <Route path="/rider"                        element={<Guard roles={['rider']}><Layout><RiderDashboard /></Layout></Guard>} />
      <Route path="/rider/navigate/:routeId"      element={<Guard roles={['rider']}><Layout><RiderNavigate /></Layout></Guard>} />

      {/* anything else: back to the user's home (or the login page) */}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
