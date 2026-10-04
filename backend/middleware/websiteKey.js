// Requests from the Kangarooposti website's server: they carry the shared key (WEBSITE_API_KEY) in X-Api-Key.
const crypto = require('crypto');
const { WEBSITE_API_KEY } = require('../config');

const digest = s => crypto.createHash('sha256').update(String(s)).digest();

module.exports = function websiteKey(req, res, next) {
  if (!WEBSITE_API_KEY) return res.status(503).json({ error: 'The website connection is not enabled' });
  if (!crypto.timingSafeEqual(digest(req.get('x-api-key') || ''), digest(WEBSITE_API_KEY))) return res.status(401).json({ error: 'Invalid API key' });
  next();
};
