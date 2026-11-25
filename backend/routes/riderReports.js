// A rider's own reports in the app (KAN-41): My week and My history. Only runs where they were the rider.
// (My complaints uses GET /api/complaints, which already gives a rider the complaints against them, withdrawn left out.)
// A route owner signed in as a rider (acting_owner) has the same id, so they see their own runs.
const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth } = require('../middleware/auth');
const { weekKey } = require('../lib/reportWeeks');

const riderOnly = (req, res, next) => req.user.role === 'rider' ? next() : res.status(403).json({ error: 'Rider only' });
router.use(auth, riderOnly);

const PAGE = 20;
const YEAR_MS = 365 * 24 * 3600 * 1000;

// ── My week: this ISO week's runs, and, once the window has closed, the routes assigned to me that nobody ran ──────
router.get('/week', wrap(async (req, res) => {
  const week = await queries.getCurrentWeek();
  const key = weekKey(week);
  const runs = await queries.getRuns({ from: key, to: key, rider_id: req.user.id });
  let not_run = [];
  if (week.finished) {
    const mine = req.user.acting_owner === true ? await queries.getRoutesByOwner(req.user.id) : await queries.getRoutesForRider(req.user.id);
    const ids = new Set(mine.map(r => r.id));
    not_run = (await queries.getWeeklyRoutes(week.iso_year, week.iso_week, week.window_end))
      .filter(r => r.outcome === 'not_run' && ids.has(r.route_id))
      .map(r => ({ route_id: r.route_id, route_name: r.route_name, city_name: r.city_name }));
  }
  res.json({ week, runs, not_run, loaded_at: new Date().toISOString() });
}));

// ── My history: the last 12 months, newest first, one page at a time (?before=<started_at of the last run shown>) ────
router.get('/history', wrap(async (req, res) => {
  const before = req.query.before ? new Date(req.query.before) : null;
  if (before && isNaN(before)) return res.status(400).json({ error: 'Bad page' });
  const rows = await queries.getRuns({
    rider_id: req.user.id, since: new Date(Date.now() - YEAR_MS).toISOString(), before: before && before.toISOString(), limit: PAGE + 1,
  });
  res.json({ runs: rows.slice(0, PAGE), more: rows.length > PAGE });
}));

module.exports = router;
