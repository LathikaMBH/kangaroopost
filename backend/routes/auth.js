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

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await queries.getUserByEmail(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, owner_id: user.owner_id },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, city: user.city, phone: user.phone, owner_id: user.owner_id } });
}));

module.exports = router;
