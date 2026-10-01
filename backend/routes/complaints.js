// Missed-delivery complaints: a route owner files one against one of their riders; the rider accepts it, then marks it done.
// A complaint is private to the owner who filed it and the rider it was filed against (and admin): to anyone else it
// does not exist (404).
//   status  : open -> accepted -> resolved
//   list    : admin all, route owner their own, rider the ones filed against them
//   create  : route owner (for their own rider)
//   accept  : the rider, while it is open
//   resolve : the rider once accepted, or the owner at any point before it is resolved
//   delete  : the owner who filed it, or admin
const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth } = require('../middleware/auth');

const ownerOnly = (req, res, next) => req.user.role === 'route_owner' ? next() : res.status(403).json({ error: 'Route owner only' });

const isRiderOf = (u, c) => u.role === 'rider' && u.id === c.rider_id;
const isOwnerOf = (u, c) => u.role === 'route_owner' && u.id === c.owner_id;
const involved  = (u, c) => u.role === 'admin' || isRiderOf(u, c) || isOwnerOf(u, c);

// Loads the complaint named in the URL if `check` allows the caller. Sends the 404/403 itself and returns null otherwise.
// Someone not involved in the complaint gets a 404, so they cannot even tell it exists.
async function loadComplaint(req, res, check) {
  const c = await queries.getComplaintById(req.params.id);
  if (!c || !involved(req.user, c)) { res.status(404).json({ error: 'Complaint not found' }); return null; }
  if (!check(req.user, c)) { res.status(403).json({ error: 'Not allowed' }); return null; }
  return c;
}

router.get('/', auth, wrap(async (req, res) => {
  if (req.user.role === 'admin')       return res.json(await queries.getAllComplaints());
  if (req.user.role === 'route_owner') return res.json(await queries.getComplaintsByOwner(req.user.id));
  res.json(await queries.getComplaintsForRider(req.user.id));
}));

router.post('/', auth, ownerOnly, wrap(async (req, res) => {
  const address = String(req.body.address ?? '').trim();
  if (!address) return res.status(400).json({ error: 'Address required' });
  if (address.length > 500) return res.status(400).json({ error: 'Address is too long' });
  const rider = await queries.getUserById(req.body.rider_id);
  if (!rider || rider.role !== 'rider' || rider.owner_id !== req.user.id) return res.status(400).json({ error: 'Rider not found' });
  const complaint = await queries.createComplaint(req.user.id, rider.id, address);
  req.io.to(`user_${rider.id}`).emit('complaint:created', complaint);
  res.status(201).json(complaint);
}));

// Moves the complaint to the next status if `allowedFrom(user)` lists its current one, and tells the owner and rider
const step = (who, allowedFrom, update, event) => wrap(async (req, res) => {
  const c = await loadComplaint(req, res, who);
  if (!c) return;
  if (!allowedFrom(req.user).includes(c.status)) return res.status(409).json({ error: `Complaint is ${c.status}` });
  const updated = await update(c.id);
  req.io.to(`user_${c.owner_id}`).to(`user_${c.rider_id}`).emit(event, updated);
  res.json(updated);
});

router.post('/:id/accept',  auth, step(isRiderOf, () => ['open'], queries.acceptComplaint, 'complaint:accepted'));
router.post('/:id/resolve', auth, step((u, c) => isRiderOf(u, c) || isOwnerOf(u, c),
  u => u.role === 'rider' ? ['accepted'] : ['open', 'accepted'], queries.resolveComplaint, 'complaint:resolved'));

router.delete('/:id', auth, wrap(async (req, res) => {
  const c = await loadComplaint(req, res, (u, c) => u.role === 'admin' || isOwnerOf(u, c));
  if (!c) return;
  await queries.deleteComplaint(c.id);
  req.io.to(`user_${c.rider_id}`).emit('complaint:deleted', { id: c.id });
  res.json({ success: true });
}));

module.exports = router;
