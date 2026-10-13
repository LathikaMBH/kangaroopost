const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries, setRouteStatus } = require('../database');
const { auth } = require('../middleware/auth');
const { canView, canRide, loadRoute, loadStop } = require('../middleware/access');

// Start route (only the rider the route is assigned to)
router.post('/start/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  await queries.resetStops(route.id);
  await setRouteStatus(route.id, 'ongoing');
  req.io.to(`route_${route.id}`).emit('route:started', { routeId: route.id, riderId: req.user.id, riderName: req.user.name });
  res.json(await queries.getRouteById(route.id));
}));

// Pause route — GPS tracking stops on client side
router.post('/pause/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  await setRouteStatus(route.id, 'paused');
  req.io.to(`route_${route.id}`).emit('route:paused', { routeId: route.id, riderId: req.user.id });
  res.json(await queries.getRouteById(route.id));
}));

// Resume route — GPS tracking restarts on client side
router.post('/resume/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  await setRouteStatus(route.id, 'ongoing');
  req.io.to(`route_${route.id}`).emit('route:resumed', { routeId: route.id, riderId: req.user.id });
  res.json(await queries.getRouteById(route.id));
}));

// Deliver a stop (only the assigned rider, while the route is running). A missed stop can still be delivered later.
// The route is not completed here any more: the rider completes it (KAN-28).
router.post('/stop/:stopId', auth, wrap(async (req, res) => {
  const found = await loadStop(req, res, req.params.stopId, canRide);
  if (!found) return;
  const { stop, route } = found;
  if (route.status !== 'ongoing' && route.status !== 'paused') return res.status(409).json({ error: 'This route is not running' });
  const { method = 'manual' } = req.body;
  const updated = await queries.deliverStop(method, stop.id);
  req.io.to(`route_${stop.route_id}`).emit('stop:delivered', { stopId: stop.id, routeId: stop.route_id, method, riderId: req.user.id });
  res.json({ stop: updated });
}));

// The rider reached a stop (within 20 m): the earlier stops in the saved order that are not delivered become missed.
// Only while the route is running (not paused). No socket event: missed stops are the rider's own work record,
// the route owner only sees the progress of a finished route.
router.post('/reached/:stopId', auth, wrap(async (req, res) => {
  const found = await loadStop(req, res, req.params.stopId, canRide);
  if (!found) return;
  if (found.route.status !== 'ongoing') return res.status(409).json({ error: 'This route is not running' });
  const missed = await queries.markMissedBefore(found.stop.id);
  res.json({ missed: missed.sort((a, b) => a.order_num - b.order_num || a.id - b.id) });
}));

// How far a route got: delivered / all stops, and the numbers (1 = first in the saved order) of the stops not delivered that were missed
const progressOf = (stops) => {
  const delivered = stops.filter(s => s.delivered).length;
  return { delivered, total: stops.length, pct: stops.length ? Math.round(delivered / stops.length * 100) : 0,
    missed: stops.map((s, i) => (!s.delivered && s.missed ? i + 1 : null)).filter(n => n !== null) };
};

// Complete route (only the assigned rider, on a running or paused route). Stops may still be missed or not delivered.
router.post('/complete/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  if (route.status !== 'ongoing' && route.status !== 'paused') return res.status(409).json({ error: 'This route is not running' });
  await setRouteStatus(route.id, 'completed');
  req.io.to(`route_${route.id}`).emit('route:completed', { routeId: route.id });
  res.json({ route: await queries.getRouteById(route.id), progress: progressOf(await queries.getStopsByRoute(route.id)) });
}));

// End route (the assigned rider, or the route's owner / an admin closing a stuck route)
router.post('/end/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canView);
  if (!route) return;
  await setRouteStatus(route.id, 'completed');
  req.io.to(`route_${route.id}`).emit('route:completed', { routeId: route.id });
  res.json({ success: true });
}));

// GPS ping (only the assigned rider)
router.post('/ping', auth, wrap(async (req, res) => {
  const { routeId, lat, lng } = req.body;
  if (!routeId || !lat || !lng) return res.status(400).json({ error: 'routeId, lat, lng required' });
  const route = await loadRoute(req, res, routeId, canRide);
  if (!route) return;
  await queries.insertPing(route.id, req.user.id, lat, lng);
  req.io.to(`route_${route.id}`).emit('rider:location', { routeId: route.id, riderId: req.user.id, riderName: req.user.name, lat, lng });
  res.json({ success: true });
}));

module.exports = router;
