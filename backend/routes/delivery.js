const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries, setRouteStatus } = require('../database');
const { auth } = require('../middleware/auth');
const { canView, canRide, loadRoute, loadStop } = require('../middleware/access');

// Start route (only the rider the route is assigned to). Each start is a new delivery run (KAN-38); the earlier runs are
// kept. A run in progress is never closed by a new start: it is ended first (End, the last stop, or an owner/admin).
// any_order: deliver the stops in any order (KAN-55); the boxes' sides of the road are worked out first.
router.post('/start/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  await queries.refreshSides(route.id);
  if (!await queries.startRun(route.id, req.user, req.body?.any_order === true)) return res.status(409).json({ error: 'End the current round before starting a new one' });
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

// KAN-55: switch the run in progress between the saved order and any order (only the assigned rider)
router.post('/mode/:routeId', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.routeId, canRide);
  if (!route) return;
  if (typeof req.body?.any_order !== 'boolean') return res.status(400).json({ error: 'any_order must be true or false' });
  const run = await queries.setOrderMode(route.id, req.body.any_order);
  if (!run) return res.status(409).json({ error: 'This route is not in progress' });
  res.json({ order_mode: run.order_mode });
}));

// KAN-55: undo a delivery marked by mistake, while the route is in progress (only the assigned rider)
router.post('/stop/:stopId/undo', auth, wrap(async (req, res) => {
  const found = await loadStop(req, res, req.params.stopId, canRide);
  if (!found) return;
  const stop = await queries.undoDelivery(found.stop.id, found.stop.route_id);
  if (!stop) return res.status(409).json({ error: 'This route is not in progress' });
  req.io.to(`route_${stop.route_id}`).emit('stop:undone', { stopId: stop.id, routeId: stop.route_id, riderId: req.user.id });
  res.json({ stop });
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
