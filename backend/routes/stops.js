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
