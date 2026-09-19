require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { init } = require('./database');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: ['https://papertrail-rauma.netlify.app', 'http://localhost:3000'], credentials: true }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ['https://papertrail-rauma.netlify.app', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

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
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Join a room for a specific route (master + rider both join)
  socket.on('join:route', (routeId) => {
    socket.join(`route_${routeId}`);
    console.log(`   → joined room route_${routeId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
init().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 PaperTrail backend running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health\n`);
  });
}).catch(err => {
  console.error('❌ Could not connect to / set up PostgreSQL:', err.message);
  process.exit(1);
});
