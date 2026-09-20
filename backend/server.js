require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const { CORS_ORIGINS, JWT_SECRET } = require('./config');
const { init, queries } = require('./database');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, credentials: true }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // behind Railway's proxy: use the real client IP (rate limiting)
app.use(helmet());
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

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

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

  // Join a room for a specific route (master + rider both join)
  // Admin: any route. Route owner: their own routes. Rider: the route assigned to them.
  socket.on('join:route', async (routeId) => {
    try {
      const route = await queries.getRouteById(routeId);
      const u = socket.user;
      const allowed = route && (u.role === 'admin'
        || (u.role === 'route_owner' && route.owner_id === u.id)
        || (u.role === 'rider' && route.rider_id === u.id));
      if (!allowed) return;
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
    console.log(`\n🚀 KangarooPost backend running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health\n`);
  });
}).catch(err => {
  console.error('❌ Could not connect to / set up PostgreSQL:', err.message);
  process.exit(1);
});
