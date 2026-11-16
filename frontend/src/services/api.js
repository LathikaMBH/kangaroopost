import axios from 'axios';
// VITE_API_URL is the backend's public address, set at build time when the screens are hosted elsewhere (Netlify).
// Empty: the API is on the same address (served by the backend on Railway, or the Vite proxy in development).
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const api = axios.create({ baseURL: `${API_URL}/api` });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('kp_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
// no response at all (offline / server unreachable): give callers a readable { error } like server errors (KAN-22)
const NETWORK_ERROR = "Can't reach the server. Check your connection and try again.";
// a 401 on a signed-in request means the token expired or is invalid: drop the session and go back to login (KAN-26).
// Not for /auth/login itself, where 401 is just a wrong email or password.
const signOutExpired = e => {
  if (e.response?.status !== 401 || !e.config?.headers?.Authorization || e.config.url === '/auth/login') return;
  localStorage.removeItem('kp_token');
  localStorage.removeItem('kp_user');
  if (window.location.pathname !== '/login') window.location.replace('/login');
};
api.interceptors.response.use(r => r.data, e => {
  signOutExpired(e);
  return Promise.reject(e.response?.data || (e.code === 'ERR_NETWORK' ? { error: NETWORK_ERROR, network: true } : e));
});

export default {
  login:         (d)        => api.post('/auth/login', d),
  // Owners (admin)
  getOwners:     ()         => api.get('/users/owners'),
  createOwner:   (d)        => api.post('/users/owners', d),
  updateOwner:   (id, d)    => api.put(`/users/owners/${id}`, d),
  deleteOwner:   (id)       => api.delete(`/users/owners/${id}`),
  getOwnerRiders:(id)       => api.get(`/users/owners/${id}/riders`),
  resetPassword: (kind, id, password) => api.post(`/users/${kind}/${id}/password`, { password }), // kind: 'owners' | 'riders'
  // Riders (owner)
  getRiders:     ()         => api.get('/users/riders'),
  createRider:   (d)        => api.post('/users/riders', d),
  updateRider:   (id, d)    => api.put(`/users/riders/${id}`, d),
  deleteRider:   (id)       => api.delete(`/users/riders/${id}`),
  // Routes
  getRoutes:     ()         => api.get('/routes'),
  getRoute:      (id)       => api.get(`/routes/${id}`),
  createRoute:   (d)        => api.post('/routes', d),
  updateRoute:   (id, d)    => api.put(`/routes/${id}`, d),
  deleteRoute:   (id)       => api.delete(`/routes/${id}`),
  assignRoute:   (id, rid)  => api.post(`/routes/${id}/assign`, { rider_id: rid }),
  // Areas: regions and their cities (changes: admin only)
  getAreas:      ()         => api.get('/areas'),
  createRegion:  (name)     => api.post('/areas/regions', { name }),
  renameRegion:  (id, name) => api.put(`/areas/regions/${id}`, { name }),
  deleteRegion:  (id)       => api.delete(`/areas/regions/${id}`),
  createCity:    (region_id, name) => api.post('/areas/cities', { region_id, name }),
  updateCity:    (id, d)    => api.put(`/areas/cities/${id}`, d),
  deleteCity:    (id)       => api.delete(`/areas/cities/${id}`),
  // Stops
  createStop:    (rid, d)   => api.post(`/routes/${rid}/stops`, d),
  saveRoadPath:  (rid, d)   => api.put(`/routes/${rid}/road-path`, d),
  updateStop:    (id, d)    => api.put(`/stops/${id}`, d),
  deleteStop:    (id)       => api.delete(`/stops/${id}`),
  // Delivery
  startRoute:    (id)       => api.post(`/delivery/start/${id}`),
  pauseRoute:    (id)       => api.post(`/delivery/pause/${id}`),
  resumeRoute:   (id)       => api.post(`/delivery/resume/${id}`),
  deliverStop:   (id, m)    => api.post(`/delivery/stop/${id}`, { method: m, delivered_at: new Date().toISOString() }), // the phone's delivery time
  endRoute:      (id)       => api.post(`/delivery/end/${id}`),
  pingLocation:  (d)        => api.post('/delivery/ping', d),
  // Missed-delivery complaints
  getComplaints:    ()      => api.get('/complaints'),
  createComplaint:  (d)     => api.post('/complaints', d),
  acceptComplaint:  (id)    => api.post(`/complaints/${id}/accept`),
  resolveComplaint: (id)    => api.post(`/complaints/${id}/resolve`),
  deleteComplaint:  (id)    => api.delete(`/complaints/${id}`),
};
