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

// The roles an account may sign in as. Admin has no choice (the role field is ignored); a route owner may also sign in
// as a rider when admin gave them the Rider role.
const rolesOf = user => user.role === 'route_owner' && user.can_ride ? ['route_owner', 'rider'] : [user.role];
const ROLE_NAMES = { route_owner: 'Route owner', rider: 'Rider' };

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await queries.getUserByEmail(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });

  // no role chosen: the account's own role
  let actAs = user.role;
  if (user.role !== 'admin' && role) {
    if (!rolesOf(user).includes(role)) return res.status(403).json({ error: `This account does not have the ${ROLE_NAMES[role] || role} role` });
    actAs = role;
  }
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
