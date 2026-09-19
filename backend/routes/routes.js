const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, ownerOrAdmin } = require('../middleware/auth');
const { canView, canManage, loadRoute, checkRiderForRoute } = require('../middleware/access');

// List: each role only ever gets its own routes
router.get('/', auth, wrap(async (req, res) => {
  if (req.user.role === 'admin')        return res.json(await queries.getAllRoutes());
  if (req.user.role === 'route_owner')  return res.json(await queries.getRoutesByOwner(req.user.id));
  res.json(await queries.getRoutesForRider(req.user.id));
}));

router.get('/:id', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canView);
  if (!route) return;
  res.json({ ...route, stops: await queries.getStopsByRoute(route.id) });
}));

router.post('/', auth, ownerOrAdmin, wrap(async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  let owner_id = req.user.id;
  if (req.user.role === 'admin' && req.body.owner_id) {
    const owner = await queries.getOwnerById(req.body.owner_id);
    if (!owner) return res.status(400).json({ error: 'Route owner not found' });
    owner_id = owner.id;
  }
  res.status(201).json(await queries.createRoute(name, owner_id));
}));

router.put('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canManage);
  if (!route) return;
  const { name, rider_id } = req.body;
  let newRider = route.rider_id;
  if (rider_id !== undefined) {
    const r = await checkRiderForRoute(res, rider_id, route);
    if (!r.ok) return;
    newRider = r.rider_id;
  }
  res.json(await queries.updateRoute(route.id, { name: String(name ?? '').trim() || route.name, rider_id: newRider }));
}));

router.delete('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canManage);
  if (!route) return;
  await queries.deleteRoute(route.id);
  res.json({ success: true });
}));

router.post('/:id/assign', auth, ownerOrAdmin, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canManage);
  if (!route) return;
  const r = await checkRiderForRoute(res, req.body.rider_id, route);
  if (!r.ok) return;
  await queries.assignRoute(r.rider_id, route.id);
  res.json(await queries.getRouteById(route.id));
}));

router.get('/:id/stops', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canView);
  if (!route) return;
  res.json(await queries.getStopsByRoute(route.id));
}));

router.post('/:id/stops', auth, ownerOrAdmin, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canManage);
  if (!route) return;
  const { address, lat, lng, type = 'mailbox' } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  const order_num = await queries.getMaxOrder(route.id) + 1;
  res.status(201).json(await queries.createStop(route.id, order_num, address || `Stop ${order_num}`, lat, lng, type));
}));

module.exports = router;
