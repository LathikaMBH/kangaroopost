// Reports a route owner opens in the app (KAN-13): only their own routes, riders and complaints.
const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth } = require('../middleware/auth');
const { weekKey, pickWeek, pickRange } = require('../lib/reportWeeks');

const ownerOnly = (req, res, next) => req.user.role === 'route_owner' ? next() : res.status(403).json({ error: 'Route owner only' });
router.use(auth, ownerOnly);

// ── KAN-42: weekly delivery summary and missed stops ─────────────────────────
// ?week=2026-47 (default: the latest finished week). One row per own route (as in the admin network summary), and the
// stops of that week that were not delivered or were marked missed.
router.get('/weekly', wrap(async (req, res) => {
  const weeks = await queries.getReportWeeks();
  const { week, error } = pickWeek(weeks, req.query);
  if (error) return res.status(400).json({ error });
  if (!week) return res.json({ weeks, week, routes: [], missed: [] });
  const [all, missed] = await Promise.all([
    queries.getWeeklyRoutes(week.iso_year, week.iso_week, week.window_end),
    queries.getWeekMissedStops(week.iso_year, week.iso_week, req.user.id),
  ]);
  res.json({ weeks, week, routes: all.filter(r => r.owner_id === req.user.id), missed });
}));

// ── KAN-44: rider performance (own riders) ───────────────────────────────────
// ?from=2026-40&to=2026-47. The runs on the owner's routes and the complaints the owner filed in those weeks; the page
// totals them per rider. riders: the owner's current riders (and the owner, if they ride), so a rider with no runs shows.
router.get('/rider-performance', wrap(async (req, res) => {
  const weeks = await queries.getReportWeeks();
  const { from, to, error } = pickRange(weeks, req.query);
  if (error) return res.status(400).json({ error });
  const range = from ? { from: weekKey(from), to: weekKey(to), owner_id: req.user.id } : null;
  const [riders, runs, complaints] = await Promise.all([
    queries.getRiderNames(req.user.id),
    range ? queries.getRuns(range) : [],
    range ? queries.getComplaintsInWeeks(range) : [],
  ]);
  res.json({ weeks, from, to, riders, runs, complaints });
}));

// ── KAN-45: complaints log ───────────────────────────────────────────────────
// ?from&to as above. Every complaint the owner filed for those weeks, withdrawn ones included.
router.get('/complaints', wrap(async (req, res) => {
  const weeks = await queries.getReportWeeks();
  const { from, to, error } = pickRange(weeks, req.query);
  if (error) return res.status(400).json({ error });
  const complaints = from
    ? await queries.getComplaintsInWeeks({ from: weekKey(from), to: weekKey(to), owner_id: req.user.id, withdrawn: true })
    : [];
  res.json({ weeks, from, to, complaints });
}));

module.exports = router;
