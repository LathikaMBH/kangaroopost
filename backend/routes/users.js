const router = require('express').Router();
const wrap = require('../middleware/async');
const bcrypt = require('bcryptjs');
const { queries } = require('../database');
const { auth, adminOnly, ownerOrAdmin } = require('../middleware/auth');

// Phone numbers are stored in international form: "+<country code><number>" (e.g. +358401234567).
// Spaces, dashes and brackets are stripped. Returns '' for empty, or null if the value is not valid.
const PHONE_ERROR = 'Enter the phone number with a country code, e.g. +358 40 123 4567';
const normalizePhone = p => {
  const s = String(p ?? '').replace(/[\s\-().]/g, '');
  if (s === '') return '';
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
};

// Shared by owner and rider profile edits. Trims, lower-cases the email (exactly how /auth/login looks it up,
// so the new email works for sign-in) and validates. Returns { data } or { error }.
const profileUpdate = ({ name, email, phone, city }) => {
  const data = {};
  if (name !== undefined) {
    data.name = String(name).trim();
    if (!data.name) return { error: 'Name cannot be empty' };
  }
  if (email !== undefined) {
    data.email = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(data.email)) return { error: 'Enter a valid email address' };
  }
  if (phone !== undefined) {
    data.phone = normalizePhone(phone);
    if (data.phone === null) return { error: PHONE_ERROR };
  }
  if (city !== undefined) data.city = String(city).trim();
  return { data };
};

// Loads the rider named in the URL if the caller may manage them (admin: any rider, route owner: only their own).
// Sends the 404/403 itself and returns null when not allowed.
async function findManagedRider(req, res) {
  const rider = await queries.getUserById(req.params.id);
  if (!rider || rider.role !== 'rider') { res.status(404).json({ error: 'Rider not found' }); return null; }
  if (req.user.role === 'route_owner' && rider.owner_id !== req.user.id) { res.status(403).json({ error: 'Not your rider' }); return null; }
  return rider;
}

// ── Admin: get all route owners ──────────────────────────────────────────────
router.get('/owners', auth, adminOnly, wrap(async (req, res) => res.json(await queries.getAllOwners())));

// ── Admin: create route owner ────────────────────────────────────────────────
router.post('/owners', auth, adminOnly, wrap(async (req, res) => {
  const { name, email, password, city = '', phone = '' } = req.body;
  const ph = normalizePhone(phone);
  if (ph === null) return res.status(400).json({ error: PHONE_ERROR });
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const user = await queries.createUser(name, email.toLowerCase().trim(), hash, 'route_owner', { city, phone: ph, owner_id: null });
    res.status(201).json({ id: user.id, name, email, role: 'route_owner', city, phone: ph });
  } catch (e) {
    if (e.message === 'EMAIL_EXISTS') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
}));

// ── Admin: update / delete owner ─────────────────────────────────────────────
router.put('/owners/:id', auth, adminOnly, wrap(async (req, res) => {
  if (!await queries.getOwnerById(req.params.id)) return res.status(404).json({ error: 'Route owner not found' });
  const { data, error } = profileUpdate(req.body);
  if (error) return res.status(400).json({ error });
  try {
    res.json(await queries.updateUser(req.params.id, data));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
}));
router.delete('/owners/:id', auth, adminOnly, wrap(async (req, res) => {
  await queries.deleteUser(req.params.id); res.json({ success: true });
}));

// ── Owner: get own riders ────────────────────────────────────────────────────
router.get('/riders', auth, ownerOrAdmin, wrap(async (req, res) => {
  if (req.user.role === 'admin') return res.json(await queries.getAllRiders());
  res.json(await queries.getRidersByOwner(req.user.id));
}));

// ── Owner: create rider (max 5) ──────────────────────────────────────────────
router.post('/riders', auth, ownerOrAdmin, wrap(async (req, res) => {
  const owner_id = req.user.role === 'admin' ? req.body.owner_id : req.user.id;
  if (!owner_id) return res.status(400).json({ error: 'owner_id required' });
  const count = await queries.countRidersByOwner(owner_id);
  if (count >= 5) return res.status(400).json({ error: 'Maximum 5 riders per route owner' });
  const { name, email, password, phone = '' } = req.body;
  const ph = normalizePhone(phone);
  if (ph === null) return res.status(400).json({ error: PHONE_ERROR });
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const user = await queries.createUser(name, email.toLowerCase().trim(), hash, 'rider', { owner_id: Number(owner_id), city: '', phone: ph });
    res.status(201).json({ id: user.id, name, email, role: 'rider', owner_id, phone: ph });
  } catch (e) {
    if (e.message === 'EMAIL_EXISTS') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
}));

// ── Owner: update / delete rider ─────────────────────────────────────────────
router.put('/riders/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const rider = await findManagedRider(req, res);
  if (!rider) return;
  const { data, error } = profileUpdate({ ...req.body, city: undefined }); // riders have no city
  if (error) return res.status(400).json({ error });
  try {
    res.json(await queries.updateUser(rider.id, data));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
}));
router.delete('/riders/:id', auth, ownerOrAdmin, wrap(async (req, res) => {
  const rider = await findManagedRider(req, res);
  if (!rider) return;
  await queries.deleteUser(rider.id); res.json({ success: true });
}));

// ── Reset / set a new password ───────────────────────────────────────────────
// Admin: any route owner. Admin or the rider's own route owner: a rider.
// Old logins keep working until their token expires; the new password applies to the next login.
const validPassword = p => typeof p === 'string' && p.length >= 6 && p.length <= 100;

router.post('/owners/:id/password', auth, adminOnly, wrap(async (req, res) => {
  const { password } = req.body;
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 6–100 characters' });
  const user = await queries.setPassword(req.params.id, bcrypt.hashSync(password, 10), 'route_owner');
  if (!user) return res.status(404).json({ error: 'Route owner not found' });
  res.json({ success: true, id: user.id, email: user.email });
}));

router.post('/riders/:id/password', auth, ownerOrAdmin, wrap(async (req, res) => {
  const { password } = req.body;
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be 6–100 characters' });
  const rider = await findManagedRider(req, res);
  if (!rider) return;
  await queries.setPassword(rider.id, bcrypt.hashSync(password, 10), 'rider');
  res.json({ success: true, id: rider.id, email: rider.email });
}));

// ── Owner: riders by owner (admin view) ──────────────────────────────────────
router.get('/owners/:id/riders', auth, adminOnly, wrap(async (req, res) => {
  res.json(await queries.getRidersByOwner(req.params.id));
}));

module.exports = router;
