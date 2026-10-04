// Read-only route catalog for the Kangarooposti website: region -> city -> route, and a route's road line.
// Only the website's server calls this, with the shared key in the X-Api-Key header (WEBSITE_API_KEY).
//
// Customers must never see stop pins, addresses, riders, owners or delivery state, so the answers only carry
// names, mailbox/apartment counts and the road line (all legs joined into one, so the stop positions are not marked).
// A route is listed only while its saved road line matches its current stops.
const router = require('express').Router();
const wrap = require('../middleware/async');
const websiteKey = require('../middleware/websiteKey');
const { queries } = require('../database');
const { isCurrent, joinLegs } = require('../lib/roadPath');

router.use(websiteKey);

// The routes customers may see. Checking every road line against its stops is cheap at today's size;
// the result is kept for a short while so browsing the catalog does not repeat it on every click.
const CACHE_MS = 60 * 1000;
let cache = { at: 0, routes: null };
async function visibleRoutes() {
  if (cache.routes && Date.now() - cache.at < CACHE_MS) return cache.routes;
  const routes = await queries.getCatalogRoutes();
  const stops = new Map();
  for (const s of await queries.getStopCoords(routes.map(r => r.id))) {
    if (!stops.has(s.route_id)) stops.set(s.route_id, []);
    stops.get(s.route_id).push(s);
  }
  const visible = routes.filter(r => isCurrent({ key: r.path_key, mode: r.path_mode }, stops.get(r.id) || []));
  cache = { at: Date.now(), routes: visible };
  return visible;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'fi');
const routeInfo = r => ({ id: r.id, name: r.name, mailbox_count: r.mailbox_count, apartment_count: r.apartment_count });

// regions that have at least one visible route
router.get('/regions', wrap(async (_req, res) => {
  const regions = new Map();
  for (const r of await visibleRoutes()) {
    const g = regions.get(r.region_id) || { id: r.region_id, name: r.region_name, cities: new Set(), route_count: 0, mailbox_count: 0 };
    g.cities.add(r.city_id); g.route_count++; g.mailbox_count += r.mailbox_count;
    regions.set(r.region_id, g);
  }
  res.json([...regions.values()].map(({ cities, ...g }) => ({ ...g, city_count: cities.size })).sort(byName));
}));

// cities of a region that have at least one visible route
router.get('/regions/:id/cities', wrap(async (req, res) => {
  const cities = new Map();
  for (const r of (await visibleRoutes()).filter(r => r.region_id === Number(req.params.id))) {
    const c = cities.get(r.city_id) || { id: r.city_id, name: r.city_name, route_count: 0, mailbox_count: 0 };
    c.route_count++; c.mailbox_count += r.mailbox_count;
    cities.set(r.city_id, c);
  }
  res.json([...cities.values()].sort(byName));
}));

router.get('/cities/:id/routes', wrap(async (req, res) => {
  res.json((await visibleRoutes()).filter(r => r.city_id === Number(req.params.id)).map(routeInfo).sort(byName));
}));

// one route's road line: a single encoded polyline (Google format), plus its length in metres when known.
// Checked directly (not from the cache), so a route is never drawn from a line that no longer matches its stops.
router.get('/routes/:id/map', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [route] = Number.isInteger(id) && id > 0 ? await queries.getCatalogRoutes(id) : [];
  const roadPath = route && await queries.getRoadPath(route.id);
  if (!route || !isCurrent(roadPath, await queries.getStopsByRoute(route.id))) return res.status(404).json({ error: 'Route not found' });
  res.json({
    ...routeInfo(route), city: route.city_name, region: route.region_name,
    path: joinLegs(roadPath.legs), meters: roadPath.meters ?? null,
  });
}));

module.exports = router;
