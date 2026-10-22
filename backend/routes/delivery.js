const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries, setRouteStatus } = require('../database');
const { auth } = require('../middleware/auth');
const { canView, canRide, loadRoute, loadStop } = require('../middleware/access');

// Start route (only the rider the route is assigned to). Each start is a new delivery run (KAN-38); the earlier runs are kept.
router.post('/start/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  await queries.startRun(route.id, req.user);
  req.io.to(`route_${route.id}`).emit('route:started', { routeId: route.id, riderId: req.user.id, riderName: req.user.name });
  res.json(await queries.getRouteById(route.id));
}));

// Pause route — GPS tracking stops on client side
router.post('/pause/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  await setRouteStatus(route.id, 'paused');
  await queries.logRunEvent(route.id, 'paused', req.user);
  req.io.to(`route_${route.id}`).emit('route:paused', { routeId: route.id, riderId: req.user.id });
  res.json(await queries.getRouteById(route.id));
}));

// Resume route — GPS tracking restarts on client side
router.post('/resume/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  await setRouteStatus(route.id, 'ongoing');
  await queries.logRunEvent(route.id, 'resumed', req.user);
  req.io.to(`route_${route.id}`).emit('route:resumed', { routeId: route.id, riderId: req.user.id });
  res.json(await queries.getRouteById(route.id));
}));

// Deliver a stop (only the assigned rider). delivered_at: the phone's time of the delivery (stored clamped)
router.post('/stop/:stopId', auth, wrap(async (req, res) => {
  const found = await loadStop(req, res, req.params.stopId, canRide);
  if (!found) return;
  const { stop } = found;
  const method = req.body.method === 'auto' ? 'auto' : 'manual';
  const updated = await queries.deliverStop(stop.id, stop.route_id, method, req.body.delivered_at);
  req.io.to(`route_${stop.route_id}`).emit('stop:delivered', { stopId: stop.id, routeId: stop.route_id, method, riderId: req.user.id });
  const allStops = await queries.getStopsByRoute(stop.route_id);
  const allDone = allStops.every(s => s.id === stop.id || s.delivered);
  if (allDone) {
    await queries.finishRun(stop.route_id, req.user);
    req.io.to(`route_${stop.route_id}`).emit('route:completed', { routeId: stop.route_id });
  }
  res.json({ stop: updated, routeCompleted: allDone });
}));

// End route (the assigned rider, or the route's owner / an admin closing a stuck route). The run counts as completed,
// ended by whoever did it.
router.post('/end/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canView);
  if (!route) return;
  await queries.finishRun(route.id, req.user);
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
