# KangarooPost 🗺️
### GPS-Powered Delivery Route Tracking Platform

[![Live App](https://img.shields.io/badge/Live%20App-papertrail--rauma.netlify.app-7C5CEA?style=flat-square)](https://papertrail-rauma.netlify.app)
[![Backend](https://img.shields.io/badge/Backend-Railway-0B0D0E?style=flat-square)](https://papertrail-production-3f35.up.railway.app/api/health)
[![License](https://img.shields.io/badge/License-Private-red?style=flat-square)]()

KangarooPost is a full-stack Progressive Web App (PWA) for managing and tracking newspaper and parcel delivery routes. It uses real GPS auto-detection so riders are tracked automatically — no manual tapping required.

> **Built with Claude AI** — This product was designed and developed using Claude AI (Anthropic) as an AI pair-programmer, from architecture and database design through to production deployment.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| **Frontend (Netlify)** | https://papertrail-rauma.netlify.app |
| **Backend API (Railway)** | https://papertrail-production-3f35.up.railway.app |
| **Health check** | https://papertrail-production-3f35.up.railway.app/api/health |
| **GitHub repo** | https://github.com/LathikaMBH/papertrail |

---

## 👥 User Roles

KangarooPost has three distinct user roles:

### 👑 Admin
- Creates and manages Route Owner accounts (name, city, phone, email, password)
- Views all route owners, their riders, routes and delivery stats
- Full system visibility

### 🗺️ Route Owner
- Creates delivery routes by walking the route and pinning GPS coordinates on a map
- Configures each stop as **Mailbox** (auto-detected) or **Apartment** (manual tap)
- Creates up to **5 rider accounts**
- Assigns routes to riders
- Monitors live delivery progress and completion

### 🚲 Rider
- Sees only their assigned routes
- Starts a route — GPS tracking begins automatically
- **Mailbox stops** → auto-marked delivered when within 20 metres (no tapping)
- **Apartment stops** → app pauses and shows a Delivered button
- Can **Pause** (GPS stops) and **Restart** (GPS resumes) at any time
- Route auto-completes when all stops are done

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, React Router, Google Maps (`@vis.gl/react-google-maps`) |
| **Real-time** | Socket.io (WebSockets) |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL 18 (`pg` driver) — local via `db/`, managed PostgreSQL (Render) in production |
| **Auth** | JWT (JSON Web Tokens) |
| **Maps** | Google Maps JavaScript API — needs an API key (see [Google Maps setup](#google-maps-setup)) |
| **GPS** | Browser Geolocation API + Haversine formula |
| **Deployment** | Render (backend + DB) · Netlify (frontend) |
| **PWA** | Installable on iOS and Android from the browser |

---

## 📁 Project Structure

```
kangaroopost/
├── backend/
│   ├── server.js              # Express + Socket.io entry point
│   ├── database.js            # PostgreSQL (pg) connection + schema + queries
│   ├── migrate-json-to-postgres.js  # One-off import from the old kangaroopost.json
│   ├── .env                   # DATABASE_URL, JWT_SECRET, PORT (not committed)
│   ├── middleware/
│   │   ├── auth.js            # JWT verification + role guards
│   │   └── async.js           # Forwards async handler errors to Express
│   └── routes/
│       ├── auth.js            # POST /api/auth/login
│       ├── users.js           # Owner + rider management
│       ├── routes.js          # Route CRUD + stop creation
│       ├── stops.js           # Stop update / delete
│       └── delivery.js        # Start, pause, resume, deliver, end, GPS ping
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/         # Admin dashboard, owners list, all routes
│   │   │   ├── owner/         # Owner dashboard, routes, riders, create route
│   │   │   └── rider/         # Rider dashboard, GPS navigation screen
│   │   ├── context/
│   │   │   ├── AuthContext.jsx    # Login state + JWT storage
│   │   │   └── SocketContext.jsx  # Socket.io real-time connection
│   │   ├── services/
│   │   │   ├── api.js         # All HTTP calls to backend
│   │   │   └── gps.js         # Haversine distance calculation
│   │   └── index.css          # Purple design system
│   ├── .env.example           # Template for VITE_GOOGLE_MAPS_API_KEY (copy to .env)
│   ├── .env.production        # VITE_API_URL for production build
│   └── vite.config.js         # Dev server + proxy config
├── db/
│   ├── server.mjs             # Starts a local PostgreSQL server (embedded-postgres)
│   └── data/                  # Local database files (not committed)
├── start.sh                   # Starts database + backend + frontend together
└── README.md
```

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js v18+
- Git
- PostgreSQL — **nothing to install**. The repo includes `db/`, which runs a real
  PostgreSQL server as a normal Node process (no admin rights, no Windows service).
  If you already have PostgreSQL installed, you can use it instead (see [Using your own PostgreSQL](#using-your-own-postgresql)).

### Step 1 — Clone the repo

```bash
git clone https://github.com/LathikaMBH/papertrail.git
cd papertrail
```

### Step 2 — Start the database

```bash
cd db
npm install
npm start
```

You should see:
```
PostgreSQL ready: postgresql://postgres:postgres@localhost:5432/kangaroopost
```

The first run creates the `kangaroopost` database in `db/data/`. Leave this terminal
open — the database only runs while this process is running. Press `Ctrl+C` to stop it;
your data is kept and is there next time.

### Step 3 — Backend setup

In a **new terminal**:

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` folder:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kangaroopost
JWT_SECRET=your_random_secret_here
PORT=4000
NODE_ENV=development
```

Start the backend:
```bash
npm start
```

You should see:
```
✅ Database schema ready
✅ Seed: admin@kangaroopost.com / admin123
🚀 KangarooPost backend running on http://localhost:4000
```

The tables are created automatically on startup. If it can't reach the database it prints
`❌ Could not connect to / set up PostgreSQL` and exits — make sure Step 2 is running.

### Step 4 — Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:3000**

The create-route and rider navigation screens use Google Maps, so they show an
"API key needed" panel until you add a key — see [Google Maps setup](#google-maps-setup).
Everything else works without one.

### Step 5 — Login with default credentials

```
Email:    admin@kangaroopost.com
Password: admin123
```

### Google Maps setup

The create-route page (`/owner/routes/new`) and the rider navigation screen show a Google map.

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and **enable billing**
   (Google requires a billing account, though Maps Platform has a monthly free allowance — check current pricing).
2. Enable **Maps JavaScript API** (APIs & Services → Library).
3. Create an API key (APIs & Services → Credentials → Create credentials → API key).
4. **Restrict the key** — it is visible in the browser, so:
   - *Application restrictions* → HTTP referrers: `http://localhost:3000/*` and your production domain (e.g. `https://papertrail-rauma.netlify.app/*`)
   - *API restrictions* → Maps JavaScript API only
5. Copy `frontend/.env.example` to `frontend/.env` and set:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your_key_here
   VITE_GOOGLE_MAPS_MAP_ID=        # optional, see below
   ```
6. **Restart** `npm run dev` — Vite only reads `.env` at startup.

**Map ID:** the map markers need a Map ID. Leave `VITE_GOOGLE_MAPS_MAP_ID` empty to use Google's
`DEMO_MAP_ID` while developing. For production create your own (Google Maps Platform → Map Management →
Create map ID, type *JavaScript*, vector) and put it in the variable.

If the key is missing or Google rejects it, the map area shows a message saying why. GPS capture and
delivery tracking keep working either way; only the map picture and tap-to-pin are affected.

### One-command start (optional)

From the project root, in Git Bash / macOS / Linux:

```bash
./start.sh
```

This installs missing dependencies, then starts the database, backend (port 4000) and
frontend (port 3000) together. `Ctrl+C` stops all three.

### Using your own PostgreSQL

Skip Step 2 and point `DATABASE_URL` in `backend/.env` at your server (create the
database first, e.g. `createdb kangaroopost`):

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/kangaroopost
```

Alternatively use separate variables: `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`,
`PG_PASSWORD`. For a hosted database that requires SSL, add `PG_SSL=true`.

### Managing the local database

| Task | How |
|---|---|
| **Back up** | Stop the database (`Ctrl+C`), then copy the `db/data/` folder |
| **Reset to empty** | Stop the database, delete `db/data/`, start it again, then restart the backend (the admin is re-seeded) |
| **Use another port** | `PG_PORT=5433 npm start` in `db/`, and update the port in `DATABASE_URL` |
| **Import old data** | If you have a `kangaroopost.json` from the previous file-based version, run `node migrate-json-to-postgres.js` in `backend/` (safe to re-run) |

> The default `postgres` / `postgres` credentials are for **local development only**.
> Never use them on a server that is reachable from the network.

---

## 🔑 API Reference

### Authentication
```
POST /api/auth/login          { email, password } → { token, user }
```

### Users (Admin only)
```
GET    /api/users/owners           Get all route owners
POST   /api/users/owners           Create route owner
PUT    /api/users/owners/:id       Update owner (incl. password)
DELETE /api/users/owners/:id       Delete owner
GET    /api/users/owners/:id/riders  Get riders for an owner
GET    /api/users/riders           Get riders (own riders for owner)
POST   /api/users/riders           Create rider (max 5 per owner)
DELETE /api/users/riders/:id       Delete rider
```

### Routes
```
GET    /api/routes             Get routes (filtered by role)
GET    /api/routes/:id         Get route with stops
POST   /api/routes             Create route
PUT    /api/routes/:id         Update route name / assign rider
DELETE /api/routes/:id         Delete route + stops
POST   /api/routes/:id/assign  Assign rider { rider_id }
GET    /api/routes/:id/stops   Get stops for route
POST   /api/routes/:id/stops   Add stop { lat, lng, address, type }
```

### Stops
```
PUT    /api/stops/:id          Update stop details / type
DELETE /api/stops/:id          Delete stop
```

### Delivery
```
POST   /api/delivery/start/:routeId    Start route (resets stops)
POST   /api/delivery/pause/:routeId    Pause route
POST   /api/delivery/resume/:routeId   Resume route
POST   /api/delivery/stop/:stopId      Mark stop delivered { method: 'auto'|'manual' }
POST   /api/delivery/end/:routeId      Force end route
POST   /api/delivery/ping              GPS ping { routeId, lat, lng }
GET    /api/health                     Health check
```

---

## 🔌 Real-time Events (Socket.io)

Clients join a room per route: `socket.emit('join:route', routeId)`

| Event | Direction | Payload |
|---|---|---|
| `route:started` | Server → Client | `{ routeId, riderId, riderName }` |
| `route:paused` | Server → Client | `{ routeId, riderId }` |
| `route:resumed` | Server → Client | `{ routeId, riderId }` |
| `route:completed` | Server → Client | `{ routeId }` |
| `stop:delivered` | Server → Client | `{ stopId, routeId, method, riderId }` |
| `rider:location` | Server → Client | `{ routeId, riderId, lat, lng }` |

---

## 🗄️ Database Schema

```sql
users (id, name, email, password_hash, role, city, phone, owner_id, created_at)
  role: 'admin' | 'route_owner' | 'rider'
  owner_id: riders belong to a route_owner (users.id)

routes (id, name, status, owner_id, rider_id, started_at, paused_at, completed_at, created_at)
  status: 'not_started' | 'ongoing' | 'paused' | 'completed'

  rider_id: FK → users.id, set to NULL if that rider is deleted (route becomes unassigned)

stops (id, route_id, order_num, address, lat, lng, type, delivered, delivered_at, delivered_method, created_at)
  type: 'mailbox' | 'apartment'
  route_id: FK → routes.id, deleted together with the route
  delivered_method: 'auto' | 'manual'

location_pings (id, route_id, rider_id, lat, lng, recorded_at)
  route_id: FK → routes.id, deleted together with the route
```

The schema is created automatically by `backend/database.js` on startup (`CREATE TABLE IF NOT EXISTS`).

---

## 🚀 Deployment

Production layout: **Netlify** (frontend) → **Render** web service (backend) → **PostgreSQL** (Render database).

> ⚠️ **Order matters.** The backend refuses to start without the settings below (by design — it will not
> run in production with a default password or secret). Set everything up **before** merging to `main`,
> because a push to `main` redeploys the backend immediately.

### 1. Database
Create a PostgreSQL database (e.g. Render → *New → PostgreSQL*). Copy its **Internal Database URL**
(use the *External* URL only if the backend runs somewhere else — and then also set `PG_SSL=true`).
Tables are created automatically on the first start.

### 2. Backend (Render web service)
Root directory `backend` · build command `npm install` · start command `npm start` · health check path `/api/health`.

| Environment variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the database URL from step 1 |
| `JWT_SECRET` | **required**, 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGINS` | **required**: your frontend address, e.g. `https://your-site.netlify.app` (comma-separate several) |
| `ADMIN_EMAIL` | first admin's email (first start only) |
| `ADMIN_PASSWORD` | first admin's password, 10+ characters (first start only). **Not** `admin123` |
| `PG_SSL` | `true` only if the database needs SSL |

The server stops at startup with a clear message if `JWT_SECRET`, `ADMIN_PASSWORD` (on an empty database) or a strong-enough
secret is missing. `ADMIN_EMAIL`/`ADMIN_PASSWORD` are only used to create the first admin; after that you can
change the admin's password by signing in and using **Password**, and remove `ADMIN_PASSWORD` from the host.

### 3. Frontend (Netlify)
1. In `frontend/netlify.toml` the `/api/*` and `/socket.io/*` redirects must point at your backend address.
2. Set these **before building** (Netlify → Site settings → Environment variables, or `frontend/.env.production`
   if you build locally and drag `dist/` in). Vite bakes them into the build:
   ```
   VITE_API_URL=https://your-backend.onrender.com     # live updates connect here directly (Netlify cannot proxy WebSockets)
   VITE_GOOGLE_MAPS_API_KEY=your_restricted_key
   VITE_GOOGLE_MAPS_MAP_ID=your_map_id                # create one in Google Cloud (see Google Maps setup)
   ```
3. Build: `npm run build` (inside `frontend/`), then deploy `dist/` — or connect the GitHub repo (base directory
   `frontend`, build command `npm run build`, publish directory `dist`).

### 4. Google Maps key for production
In Google Cloud Console → Credentials → your key → add your production address to the **HTTP referrer**
restrictions (e.g. `https://your-site.netlify.app/*`), keep it restricted to the *Maps JavaScript API*, and make
sure billing is enabled.

### 5. Smoke test after deploying
1. `https://your-backend.onrender.com/api/health` → `{"status":"ok"}`
2. Open the site, sign in with the admin you created. The login page must **not** show any demo credentials.
3. Create a route owner, sign in as them, create a route on the map (tap to pin), assign a rider, and check the
   rider screen and the live status tiles.
4. Sign out and in again from a phone (GPS needs HTTPS — Netlify provides it).

### Security notes
- Sign-in is rate limited (10 failed attempts per 15 minutes per IP). Live-location sockets require a valid login,
  and a user can only watch routes they own or are assigned to.
- Passwords are stored hashed; the admin can set new passwords for owners, and owners for their riders.
- Login tokens last 30 days and cannot be revoked individually — changing `JWT_SECRET` signs everyone out.
- **Render free tier:** the web service sleeps after inactivity (first request is slow) and free databases can expire.
  Use a paid database plan for real data, and back it up (Render dashboard or `pg_dump`).

---

## 🌿 Git Workflow (for developers)

**Never commit directly to `main`.** Use feature branches:

```bash
# Start new work
git checkout -b feature/your-feature-name

# Make changes, then commit
git add .
git commit -m "Description of what you changed"

# Push your branch
git push origin feature/your-feature-name

# Open a Pull Request on GitHub for review
```

### Branch naming
```
feature/add-notification-system
fix/gps-accuracy-issue
improvement/rider-dashboard-ui
```

---

## ⚠️ Important Rules

1. **Never commit `.env` files** — they contain secrets
2. **Never commit `node_modules/`** — too large, use `npm install`
3. **Never commit `frontend/dist/`** — build artifacts
4. **Always test locally** before pushing
5. **Ask before changing** the database schema — coordinate with the team

---

## 🐛 Common Issues

| Problem | Fix |
|---|---|
| `vite is not recognized` | Run `npm install` in the frontend folder |
| `Could not connect to / set up PostgreSQL` | Start the database first (`npm start` in `db/`), and check `DATABASE_URL` in `backend/.env` |
| `ECONNREFUSED 127.0.0.1:5432` | Nothing is listening on 5432 — the local database isn't running, or another PostgreSQL is using a different port |
| `EADDRINUSE` on port 5432 (starting `db/`) | Another PostgreSQL is already running there. Use it via `DATABASE_URL`, or start this one on another port: `PG_PORT=5433 npm start` |
| `Login failed` on production | Check `VITE_API_URL` in `.env.production` has `https://` |
| Blank page after login | Clear localStorage: `localStorage.clear()` in browser console |
| GPS not working | Must be on HTTPS in production. Use localhost for local dev |
| Map shows "Google Maps API key needed" | Add `VITE_GOOGLE_MAPS_API_KEY` to `frontend/.env` and restart `npm run dev` |
| Map shows "Google rejected the API key" | Key wrong, Maps JavaScript API not enabled, billing off, or the key's referrer restriction doesn't include this site's address |

---

## 📞 Contact

**Project Owner:** Lathika Herath  
**Email:** lathika.mbh@gmail.com  
**Location:** Rauma, Finland

---

*KangarooPost — Precision delivery, every street* 🗺️
