const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries, setRouteStatus } = require('../database');
const { auth } = require('../middleware/auth');

// Start route
router.post('/start/:routeId', auth, wrap(async (req, res) => {
  const route = await queries.getRouteById(req.params.routeId);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  await queries.resetStops(route.id);
  await setRouteStatus(route.id, 'ongoing');
  req.io.to(`route_${route.id}`).emit('route:started', { routeId: route.id, riderId: req.user.id, riderName: req.user.name });
  res.json(await queries.getRouteById(route.id));
}));

// Pause route — GPS tracking stops on client side
router.post('/pause/:routeId', auth, wrap(async (req, res) => {
  const route = await queries.getRouteById(req.params.routeId);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  await setRouteStatus(route.id, 'paused');
  req.io.to(`route_${route.id}`).emit('route:paused', { routeId: route.id, riderId: req.user.id });
  res.json(await queries.getRouteById(route.id));
}));

// Resume route — GPS tracking restarts on client side
router.post('/resume/:routeId', auth, wrap(async (req, res) => {
  const route = await queries.getRouteById(req.params.routeId);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  await setRouteStatus(route.id, 'ongoing');
  req.io.to(`route_${route.id}`).emit('route:resumed', { routeId: route.id, riderId: req.user.id });
  res.json(await queries.getRouteById(route.id));
}));

// Deliver a stop
router.post('/stop/:stopId', auth, wrap(async (req, res) => {
  const stop = await queries.getStopById(req.params.stopId);
  if (!stop) return res.status(404).json({ error: 'Stop not found' });
  const { method = 'manual' } = req.body;
  const updated = await queries.deliverStop(method, stop.id);
  req.io.to(`route_${stop.route_id}`).emit('stop:delivered', { stopId: stop.id, routeId: stop.route_id, method, riderId: req.user.id });
  const allStops = await queries.getStopsByRoute(stop.route_id);
  const allDone = allStops.every(s => s.id === stop.id || s.delivered);
  if (allDone) {
    await setRouteStatus(stop.route_id, 'completed');
    req.io.to(`route_${stop.route_id}`).emit('route:completed', { routeId: stop.route_id });
  }
  res.json({ stop: updated, routeCompleted: allDone });
}));

// End route
router.post('/end/:routeId', auth, wrap(async (req, res) => {
  await setRouteStatus(req.params.routeId, 'completed');
  req.io.to(`route_${req.params.routeId}`).emit('route:completed', { routeId: req.params.routeId });
  res.json({ success: true });
}));

// GPS ping
router.post('/ping', auth, wrap(async (req, res) => {
  const { routeId, lat, lng } = req.body;
  if (!routeId || !lat || !lng) return res.status(400).json({ error: 'routeId, lat, lng required' });
  await queries.insertPing(routeId, req.user.id, lat, lng);
  req.io.to(`route_${routeId}`).emit('rider:location', { routeId, riderId: req.user.id, riderName: req.user.name, lat, lng });
  res.json({ success: true });
}));

module.exports = router;
