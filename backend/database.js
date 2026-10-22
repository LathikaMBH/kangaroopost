const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { ADMIN_EMAIL, ADMIN_PASSWORD, isProd } = require('./config');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined }
    : {
        host: process.env.PG_HOST || 'localhost', port: Number(process.env.PG_PORT || 5432),
        database: process.env.PG_DATABASE || 'kangaroopostiapp',
        user: process.env.PG_USER || 'postgres', password: process.env.PG_PASSWORD || 'postgres',
      }
);

const q = (text, params) => pool.query(text, params);
const one  = async (text, params) => (await q(text, params)).rows[0] || null;
const many = async (text, params) => (await q(text, params)).rows;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','route_owner','rider')),
  city          TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  owner_id      INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS routes (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  owner_id     INTEGER,
  rider_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','ongoing','paused','completed')),
  started_at   TIMESTAMPTZ,
  paused_at    TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stops (
  id               SERIAL PRIMARY KEY,
  route_id         INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  order_num        INTEGER NOT NULL DEFAULT 0,
  address          TEXT,
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  type             TEXT NOT NULL DEFAULT 'mailbox',
  delivered        BOOLEAN NOT NULL DEFAULT false,
  delivered_at     TIMESTAMPTZ,
  delivered_method TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS location_pings (
  id          SERIAL PRIMARY KEY,
  route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  rider_id    INTEGER,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routes_owner ON routes(owner_id);
CREATE INDEX IF NOT EXISTS idx_routes_rider ON routes(rider_id);
CREATE INDEX IF NOT EXISTS idx_stops_route  ON stops(route_id);

-- the road-following line for a route (one encoded polyline per leg between two stops), computed by the browser
ALTER TABLE routes ADD COLUMN IF NOT EXISTS road_path JSONB;

-- a route owner who may also sign in as a rider (admin gives them the Rider role as well)
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_ride BOOLEAN NOT NULL DEFAULT false;

-- missed-delivery complaints a route owner sends to one of their riders
CREATE TABLE IF NOT EXISTS complaints (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rider_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_complaints_owner ON complaints(owner_id);
CREATE INDEX IF NOT EXISTS idx_complaints_rider ON complaints(rider_id);
-- open -> accepted (rider took it on) -> resolved (rider marked it done)
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check CHECK (status IN ('open','accepted','resolved'));

-- where a route is: region (e.g. Satakunta) -> city (e.g. Rauma) -> route. Names are unique ignoring case.
CREATE TABLE IF NOT EXISTS regions (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_regions_name ON regions (lower(name));
CREATE TABLE IF NOT EXISTS cities (
  id         SERIAL PRIMARY KEY,
  region_id  INTEGER NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cities_name ON cities (region_id, lower(name));
-- first run only: the area the existing routes are in
INSERT INTO regions (name) SELECT 'Satakunta' WHERE NOT EXISTS (SELECT 1 FROM regions);
INSERT INTO cities (region_id, name) SELECT id, 'Rauma' FROM regions WHERE name = 'Satakunta' AND NOT EXISTS (SELECT 1 FROM cities);

-- one-off data changes, each applied once (by name), so an admin's later rename or delete under Areas sticks
CREATE TABLE IF NOT EXISTS data_seeds (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- KAN-36: Eurajoki and Lappi next to Rauma in Satakunta (skips a name the region already has)
WITH seed AS (INSERT INTO data_seeds (name) VALUES ('kan-36-cities') ON CONFLICT DO NOTHING RETURNING name)
INSERT INTO cities (region_id, name)
  SELECT rg.id, c.name FROM seed, regions rg, (VALUES ('Eurajoki'), ('Lappi')) AS c(name)
  WHERE rg.name = 'Satakunta'
    AND NOT EXISTS (SELECT 1 FROM cities x WHERE x.region_id = rg.id AND lower(x.name) = lower(c.name));

-- every route is in one city; created_by is who made it (today the owner, later also an admin or super user)
ALTER TABLE routes ADD COLUMN IF NOT EXISTS city_id    INTEGER REFERENCES cities(id) ON DELETE RESTRICT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)  ON DELETE SET NULL;
UPDATE routes SET city_id = (SELECT id FROM cities ORDER BY id LIMIT 1) WHERE city_id IS NULL;
UPDATE routes SET created_by = owner_id WHERE created_by IS NULL AND owner_id IN (SELECT id FROM users);
ALTER TABLE routes ALTER COLUMN city_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_routes_city ON routes(city_id);

-- KAN-38: delivery runs. Each start of a route is one run; route, owner, city and rider are copied (no foreign keys),
-- so a run outlives the route or the people. A finished run is never changed (triggers below). Kept 1 year (cleanUp).
-- The delivery window is Tue 18:00 to Thu 23:00 Finnish time in the ISO week of the given time.
CREATE OR REPLACE FUNCTION kd_window_start(ts TIMESTAMPTZ) RETURNS TIMESTAMPTZ LANGUAGE sql STABLE AS
  $$ SELECT (date_trunc('week', ts AT TIME ZONE 'Europe/Helsinki') + interval '1 day 18 hours') AT TIME ZONE 'Europe/Helsinki' $$;
CREATE OR REPLACE FUNCTION kd_window_end(ts TIMESTAMPTZ) RETURNS TIMESTAMPTZ LANGUAGE sql STABLE AS
  $$ SELECT (date_trunc('week', ts AT TIME ZONE 'Europe/Helsinki') + interval '3 days 23 hours') AT TIME ZONE 'Europe/Helsinki' $$;
CREATE TABLE IF NOT EXISTS runs (
  id             SERIAL PRIMARY KEY,
  route_id       INTEGER NOT NULL,
  route_name     TEXT NOT NULL,
  owner_id       INTEGER,
  owner_name     TEXT,
  city_id        INTEGER,
  city_name      TEXT,
  rider_id       INTEGER NOT NULL,              -- who started it; stays credited even if the route is reassigned
  rider_name     TEXT NOT NULL,
  iso_year       INTEGER NOT NULL,
  iso_week       INTEGER NOT NULL,
  window_start   TIMESTAMPTZ NOT NULL,
  window_end     TIMESTAMPTZ NOT NULL,
  outside_window BOOLEAN NOT NULL,
  attempt        INTEGER NOT NULL,              -- 1, 2, ... per route and ISO week; only the last one is reported
  started_at     TIMESTAMPTZ NOT NULL,
  finished_at    TIMESTAMPTZ,                   -- also when it was ended (ended_by_*)
  outcome        TEXT CHECK (outcome IN ('completed','restarted')),  -- restarted: still open when the route was started again
  ended_by_id    INTEGER,
  ended_by_name  TEXT,
  ended_by_role  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_runs_attempt ON runs(route_id, iso_year, iso_week, attempt);
CREATE UNIQUE INDEX IF NOT EXISTS ux_runs_open    ON runs(route_id) WHERE finished_at IS NULL;   -- one run in progress per route
CREATE INDEX IF NOT EXISTS idx_runs_week    ON runs(iso_year, iso_week);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
CREATE TABLE IF NOT EXISTS run_stops (
  id            SERIAL PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stop_id       INTEGER NOT NULL,
  order_num     INTEGER NOT NULL,
  address       TEXT,
  type          TEXT NOT NULL,
  delivered     BOOLEAN NOT NULL DEFAULT false,
  delivered_at  TIMESTAMPTZ,                    -- the phone's time, clamped to started_at .. received_at
  received_at   TIMESTAMPTZ,                    -- server time
  method        TEXT,                           -- auto | manual
  missed        BOOLEAN NOT NULL DEFAULT false,
  missed_at     TIMESTAMPTZ,
  on_time       BOOLEAN NOT NULL DEFAULT false,
  time_adjusted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (run_id, stop_id)
);
-- pause, resume and reassignment of a run, with who did it
CREATE TABLE IF NOT EXISTS run_events (
  id        SERIAL PRIMARY KEY,
  run_id    INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type      TEXT NOT NULL CHECK (type IN ('paused','resumed','reassigned')),
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  by_id     INTEGER,
  by_name   TEXT,
  by_role   TEXT,
  details   JSONB
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id);
-- append-only: a finished run, its stops and its events can't be changed (deleting, for retention, still works)
CREATE OR REPLACE FUNCTION kd_run_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'runs' THEN
    IF OLD.finished_at IS NOT NULL THEN RAISE EXCEPTION 'RUN_FINISHED: a finished delivery run cannot be changed'; END IF;
  ELSIF EXISTS (SELECT 1 FROM runs WHERE id = NEW.run_id AND finished_at IS NOT NULL) THEN
    RAISE EXCEPTION 'RUN_FINISHED: a finished delivery run cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_runs_frozen ON runs;
CREATE TRIGGER trg_runs_frozen BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION kd_run_frozen();
DROP TRIGGER IF EXISTS trg_run_stops_frozen ON run_stops;
CREATE TRIGGER trg_run_stops_frozen BEFORE INSERT OR UPDATE ON run_stops FOR EACH ROW EXECUTE FUNCTION kd_run_frozen();
DROP TRIGGER IF EXISTS trg_run_events_frozen ON run_events;
CREATE TRIGGER trg_run_events_frozen BEFORE INSERT OR UPDATE ON run_events FOR EACH ROW EXECUTE FUNCTION kd_run_frozen();
-- for reports: "Attempt N of N"; earlier attempts in the same week are superseded (kept, not reported)
DROP VIEW IF EXISTS run_attempts;
CREATE VIEW run_attempts AS
  SELECT r.*, MAX(r.attempt) OVER w AS attempt_count, r.attempt < MAX(r.attempt) OVER w AS superseded
  FROM runs r WINDOW w AS (PARTITION BY r.route_id, r.iso_year, r.iso_week);
-- GPS pings belong to a run, so they go with it
ALTER TABLE location_pings ADD COLUMN IF NOT EXISTS run_id INTEGER REFERENCES runs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pings_run      ON location_pings(run_id);
CREATE INDEX IF NOT EXISTS idx_pings_recorded ON location_pings(recorded_at);
-- once: routes already in progress when runs were introduced get their run, so their delivery isn't lost
WITH seed AS (INSERT INTO data_seeds (name) VALUES ('kan-38-open-runs') ON CONFLICT DO NOTHING RETURNING name),
open AS (
  INSERT INTO runs (route_id, route_name, owner_id, owner_name, city_id, city_name, rider_id, rider_name, iso_year, iso_week,
                    window_start, window_end, outside_window, attempt, started_at)
  SELECT r.id, r.name, r.owner_id, ow.name, r.city_id, ci.name, r.rider_id, rd.name,
         EXTRACT(isoyear FROM r.started_at AT TIME ZONE 'Europe/Helsinki'), EXTRACT(week FROM r.started_at AT TIME ZONE 'Europe/Helsinki'),
         kd_window_start(r.started_at), kd_window_end(r.started_at),
         NOT (r.started_at BETWEEN kd_window_start(r.started_at) AND kd_window_end(r.started_at)), 1, r.started_at
  FROM seed, routes r JOIN users rd ON rd.id = r.rider_id LEFT JOIN users ow ON ow.id = r.owner_id LEFT JOIN cities ci ON ci.id = r.city_id
  WHERE r.status IN ('ongoing','paused') AND r.started_at IS NOT NULL
  RETURNING id, route_id, window_start, window_end, outside_window, started_at)
INSERT INTO run_stops (run_id, stop_id, order_num, address, type, delivered, delivered_at, received_at, method, on_time)
  SELECT o.id, s.id, s.order_num, s.address, s.type, s.delivered, s.delivered_at, s.delivered_at, s.delivered_method,
         s.delivered AND NOT o.outside_window AND s.delivered_at BETWEEN o.window_start AND o.window_end
  FROM open o JOIN stops s ON s.route_id = o.route_id;
`;

async function init() {
  await q(SCHEMA);
  console.log('✅ Database schema ready');
  const admin = await one('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (!admin) {
    if (!ADMIN_PASSWORD) throw new Error('No admin account exists yet: set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin');
    await q(
      `INSERT INTO users (name, email, password_hash, role, city) VALUES ($1,$2,$3,'admin','HQ')`,
      ['Admin', ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 10)]
    );
    console.log(isProd ? `✅ Seed: created admin ${ADMIN_EMAIL}` : `✅ Seed: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (development only)`);
  }
}

// users without password_hash
const SAFE_USER = 'id, name, email, role, city, phone, owner_id, can_ride, created_at';

const ROUTE_SELECT = `
  SELECT r.id, r.name, r.owner_id, r.rider_id, r.status, r.started_at, r.paused_at, r.completed_at, r.created_at,
         r.city_id, r.created_by, ci.name AS city_name, ci.region_id, rg.name AS region_name,
         rd.name AS rider_name, ow.name AS owner_name,
         (SELECT COUNT(*)::int FROM stops s WHERE s.route_id = r.id)                 AS stop_count,
         (SELECT COUNT(*)::int FROM stops s WHERE s.route_id = r.id AND s.delivered) AS delivered_count
  FROM routes r
  LEFT JOIN users rd ON rd.id = r.rider_id
  LEFT JOIN users ow ON ow.id = r.owner_id
  LEFT JOIN cities ci ON ci.id = r.city_id
  LEFT JOIN regions rg ON rg.id = ci.region_id`;

const COMPLAINT_SELECT = `
  SELECT c.*, rd.name AS rider_name, ow.name AS owner_name
  FROM complaints c
  LEFT JOIN users rd ON rd.id = c.rider_id
  LEFT JOIN users ow ON ow.id = c.owner_id`;

const queries = {
  // ── Users ────────────────────────────────────────────────────────────────
  getUserByEmail: (email) => one('SELECT * FROM users WHERE email = $1', [email]),
  getUserById:    (id)    => one(`SELECT ${SAFE_USER} FROM users WHERE id = $1`, [Number(id)]),
  getRawUserById: (id)    => one('SELECT * FROM users WHERE id = $1', [Number(id)]),

  getAllOwners: () => many(`
    SELECT ${SAFE_USER},
           (SELECT COUNT(*)::int FROM users r  WHERE r.role = 'rider' AND r.owner_id = u.id) AS rider_count,
           (SELECT COUNT(*)::int FROM routes t WHERE t.owner_id = u.id)                      AS route_count
    FROM users u WHERE u.role = 'route_owner' ORDER BY u.id`),

  getOwnerById: (id) => one(`SELECT ${SAFE_USER} FROM users WHERE id = $1 AND role = 'route_owner'`, [Number(id)]),

  getRidersByOwner: (owner_id) => many(`SELECT ${SAFE_USER} FROM users WHERE role = 'rider' AND owner_id = $1 ORDER BY id`, [Number(owner_id)]),

  countRidersByOwner: async (owner_id) =>
    (await one(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'rider' AND owner_id = $1`, [Number(owner_id)])).n,

  getAllRiders: () => many(`SELECT ${SAFE_USER} FROM users WHERE role = 'rider' ORDER BY id`),

  createUser: async (name, email, password_hash, role, extra = {}) => {
    try {
      return await one(
        `INSERT INTO users (name, email, password_hash, role, city, phone, owner_id, can_ride)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [name, email, password_hash, role, extra.city || '', extra.phone || '', extra.owner_id ?? null, !!extra.can_ride]
      );
    } catch (e) {
      if (e.code === '23505') throw new Error('EMAIL_EXISTS');
      throw e;
    }
  },

  // only the fields that are provided get changed
  updateUser: (id, data) => one(
    `UPDATE users SET name = COALESCE($2, name), city = COALESCE($3, city),
                      phone = COALESCE($4, phone), email = COALESCE($5, email), can_ride = COALESCE($6, can_ride)
     WHERE id = $1 RETURNING ${SAFE_USER}`,
    [Number(id), data.name ?? null, data.city ?? null, data.phone ?? null, data.email ?? null, data.can_ride ?? null]
  ),

  // routes.rider_id is ON DELETE SET NULL, so their routes become unassigned
  deleteUser: (id) => q('DELETE FROM users WHERE id = $1', [Number(id)]),

  // Deleting a route owner removes everything that belongs to them: their routes (stops and GPS pings go with
  // them) and their riders. All or nothing.
  deleteOwnerCascade: async (id) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM routes WHERE owner_id = $1', [Number(id)]);
      await client.query("DELETE FROM users WHERE role = 'rider' AND owner_id = $1", [Number(id)]);
      await client.query("DELETE FROM users WHERE role = 'route_owner' AND id = $1", [Number(id)]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },

  // returns the user (without hash) or null if no such user with that role
  setPassword: (id, password_hash, role) => one(
    `UPDATE users SET password_hash = $2 WHERE id = $1 AND role = $3 RETURNING ${SAFE_USER}`,
    [Number(id), password_hash, role]
  ),

  // ── Routes ───────────────────────────────────────────────────────────────
  getAllRoutes:      ()         => many(`${ROUTE_SELECT} ORDER BY r.id DESC`),
  getRoutesByOwner:  (owner_id) => many(`${ROUTE_SELECT} WHERE r.owner_id = $1 ORDER BY r.id DESC`, [Number(owner_id)]),
  getRoutesForRider: (rider_id) => many(`${ROUTE_SELECT} WHERE r.rider_id = $1 ORDER BY r.id DESC`, [Number(rider_id)]),
  getRouteById:      (id)       => one(`${ROUTE_SELECT} WHERE r.id = $1`, [Number(id)]),

  createRoute: async (name, owner_id, city_id, created_by) => {
    const { id } = await one('INSERT INTO routes (name, owner_id, city_id, created_by) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, Number(owner_id), Number(city_id), Number(created_by)]);
    return queries.getRouteById(id);
  },

  // city_id is only changed when given
  updateRoute: async (id, data) => {
    await q('UPDATE routes SET name = $2, rider_id = $3, city_id = COALESCE($4, city_id) WHERE id = $1',
      [Number(id), data.name, data.rider_id ?? null, data.city_id ?? null]);
    return queries.getRouteById(id);
  },

  deleteRoute: (id) => q('DELETE FROM routes WHERE id = $1', [Number(id)]), // stops + pings cascade; its runs are kept

  getRoadPath: async (id) => (await one('SELECT road_path FROM routes WHERE id = $1', [Number(id)]))?.road_path || null,
  setRoadPath: (id, roadPath) => q('UPDATE routes SET road_path = $2 WHERE id = $1', [Number(id), JSON.stringify(roadPath)]),

  assignRoute: (rider_id, route_id) => q('UPDATE routes SET rider_id = $1 WHERE id = $2', [rider_id ? Number(rider_id) : null, Number(route_id)]),

  // ── Areas (regions and their cities) ─────────────────────────────────────
  // regions A-Z, each with its cities A-Z and how many routes each city has
  getAreas: () => many(`
    SELECT rg.id, rg.name,
           COALESCE(json_agg(json_build_object('id', ci.id, 'name', ci.name, 'route_count',
                      (SELECT COUNT(*)::int FROM routes r WHERE r.city_id = ci.id)) ORDER BY lower(ci.name))
                    FILTER (WHERE ci.id IS NOT NULL), '[]') AS cities
    FROM regions rg LEFT JOIN cities ci ON ci.region_id = rg.id
    GROUP BY rg.id ORDER BY lower(rg.name)`),

  getRegionById: (id) => one('SELECT * FROM regions WHERE id = $1', [Number(id)]),
  getCityById:   (id) => one('SELECT * FROM cities WHERE id = $1', [Number(id)]),

  createRegion: (name)           => one('INSERT INTO regions (name) VALUES ($1) RETURNING *', [name]),
  renameRegion: (id, name)       => one('UPDATE regions SET name = $2 WHERE id = $1 RETURNING *', [Number(id), name]),
  deleteRegion: (id)             => q('DELETE FROM regions WHERE id = $1', [Number(id)]),
  createCity:   (region_id, name) => one('INSERT INTO cities (region_id, name) VALUES ($1,$2) RETURNING *', [Number(region_id), name]),
  updateCity:   (id, region_id, name) => one('UPDATE cities SET region_id = $2, name = $3 WHERE id = $1 RETURNING *', [Number(id), Number(region_id), name]),
  deleteCity:   (id)             => q('DELETE FROM cities WHERE id = $1', [Number(id)]),

  // ── Catalog (what the website shows customers) ───────────────────────────
  // routes that have a saved road line (all, or just route `id`), with their area and stop counts.
  // Never rider, owner, status or addresses.
  getCatalogRoutes: (id = null) => many(`
    SELECT r.id, r.name, r.city_id, ci.name AS city_name, ci.region_id, rg.name AS region_name,
           r.road_path->>'key' AS path_key, r.road_path->>'mode' AS path_mode,
           (SELECT COUNT(*)::int FROM stops s WHERE s.route_id = r.id AND s.type = 'mailbox')   AS mailbox_count,
           (SELECT COUNT(*)::int FROM stops s WHERE s.route_id = r.id AND s.type = 'apartment') AS apartment_count
    FROM routes r JOIN cities ci ON ci.id = r.city_id JOIN regions rg ON rg.id = ci.region_id
    WHERE r.road_path IS NOT NULL AND ($1::int IS NULL OR r.id = $1)`, [id === null ? null : Number(id)]),

  // stop positions of many routes, in route order (only used to check a saved road line still matches)
  getStopCoords: (route_ids) => many(
    'SELECT route_id, lat, lng FROM stops WHERE route_id = ANY($1::int[]) ORDER BY route_id, order_num, id', [route_ids]),

  // ── Stops ────────────────────────────────────────────────────────────────
  getStopsByRoute: (route_id) => many('SELECT * FROM stops WHERE route_id = $1 ORDER BY order_num, id', [Number(route_id)]),
  getStopById:     (id)       => one('SELECT * FROM stops WHERE id = $1', [Number(id)]),
  getMaxOrder:     async (route_id) => (await one('SELECT COALESCE(MAX(order_num), 0)::int AS m FROM stops WHERE route_id = $1', [Number(route_id)])).m,

  createStop: (route_id, order_num, address, lat, lng, type) => one(
    'INSERT INTO stops (route_id, order_num, address, lat, lng, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [Number(route_id), order_num, address, lat, lng, type]
  ),

  // Insert a stop so it ends up at `position` (1 = first, n+1 = last). The stops after it move down one place and
  // the order numbers are re-packed 1..n. All or nothing, and the route's stops are locked while it happens.
  insertStopAt: async (route_id, position, address, lat, lng, type) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: existing } = await client.query(
        'SELECT id FROM stops WHERE route_id = $1 ORDER BY order_num, id FOR UPDATE', [Number(route_id)]);
      const pos = Math.min(Math.max(Math.trunc(Number(position)) || 1, 1), existing.length + 1);
      const { rows: [created] } = await client.query(
        'INSERT INTO stops (route_id, order_num, address, lat, lng, type) VALUES ($1, 0, $2, $3, $4, $5) RETURNING id',
        [Number(route_id), address, lat, lng, type]);
      const ids = existing.map(r => r.id);
      ids.splice(pos - 1, 0, created.id);
      await client.query(
        'UPDATE stops s SET order_num = t.n FROM unnest($1::int[]) WITH ORDINALITY AS t(id, n) WHERE s.id = t.id', [ids]);
      const { rows: [stop] } = await client.query('SELECT * FROM stops WHERE id = $1', [created.id]);
      await client.query('COMMIT');
      return stop;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },

  updateStop: (id, address, lat, lng, type, order_num) => one(
    'UPDATE stops SET address = $2, lat = $3, lng = $4, type = $5, order_num = $6 WHERE id = $1 RETURNING *',
    [Number(id), address, lat, lng, type, order_num]
  ),

  deleteStop: (id) => q('DELETE FROM stops WHERE id = $1', [Number(id)]),

  // ── Delivery runs (KAN-38) ───────────────────────────────────────────────
  // Start: closes a run left open (outcome restarted), resets the stops, and opens a new run with a copy of the route,
  // its stops and the rider who started it. The attempt number counts the route's runs in this ISO week.
  startRun: (route_id, user) => tx(async (c) => {
    const id = Number(route_id);
    await c.query('SELECT id FROM routes WHERE id = $1 FOR UPDATE', [id]);
    await c.query(`UPDATE runs SET finished_at = now(), outcome = 'restarted', ended_by_id = $2, ended_by_name = $3, ended_by_role = $4
                   WHERE route_id = $1 AND finished_at IS NULL`, [id, user.id, user.name, user.role]);
    await c.query('UPDATE stops SET delivered = false, delivered_at = NULL, delivered_method = NULL WHERE route_id = $1', [id]);
    await c.query("UPDATE routes SET status = 'ongoing', started_at = now() WHERE id = $1", [id]);
    const { rows: [run] } = await c.query(`
      WITH w AS (SELECT EXTRACT(isoyear FROM now() AT TIME ZONE 'Europe/Helsinki')::int AS y,
                        EXTRACT(week    FROM now() AT TIME ZONE 'Europe/Helsinki')::int AS wk,
                        kd_window_start(now()) AS ws, kd_window_end(now()) AS we)
      INSERT INTO runs (route_id, route_name, owner_id, owner_name, city_id, city_name, rider_id, rider_name, iso_year, iso_week,
                        window_start, window_end, outside_window, attempt, started_at)
      SELECT r.id, r.name, r.owner_id, ow.name, r.city_id, ci.name, $2, COALESCE(u.name, $3), w.y, w.wk, w.ws, w.we,
             NOT (now() BETWEEN w.ws AND w.we),
             1 + COALESCE((SELECT MAX(x.attempt) FROM runs x WHERE x.route_id = r.id AND x.iso_year = w.y AND x.iso_week = w.wk), 0), now()
      FROM routes r CROSS JOIN w
      LEFT JOIN users ow ON ow.id = r.owner_id LEFT JOIN cities ci ON ci.id = r.city_id LEFT JOIN users u ON u.id = $2
      WHERE r.id = $1 RETURNING *`, [id, Number(user.id), user.name || '']);
    await c.query(`INSERT INTO run_stops (run_id, stop_id, order_num, address, type)
                   SELECT $1, id, order_num, address, type FROM stops WHERE route_id = $2`, [run.id, id]);
    return run;
  }),

  // Deliver a stop. delivered_at is the phone's time, clamped between the run's start and now (time_adjusted when
  // clamped); the run's copy of the stop keeps its first delivery. on_time: inside the window of an in-window run.
  deliverStop: (stop_id, route_id, method, phoneTime) => tx(async (c) => {
    const received = new Date();
    const { rows: [route] } = await c.query('SELECT started_at FROM routes WHERE id = $1 FOR UPDATE', [Number(route_id)]);
    const { rows: [run] } = await c.query('SELECT * FROM runs WHERE route_id = $1 AND finished_at IS NULL', [Number(route_id)]);
    const { at, adjusted } = clampDeliveredAt(phoneTime, received, run ? run.started_at : route?.started_at);
    const { rows: [stop] } = await c.query(
      'UPDATE stops SET delivered = true, delivered_at = $2, delivered_method = $3 WHERE id = $1 RETURNING *', [Number(stop_id), at, method]);
    if (run) await c.query(
      `UPDATE run_stops SET delivered = true, delivered_at = $3, received_at = $4, method = $5, time_adjusted = $6, on_time = $7
       WHERE run_id = $1 AND stop_id = $2 AND NOT delivered`,
      [run.id, Number(stop_id), at, received, method, adjusted, !run.outside_window && at >= run.window_start && at <= run.window_end]);
    return stop;
  }),

  // Completed by the rider (or an owner/admin force-ending it): the run is finished and from then on frozen
  finishRun: (route_id, user) => tx(async (c) => {
    const id = Number(route_id);
    await c.query("UPDATE routes SET status = 'completed', completed_at = now() WHERE id = $1", [id]);
    await c.query(`UPDATE runs SET finished_at = now(), outcome = 'completed', ended_by_id = $2, ended_by_name = $3, ended_by_role = $4
                   WHERE route_id = $1 AND finished_at IS NULL`, [id, user.id, user.name, user.role]);
  }),

  // pause / resume / reassigned, on the route's run in progress (nothing when there is none)
  logRunEvent: (route_id, type, user, details = null) => q(
    `INSERT INTO run_events (run_id, type, by_id, by_name, by_role, details)
     SELECT id, $2, $3, $4, $5, $6 FROM runs WHERE route_id = $1 AND finished_at IS NULL`,
    [Number(route_id), type, user.id, user.name, user.role, details && JSON.stringify(details)]),

  // daily: runs (with their stops, events and pings), GPS pings and complaints older than 1 year are deleted for good
  cleanUp: async () => {
    const del = async (sql) => (await q(sql)).rowCount;
    return {
      runs:       await del("DELETE FROM runs WHERE started_at < now() - interval '1 year'"),
      pings:      await del("DELETE FROM location_pings WHERE recorded_at < now() - interval '1 year'"),
      complaints: await del("DELETE FROM complaints WHERE created_at < now() - interval '1 year'"),
    };
  },

  // ── Complaints ───────────────────────────────────────────────────────────
  getAllComplaints:       ()         => many(`${COMPLAINT_SELECT} ORDER BY c.id DESC`),
  getComplaintsByOwner:   (owner_id) => many(`${COMPLAINT_SELECT} WHERE c.owner_id = $1 ORDER BY c.id DESC`, [Number(owner_id)]),
  getComplaintsForRider:  (rider_id) => many(`${COMPLAINT_SELECT} WHERE c.rider_id = $1 ORDER BY c.id DESC`, [Number(rider_id)]),
  getComplaintById:       (id)       => one(`${COMPLAINT_SELECT} WHERE c.id = $1`, [Number(id)]),

  createComplaint: async (owner_id, rider_id, address) => {
    const { id } = await one('INSERT INTO complaints (owner_id, rider_id, address) VALUES ($1,$2,$3) RETURNING id',
      [Number(owner_id), Number(rider_id), address]);
    return queries.getComplaintById(id);
  },

  acceptComplaint: async (id) => {
    await q("UPDATE complaints SET status = 'accepted', accepted_at = now() WHERE id = $1", [Number(id)]);
    return queries.getComplaintById(id);
  },

  resolveComplaint: async (id) => {
    await q("UPDATE complaints SET status = 'resolved', resolved_at = now() WHERE id = $1", [Number(id)]);
    return queries.getComplaintById(id);
  },

  deleteComplaint: (id) => q('DELETE FROM complaints WHERE id = $1', [Number(id)]),

  // ── Location ─────────────────────────────────────────────────────────────
  insertPing: (route_id, rider_id, lat, lng) =>
    q(`INSERT INTO location_pings (route_id, rider_id, lat, lng, run_id)
       VALUES ($1,$2,$3,$4,(SELECT id FROM runs WHERE route_id = $1 AND finished_at IS NULL))`, [Number(route_id), Number(rider_id), lat, lng]),
};

// runs fn(client) in one transaction: all or nothing
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

// The phone's delivery time, but never in the future (-> received) and never before the run started (-> started).
// No or an unreadable phone time (an older app): the server time, not marked as adjusted.
function clampDeliveredAt(phoneTime, received, startedAt) {
  const t = phoneTime ? new Date(phoneTime) : null;
  if (!t || Number.isNaN(t.getTime())) return { at: received, adjusted: false };
  if (t > received) return { at: received, adjusted: true };
  if (startedAt && t < new Date(startedAt)) return { at: new Date(startedAt), adjusted: true };
  return { at: t, adjusted: false };
}

async function setRouteStatus(id, status) {
  const stamp = { ongoing: 'started_at', paused: 'paused_at', completed: 'completed_at' }[status];
  await q(`UPDATE routes SET status = $2${stamp ? `, ${stamp} = now()` : ''} WHERE id = $1`, [Number(id), status]);
}

module.exports = { pool, init, queries, setRouteStatus, clampDeliveredAt };
