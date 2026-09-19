// Settings that must be safe in production. Loaded once; the app refuses to start if they are unsafe.
const isProd = process.env.NODE_ENV === 'production';

// ── JWT signing secret ──────────────────────────────────────────────────────────
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (isProd) throw new Error('JWT_SECRET must be set in production (use a long random string, 32+ characters)');
  JWT_SECRET = 'kangaroopost_dev_only_secret'; // local development only
}
if (isProd && JWT_SECRET.length < 32) throw new Error('JWT_SECRET is too short: use at least 32 characters in production');

// ── Browser origins allowed to call the API / open the socket ───────────────────
// CORS_ORIGINS="https://your-site.netlify.app,https://www.your-domain.com"
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
if (!isProd) CORS_ORIGINS.push('http://localhost:3000');
if (isProd && CORS_ORIGINS.length === 0) console.warn('⚠️  CORS_ORIGINS is empty: browsers on other sites cannot call the API directly (live updates will fail)');

// ── First admin account (created only when it does not exist yet) ───────────────
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@kangaroopost.com').trim().toLowerCase();
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD && !isProd) ADMIN_PASSWORD = 'admin123'; // local development only
if (ADMIN_PASSWORD && isProd && ADMIN_PASSWORD.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters in production');

module.exports = { isProd, JWT_SECRET, CORS_ORIGINS, ADMIN_EMAIL, ADMIN_PASSWORD };
