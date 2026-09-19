const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, ownerOrAdmin } = require('../middleware/auth');

router.get('/', auth, wrap(async (req, res) => {
  if (req.user.role === 'admin')        return res.json(await queries.getAllRoutes());
  if (req.user.role === 'route_owner')  return res.json(await queries.getRoutesByOwner(req.user.id));
  res.json(await queries.getRoutesForRider(req.user.id));
}));

router.get('/:id', auth, wrap(async (req, res) => {
  const route = await queries.getRouteById(req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  res.json({ ...route, stops: await queries.getStopsByRoute(route.id) });
}));

router.post('/', auth, ownerOrAdmin, wrap(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const owner_id = req.user.role === 'admin' ? (req.body.owner_id || req.user.id) : req.user.id;
  res.status(201).json(await queries.createRoute(name, owner_id));
}));

router.put('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const { name, rider_id } = req.body;
  const route = await queries.getRouteById(req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  res.json(await queries.updateRoute(Number(req.params.id), { name: name || route.name, rider_id: rider_id !== undefined ? (rider_id ? Number(rider_id) : null) : route.rider_id }));
}));

router.delete('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  await queries.deleteRoute(req.params.id); res.json({ success: true });
}));

router.post('/:id/assign', auth, ownerOrAdmin, wrap(async (req, res) => {
  await queries.assignRoute(req.body.rider_id, req.params.id);
  res.json(await queries.getRouteById(req.params.id));
}));

router.get('/:id/stops', auth, wrap(async (req, res) => res.json(await queries.getStopsByRoute(req.params.id))));

router.post('/:id/stops', auth, ownerOrAdmin, wrap(async (req, res) => {
  const { address, lat, lng, type = 'mailbox' } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  const order_num = await queries.getMaxOrder(req.params.id) + 1;
  res.status(201).json(await queries.createStop(req.params.id, order_num, address || `Stop ${order_num}`, lat, lng, type));
}));

module.exports = router;
