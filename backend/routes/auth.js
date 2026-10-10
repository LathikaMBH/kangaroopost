const router = require('express').Router();
const wrap = require('../middleware/async');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queries } = require('../database');
const rateLimit = require('express-rate-limit');
const { JWT_SECRET, isProd } = require('../config');

// only FAILED attempts count: 10 per 15 minutes per IP in production
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: isProd ? 10 : 1000, skipSuccessfulRequests: true,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Try again in 15 minutes.' },
});

// The roles an account may sign in as. Admin signs in only as admin; a route owner may also sign in as a rider when
// admin gave them the Rider role.
const rolesOf = user => user.role === 'route_owner' && user.can_ride ? ['route_owner', 'rider'] : [user.role];
// compared against when the email has no account, so that case takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const ROLE_NAMES = { admin: 'Admin', route_owner: 'Route owner', rider: 'Rider' };

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await queries.getUserByEmail(email.toLowerCase().trim());
  // One message, and a hash check either way, so a response never reveals whether an email is registered (KAN-21)
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Email or password is incorrect' });

  // Non-admins must choose a role, so an account with both roles never silently signs in as owner (KAN-20).
  // Admin may still omit it.
  if (!role && user.role !== 'admin') return res.status(400).json({ error: 'Please select role' });
  if (role && !rolesOf(user).includes(role)) return res.status(403).json({ error: `This account does not have the ${ROLE_NAMES[role] || role} role` });
  const actAs = role || user.role;
  // A route owner riding gets the rider views, over all the routes they own (see access.js)
  const acting_owner = user.role === 'route_owner' && actAs === 'rider';
  const owner_id = acting_owner ? user.id : user.owner_id;

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: actAs, owner_id, acting_owner },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: actAs, city: user.city, phone: user.phone, owner_id, acting_owner, roles: rolesOf(user) } });
}));

module.exports = router;
