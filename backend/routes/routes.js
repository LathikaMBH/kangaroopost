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
  res.json({ ...route, stops: await queries.getStopsByRoute(route.id), road_path: await queries.getRoadPath(route.id) });
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

// Save the road-following line for a route. The browser asks Google for the roads between consecutive stops and
// posts the result here, so later views (and the riders) reuse it without calling Google again.
//   legs: one encoded polyline per pair of consecutive stops (so stops - 1 legs)
const ROAD_MODES = ['BICYCLE', 'WALK', 'DRIVE'];
const ENCODED_POLYLINE = /^[?-~]{2,60000}$/;   // encoded polylines only use ASCII 63..126
router.put('/:id/road-path', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canView);   // owner, admin or the assigned rider
  if (!route) return;
  const { key, mode, legs, meters } = req.body;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(key)) return res.status(400).json({ error: 'Invalid key' });
  if (!ROAD_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid travel mode' });
  if (!Array.isArray(legs) || legs.length < 1 || legs.length > 200 || !legs.every(l => typeof l === 'string' && ENCODED_POLYLINE.test(l))) {
    return res.status(400).json({ error: 'Invalid legs' });
  }
  if (legs.reduce((n, l) => n + l.length, 0) > 400000) return res.status(400).json({ error: 'Road path is too large' });
  const stopCount = (await queries.getStopsByRoute(route.id)).length;
  if (legs.length !== stopCount - 1) return res.status(409).json({ error: 'The stops changed; recompute the road path' });
  await queries.setRoadPath(route.id, { key, mode, legs, meters: Number.isFinite(Number(meters)) ? Math.round(Number(meters)) : null });
  res.json({ success: true });
}));

router.get('/:id/stops', auth, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canView);
  if (!route) return;
  res.json(await queries.getStopsByRoute(route.id));
}));

router.post('/:id/stops', auth, ownerOrAdmin, wrap(async (req, res) => {
  const route = await loadRoute(req, res, req.params.id, canManage);
  if (!route) return;
  // a rider is following this route right now: a new stop would stop it from ever completing
  if (route.status === 'ongoing' || route.status === 'paused') {
    return res.status(409).json({ error: 'This route is in progress. Stops can be added once it is finished or not started.' });
  }
  const { address, lat, lng, type = 'mailbox', position } = req.body;
  if (!lat || !lng || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return res.status(400).json({ error: 'lat and lng required' });
  if (!['mailbox', 'apartment'].includes(type)) return res.status(400).json({ error: 'type must be mailbox or apartment' });

  // position given: insert there (1 = first) and shift the later stops; otherwise add at the end
  if (position !== undefined && position !== null && position !== '') {
    const pos = Number(position);
    if (!Number.isInteger(pos) || pos < 1) return res.status(400).json({ error: 'position must be a whole number, 1 or more' });
    return res.status(201).json(await queries.insertStopAt(route.id, pos, String(address ?? '').trim() || 'New stop', lat, lng, type));
  }
  const order_num = await queries.getMaxOrder(route.id) + 1;
  res.status(201).json(await queries.createStop(route.id, order_num, address || `Stop ${order_num}`, lat, lng, type));
}));

module.exports = router;
