import axios from 'axios';
const BACKEND = import.meta.env.VITE_API_URL || '';
const api = axios.create({ baseURL: `${BACKEND}/api` });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('pt_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
// no response at all (offline / server unreachable): give callers a readable { error } like server errors (KAN-22)
const NETWORK_ERROR = "Can't reach the server. Check your connection and try again.";
api.interceptors.response.use(r => r.data, e => Promise.reject(e.response?.data || (e.code === 'ERR_NETWORK' ? { error: NETWORK_ERROR, network: true } : e)));

export default {
  login:         (d)        => api.post('/auth/login', d),
  // Owners (admin)
  getOwners:     ()         => api.get('/users/owners'),
  createOwner:   (d)        => api.post('/users/owners', d),
  updateOwner:   (id, d)    => api.put(`/users/owners/${id}`, d),
  deleteOwner:   (id)       => api.delete(`/users/owners/${id}`),
  getOwnerRiders:(id)       => api.get(`/users/owners/${id}/riders`),
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
