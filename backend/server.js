require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { CORS_ORIGINS, JWT_SECRET } = require('./config');
const { init, queries } = require('./database');
const { canView } = require('./middleware/access');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, credentials: true }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // behind Railway's proxy: use the real client IP (rate limiting)
// No CSP: the screens load Google Maps scripts and inline styles (the API only returns JSON).
// The referrer must reach Google, whose Maps key is restricted to the app's addresses.
app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '1mb' })); // a long route's road path is a few hundred KB at most

// Attach io to every request so route handlers can emit events
app.use((req, _res, next) => { req.io = io; next(); });

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/routes',   require('./routes/routes'));
app.use('/api/stops',    require('./routes/stops'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/areas',    require('./routes/areas'));
app.use('/api/catalog',  require('./routes/catalog'));   // the website's server only (X-Api-Key)
app.use('/api/website',  require('./routes/website'));   // the website's server only (X-Api-Key)
app.use('/api/reports',  require('./routes/reports'));   // the website's server only (X-Api-Key), for its admin

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Screens (frontend/dist) ───────────────────────────────────────────────────
// When the frontend has been built (Railway runs the root `npm run build`), this server also serves it, so the app
// and its API share one address. Hashed files in /assets never change; everything else (index.html, the service
// worker, the manifest) must be checked on every load so new versions arrive.
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, {
    index: false,
    setHeaders: (res, file) => res.setHeader('Cache-Control',
      file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
  }));
  // single-page app: any other page address gets index.html (unknown /api addresses still get a 404 below).
  // A missing file (/assets/..., or any name with an extension) gets a 404, not index.html: a browser still holding
  // an older version asks for its old script names, and HTML in their place left the page blank.
  app.get(/^\/(?!api\/|api$|socket\.io\/|assets\/)(?!.*\.[A-Za-z0-9]+$).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
}
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Any error thrown/rejected in a route handler ends up here
app.use((err, _req, res, _next) => {
  console.error('❌', err);
  if (!res.headersSent) res.status(500).json({ error: 'Server error' });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
// Only signed-in users may connect (the browser sends its login token)
io.use((socket, next) => {
  try { socket.user = jwt.verify(socket.handshake.auth?.token || '', JWT_SECRET); next(); }
  catch { next(new Error('unauthorized')); }
});

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  socket.join(`user_${socket.user.id}`); // personal room, for events meant for one user (e.g. complaints)

  // Join a room for a specific route (master + rider both join)
  // Admin: any route. Route owner: their own routes. Rider: the route assigned to them.
  socket.on('join:route', async (routeId) => {
    try {
      const route = await queries.getRouteById(routeId);
      if (!route || !canView(socket.user, route)) return;
      socket.join(`route_${routeId}`);
      console.log(`   → joined room route_${routeId}`);
    } catch (e) { console.error('join:route failed', e.message); }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
init().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 Kangodrop backend running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health\n`);
  });
}).catch(err => {
  console.error('❌ Could not connect to / set up PostgreSQL:', err.message);
  process.exit(1);
});
