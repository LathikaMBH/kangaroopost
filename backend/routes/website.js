// What the Kangarooposti website's server may ask besides the route catalog. Requires the shared key (X-Api-Key).
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const wrap = require('../middleware/async');
const websiteKey = require('../middleware/websiteKey');
const { queries } = require('../database');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // same work for unknown emails as for real ones

router.use(websiteKey);

// One admin for both: the website signs its admin in by asking whether these are this admin's email and password.
// Answers only yes (with the admin's id, name and email) or no; nothing about other accounts.
// The website limits sign-in attempts per visitor before it asks.
router.post('/admin-login', wrap(async (req, res) => {
  const email = String(req.body.email ?? '').toLowerCase().trim();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = email && password ? await queries.getUserByEmail(email) : null;
  const ok = bcrypt.compareSync(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok || user.role !== 'admin') return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ admin: { id: user.id, name: user.name, email: user.email } });
}));

module.exports = router;
