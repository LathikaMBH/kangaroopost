// Who may do what with a route. Every route/stop/delivery endpoint goes through here so the rules live in one place.
//   view   : admin, the route's owner, the rider assigned to it
//   manage : admin, the route's owner            (edit, delete, assign a rider, add/edit/delete stops)
//   ride   : the rider assigned to it            (start, pause, resume, deliver stops, send GPS)
const { queries } = require('../database');

const isOwnerOf = (u, route) => u.role === 'route_owner' && route.owner_id === u.id;
const isRiderOf = (u, route) => u.role === 'rider' && route.rider_id === u.id;

const canView   = (u, route) => u.role === 'admin' || isOwnerOf(u, route) || isRiderOf(u, route);
const canManage = (u, route) => u.role === 'admin' || isOwnerOf(u, route);
const canRide   = (u, route) => isRiderOf(u, route);

// Loads the route with the given id and checks the caller may do `check` to it.
// Sends the 404/403 response itself and returns null when the request must stop.
async function loadRoute(req, res, routeId, check) {
  const route = await queries.getRouteById(routeId);
  if (!route) { res.status(404).json({ error: 'Route not found' }); return null; }
  if (!check(req.user, route)) { res.status(403).json({ error: 'Not your route' }); return null; }
  return route;
}

// Same, starting from a stop id. Returns { stop, route } or null.
async function loadStop(req, res, stopId, check) {
  const stop = await queries.getStopById(stopId);
  if (!stop) { res.status(404).json({ error: 'Stop not found' }); return null; }
  const route = await loadRoute(req, res, stop.route_id, check);
  return route ? { stop, route } : null;
}

// A rider may only be attached to a route that belongs to the same route owner as the rider.
async function checkRiderForRoute(res, rider_id, route) {
  if (rider_id === null || rider_id === undefined || rider_id === '') return { ok: true, rider_id: null };
  const rider = await queries.getUserById(rider_id);
  if (!rider || rider.role !== 'rider') { res.status(400).json({ error: 'Rider not found' }); return { ok: false }; }
  if (rider.owner_id !== route.owner_id) { res.status(400).json({ error: 'That rider does not belong to this route\'s owner' }); return { ok: false }; }
  return { ok: true, rider_id: rider.id };
}

module.exports = { canView, canManage, canRide, loadRoute, loadStop, checkRiderForRoute };
