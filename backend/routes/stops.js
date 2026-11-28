const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, ownerOrAdmin } = require('../middleware/auth');
const { canManage, loadStop } = require('../middleware/access');

router.put('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const found = await loadStop(req, res, req.params.id, canManage);
  if (!found) return;
  const { stop } = found;
  const { address, lat, lng, type, order_num } = req.body;
  res.json(await queries.updateStop(stop.id, address ?? stop.address, lat ?? stop.lat, lng ?? stop.lng, type ?? stop.type, order_num ?? stop.order_num));
}));

// KAN-55: the owner corrects a box's side of the road. side: 'auto' (worked out from the road path again), 'none'
// (no side: marked whichever way the rider goes), or the compass bearing from the road to the box (0 north, 90 east ...)
router.put('/:id/side', auth, ownerOrAdmin, wrap(async (req, res) => {
  const found = await loadStop(req, res, req.params.id, canManage);
  if (!found) return;
  const { side } = req.body;
  if (side === 'auto') {
    await queries.setStopSide(found.stop.id, null, false);
    await queries.refreshSides(found.stop.route_id);
    return res.json(await queries.getStopById(found.stop.id));
  }
  if (side === 'none') return res.json(await queries.setStopSide(found.stop.id, null, true));
  const bearing = Number(side);
  if (side === null || side === '' || !Number.isFinite(bearing) || bearing < 0 || bearing >= 360) {
    return res.status(400).json({ error: "side must be 'auto', 'none' or a bearing from 0 to 359" });
  }
  res.json(await queries.setStopSide(found.stop.id, bearing, true));
}));

router.delete('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const found = await loadStop(req, res, req.params.id, canManage);
  if (!found) return;
  // a rider is following this route right now: removing a stop would break their progress
  if (found.route.status === 'ongoing' || found.route.status === 'paused') {
    return res.status(409).json({ error: 'This route is in progress. Stops can be deleted once it is finished or not started.' });
  }
  await queries.deleteStop(found.stop.id);
  res.json({ success: true });
}));

module.exports = router;
