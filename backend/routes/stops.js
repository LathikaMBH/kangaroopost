const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, ownerOrAdmin } = require('../middleware/auth');

router.put('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const stop = await queries.getStopById(req.params.id);
  if (!stop) return res.status(404).json({ error: 'Stop not found' });
  const { address, lat, lng, type, order_num } = req.body;
  res.json(await queries.updateStop(req.params.id, address ?? stop.address, lat ?? stop.lat, lng ?? stop.lng, type ?? stop.type, order_num ?? stop.order_num));
}));

router.delete('/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  await queries.deleteStop(req.params.id); res.json({ success: true });
}));

module.exports = router;
