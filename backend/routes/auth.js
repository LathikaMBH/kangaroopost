const router = require('express').Router();
const wrap = require('../middleware/async');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queries } = require('../database');
const JWT_SECRET = process.env.JWT_SECRET || 'papertrail_secret_2024';

router.post('/login', wrap(async (req, res) => {
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
