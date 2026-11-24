// Missed-delivery complaints: a route owner files one against one of their riders; the rider accepts it, then marks it done.
// A complaint is private to the owner who filed it and the rider it was filed against (and admin): to anyone else it
// does not exist (404).
//   status  : open -> accepted -> resolved
//   list    : admin all, route owner their own, rider the ones filed against them
//   create  : route owner, for one of their routes in one delivery week (KAN-39). The rider is filled in from that
//             week's run; the owner can change it to one of their own riders (or themselves, if they also ride).
//   accept  : the rider, while it is open
//   resolve : the rider once accepted, or the owner at any point before it is resolved
//   delete  : the owner who filed it, or admin. It is kept as "withdrawn" (KAN-39), hidden from the owner and the rider.
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

// the weeks a complaint can be filed for, newest first
router.get('/weeks', auth, ownerOnly, wrap(async (_req, res) => res.json(await queries.getComplaintWeeks())));

// One of the owner's routes in one week: the run (null when it was not run) and its stops to pick from. Without a run,
// the route's stops as they are now.
const findWeek = async (y, w) => (await queries.getComplaintWeeks()).find(x => x.iso_year === Number(y) && x.iso_week === Number(w));
const ownRoute = async (req, id) => {
  if (!Number.isInteger(Number(id)) || id === '' || id == null) return null;
  const route = await queries.getRouteById(id);
  return route && route.owner_id === req.user.id ? route : null;
};
const weekRun = async (route, week) => {
  const run = await queries.getWeekRun(route.id, week.iso_year, week.iso_week);
  const stops = run ? await queries.getRunStops(run.id)
                    : (await queries.getStopsByRoute(route.id)).map(({ id, order_num, address, type }) => ({ id, order_num, address, type }));
  return { run, stops };
};

router.get('/route-week', auth, ownerOnly, wrap(async (req, res) => {
  const route = await ownRoute(req, req.query.route_id);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  const week = await findWeek(req.query.iso_year, req.query.iso_week);
  if (!week) return res.status(400).json({ error: 'Pick one of the last 12 delivery weeks' });
  const { run, stops } = await weekRun(route, week);
  res.json({ run, stops, rider_id: run?.rider_id ?? route.rider_id ?? null });
}));

router.post('/', auth, ownerOnly, wrap(async (req, res) => {
  const address = String(req.body.address ?? '').trim();
  if (!address) return res.status(400).json({ error: 'Address required' });
  if (address.length > 500) return res.status(400).json({ error: 'Address is too long' });
  const route = await ownRoute(req, req.body.route_id);
  if (!route) return res.status(400).json({ error: 'Pick the route' });
  const week = await findWeek(req.body.iso_year, req.body.iso_week);
  if (!week) return res.status(400).json({ error: 'Pick one of the last 12 delivery weeks' });
  // one of the owner's riders, or the owner themselves when they also ride
  const rider = await queries.getUserById(req.body.rider_id);
  const ownRider = rider && ((rider.role === 'rider' && rider.owner_id === req.user.id) || (rider.id === req.user.id && rider.can_ride));
  if (!ownRider) return res.status(400).json({ error: 'Rider not found' });
  const { run, stops } = await weekRun(route, week);
  const stop_id = req.body.stop_id == null || req.body.stop_id === '' ? null : Number(req.body.stop_id);
  if (stop_id != null && !stops.some(s => s.id === stop_id)) return res.status(400).json({ error: 'Stop not found on this route' });
  const complaint = await queries.createComplaint({ owner_id: req.user.id, rider_id: rider.id, address, route,
    iso_year: week.iso_year, iso_week: week.iso_week, run_id: run?.id ?? null, stop_id });
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
  if (c.status === 'withdrawn') return res.status(409).json({ error: 'Complaint is withdrawn' });
  await queries.withdrawComplaint(c.id, req.user);
  req.io.to(`user_${c.rider_id}`).emit('complaint:deleted', { id: c.id });
  res.json({ success: true });
}));

module.exports = router;
