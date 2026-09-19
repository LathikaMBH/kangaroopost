const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(header.slice(7), JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}

const adminOnly      = (req, res, next) => req.user.role === 'admin'        ? next() : res.status(403).json({ error: 'Admin only' });
const ownerOrAdmin   = (req, res, next) => ['admin','route_owner'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Owner or Admin only' });
const notRider       = (req, res, next) => req.user.role !== 'rider'        ? next() : res.status(403).json({ error: 'Not for riders' });

module.exports = { auth, adminOnly, ownerOrAdmin, notRider };
