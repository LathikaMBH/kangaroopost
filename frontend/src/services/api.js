import axios from 'axios';
// Production: VITE_API_URL is the backend's public address (set at build time). Development: empty, the Vite proxy handles /api.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
if (import.meta.env.PROD && !API_URL) console.error('VITE_API_URL is not set: the app cannot reach the backend');
const api = axios.create({ baseURL: `${API_URL}/api` });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('kp_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(r => r.data, e => Promise.reject(e.response?.data || e));

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
  // Stops
  createStop:    (rid, d)   => api.post(`/routes/${rid}/stops`, d),
  saveRoadPath:  (rid, d)   => api.put(`/routes/${rid}/road-path`, d),
  updateStop:    (id, d)    => api.put(`/stops/${id}`, d),
  deleteStop:    (id)       => api.delete(`/stops/${id}`),
  // Delivery
  startRoute:    (id)       => api.post(`/delivery/start/${id}`),
  pauseRoute:    (id)       => api.post(`/delivery/pause/${id}`),
  resumeRoute:   (id)       => api.post(`/delivery/resume/${id}`),
  deliverStop:   (id, m)    => api.post(`/delivery/stop/${id}`, { method: m }),
  endRoute:      (id)       => api.post(`/delivery/end/${id}`),
  pingLocation:  (d)        => api.post('/delivery/ping', d),
};
