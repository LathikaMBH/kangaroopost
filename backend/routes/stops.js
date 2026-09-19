const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, ownerOrAdmin } = require('../middleware/auth');

// Loads the stop in the URL if the caller may change it (admin: any, route owner: stops on their own routes).
// Sends the 404/403 itself and returns null when not allowed.
async function findManagedStop(req, res) {
  const stop = await queries.getStopById(req.params.id);
  if (!stop) { res.status(404).json({ error: 'Stop not found' }); return null; }
  const route = await queries.getRouteById(stop.route_id);
  if (!route) { res.status(404).json({ error: 'Route not found' }); return null; }
  if (req.user.role === 'route_owner' && route.owner_id !== req.user.id) {
    res.status(403).json({ error: 'Not your route' }); return null;
  }
  return { stop, route };
}

router.put('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const found = await findManagedStop(req, res);
  if (!found) return;
  const { stop } = found;
  const { address, lat, lng, type, order_num } = req.body;
  res.json(await queries.updateStop(stop.id, address ?? stop.address, lat ?? stop.lat, lng ?? stop.lng, type ?? stop.type, order_num ?? stop.order_num));
}));

router.delete('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const found = await findManagedStop(req, res);
  if (!found) return;
  // a rider is following this route right now: removing a stop would break their progress
  if (found.route.status === 'ongoing' || found.route.status === 'paused') {
    return res.status(409).json({ error: 'This route is in progress. Stops can be deleted once it is finished or not started.' });
  }
  await queries.deleteStop(found.stop.id);
  res.json({ success: true });
}));

module.exports = router;
