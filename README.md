# KangarooPost 🗺️
### GPS-Powered Delivery Route Tracking Platform

[![License](https://img.shields.io/badge/License-Private-red?style=flat-square)]()

KangarooPost is a full-stack Progressive Web App (PWA) for managing and tracking newspaper and parcel delivery routes. It uses real GPS auto-detection so riders are tracked automatically — no manual tapping required.

> **Built with Claude AI** — This product was designed and developed using Claude AI (Anthropic) as an AI pair-programmer, from architecture and database design through to production deployment.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| **Frontend (Netlify)** | *set after deployment* |
| **Backend API (Railway)** | *set after deployment* |
| **Health check** | `<backend address>/api/health` |
| **GitHub repo** | https://github.com/LathikaMBH/kangaroopost |

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
| **Database** | PostgreSQL 18 (`pg` driver) — local via `db/`, Railway PostgreSQL in production |
| **Auth** | JWT (JSON Web Tokens) |
| **Maps** | Google Maps JavaScript API — needs an API key (see [Google Maps setup](#google-maps-setup)) |
| **GPS** | Browser Geolocation API + Haversine formula |
| **Deployment** | Railway (backend + PostgreSQL) · Netlify (frontend) |
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
├── dev.sh                     # Local dev only: starts database + backend + frontend together
├── package.json               # Root install/start for hosts that build the repo root (installs + starts backend/)
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
git clone https://github.com/LathikaMBH/kangaroopost.git
cd kangaroopost
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
2. Enable **Maps JavaScript API** **and Routes API** (APIs & Services → Library). The Routes API draws the roads between stops.
3. Create an API key (APIs & Services → Credentials → Create credentials → API key).
4. **Restrict the key** — it is visible in the browser, so:
   - *Application restrictions* → HTTP referrers: `http://localhost:3000/*` and your production domain (e.g. `https://your-site.netlify.app/*`)
   - *API restrictions* → Maps JavaScript API **and Routes API** (nothing else needed)
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

### Roads between stops (Google Routes API)

On the create-route page and the rider's navigation screen the line between stops follows real roads / cycle paths
instead of a straight line.

- **How it works:** the browser asks the Routes API for the road between each pair of consecutive stops, once, when a
  route's stops change, and saves the result with the route (`routes.road_path`). Viewing a route, and every rider's
  screen, reuses the saved path — no request to Google. A route of up to 12 stops is 1 request, 40 stops about 4.
- **Travel mode:** `VITE_ROUTE_TRAVEL_MODE` = `BICYCLE` (default), `WALK` or `DRIVE` (see `frontend/.env.example`).
  Changing it recomputes routes the next time someone opens them. Walking and cycling routes are in beta at Google; the
  warning text Google requires is shown under the map.
- **Cost:** Routes API requests are billed by Google (a free monthly allowance, then per 1,000 requests — see
  [Google's pricing](https://developers.google.com/maps/billing-and-pricing/pricing)). To be safe, set a **daily quota**
  on the Routes API and a **budget alert** in Google Cloud Console.
- **If Google can't be reached** (API not enabled, quota used up, offline) the map keeps working and draws the straight
  dashed line as before. Nothing wrong is saved.

### One-command start (optional)

From the project root, in Git Bash / macOS / Linux:

```bash
./dev.sh
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

Production layout: **Netlify** (frontend) → **Railway** service (backend) → **Railway PostgreSQL**.
The browser talks to the backend directly, using the address in `VITE_API_URL`.

> ⚠️ **Order matters.** The backend refuses to start without the settings below (by design — it will not
> run in production with a default password or secret). Create the database and set the variables
> **before** the first deploy, because Railway deploys automatically when you push to the linked branch.

### 1. Railway project + database
1. Railway → **New Project → Deploy from GitHub repo** → pick this repository (do not deploy yet if it offers to; add the variables first).
2. In the project: **+ New → Database → Add PostgreSQL**. Tables are created automatically on the backend's first start.

### 2. Backend service
Open the backend service → **Settings**:
- **Root Directory:** `backend` (recommended). If it is left empty the repo-root `package.json` installs and starts the backend anyway
- **Start command:** `npm start` (Railway normally detects this)
- **Healthcheck path:** `/api/health`
- **Networking → Generate Domain** — this is your backend address (e.g. `https://xxxx.up.railway.app`)

Then **Variables** (Railway supplies `PORT` itself):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (a reference to the database service — use its exact name if it is not "Postgres"). This is the private address; no SSL setting needed |
| `JWT_SECRET` | **required**, 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGINS` | **required**: your frontend address, e.g. `https://your-site.netlify.app` (comma-separate several, no trailing slash) |
| `ADMIN_EMAIL` | first admin's email (used on the first start only) |
| `ADMIN_PASSWORD` | first admin's password, 10+ characters (first start only). **Not** `admin123` |
| `PG_SSL` | `true` only if you use the database's *public* URL from outside Railway |

If a required value is missing the service stops at startup and the deploy log says exactly which one.
`ADMIN_EMAIL`/`ADMIN_PASSWORD` are only used to create the first admin; afterwards change the password in the app
(**Owners → Password** for owners, or sign in as admin) and you can delete `ADMIN_PASSWORD` from Railway.

### 3. Frontend (Netlify)
Set these **before building** (Netlify → Site settings → Environment variables; or in `frontend/.env.production` if you
build locally). Vite bakes them into the build, so change them → rebuild:
```
VITE_API_URL=https://xxxx.up.railway.app          # your Railway backend address, no trailing slash
VITE_GOOGLE_MAPS_API_KEY=your_restricted_key
VITE_GOOGLE_MAPS_MAP_ID=your_map_id               # create one in Google Cloud (see Google Maps setup)
```
Build `npm run build` in `frontend/` and deploy `dist/`, or connect the GitHub repo in Netlify
(base directory `frontend`, build command `npm run build`, publish directory `dist` — already in `netlify.toml`).

### 4. Google Maps key for production
In Google Cloud Console → Credentials → your key → add your Netlify address to the **HTTP referrer**
restrictions (e.g. `https://your-site.netlify.app/*`), keep it restricted to the *Maps JavaScript API*, and make
sure billing is enabled.

### 5. Smoke test after deploying
1. `https://xxxx.up.railway.app/api/health` → `{"status":"ok"}`
2. Open the site, sign in with the admin you created. The login page must **not** show any demo credentials.
3. Create a route owner, sign in as them, create a route on the map (tap to pin), assign a rider, and check the
   rider screen and the live status tiles.
4. Open the site on a phone (GPS needs HTTPS — Netlify provides it).

If sign-in fails with a network error, check `VITE_API_URL` (was the site rebuilt after setting it?) and `CORS_ORIGINS`
(exact address, `https://`, no trailing slash).

### Security notes
- Sign-in is rate limited (10 failed attempts per 15 minutes per IP). Live-location sockets require a valid login,
  and a user can only watch routes they own or are assigned to.
- **Who can do what with a route** (enforced by the server in `backend/middleware/access.js`): the admin, the route's owner and its assigned rider can *view* it; only the admin and the owner can *edit, delete, assign a rider or change stops* (and a rider must belong to that route's owner); only the assigned rider can *start, pause, resume, deliver stops or send GPS*; the assigned rider, the owner or the admin can *end* it. Deleting a route owner also deletes their riders, routes and stops.
- Passwords are stored hashed; the admin can set new passwords for owners, and owners for their riders.
- The saved road path is only a drawing aid (the app still marks stops delivered by GPS distance, not by the roads).
- Login tokens last 30 days and cannot be revoked individually — changing `JWT_SECRET` signs everyone out.
- Railway bills by usage after its trial credit — check current pricing. Back up the database (Railway's backups
  feature or `pg_dump`) before storing real data.

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
