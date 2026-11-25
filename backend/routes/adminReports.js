// Reports the admin opens in the app (KAN-14). Admin only, with the normal app login.
// (The /api/reports endpoints are separate: they serve the website's server with its API key.)
const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, adminOnly } = require('../middleware/auth');
const { weekKey, pickWeek, pickRange } = require('../lib/reportWeeks');

router.use(auth, adminOnly);

// ── KAN-46: riders directory ──────────────────────────────────────────────────
router.get('/riders', wrap(async (_req, res) => res.json(await queries.getRidersDirectory())));

// ── KAN-43: weekly network summary ────────────────────────────────────────────
// ?week=2026-47 (default: the latest finished week). Returns every route of that week; the page totals them per owner,
// so its region, city and owner filters and the total row all work on the same rows.
router.get('/network', wrap(async (req, res) => {
  const weeks = await queries.getReportWeeks();
  const { week, error } = pickWeek(weeks, req.query);
  if (error) return res.status(400).json({ error });
  const [owners, routes] = await Promise.all([
    queries.getOwnerNames(),
    week ? queries.getWeeklyRoutes(week.iso_year, week.iso_week, week.window_end) : [],
  ]);
  res.json({ weeks, week, owners, routes });
}));

// ── KAN-47: rider performance across all owners ──────────────────────────────
// ?from=2026-40&to=2026-47 (default: the latest finished week). The reported runs and the complaints of those weeks;
// the page totals them per rider, so its filters and rows agree (as in the network summary).
router.get('/rider-performance', wrap(async (req, res) => {
  const weeks = await queries.getReportWeeks();
  const { from, to, error } = pickRange(weeks, req.query);
  if (error) return res.status(400).json({ error });
  const range = from ? { from: weekKey(from), to: weekKey(to) } : null;
  const [riders, owners, runs, complaints] = await Promise.all([
    queries.getRiderNames(),
    queries.getOwnerNames(),
    range ? queries.getRuns(range) : [],
    range ? queries.getComplaintsInWeeks(range) : [],
  ]);
  res.json({ weeks, from, to, riders, owners, runs, complaints });
}));

// ── KAN-48: complaints overview across owners ────────────────────────────────
// ?from&to as above. Every complaint of those weeks, withdrawn ones included; the page counts them per owner and city.
router.get('/complaints', wrap(async (req, res) => {
  const weeks = await queries.getReportWeeks();
  const { from, to, error } = pickRange(weeks, req.query);
  if (error) return res.status(400).json({ error });
  const [owners, complaints] = await Promise.all([
    queries.getOwnerNames(),
    from ? queries.getComplaintsInWeeks({ from: weekKey(from), to: weekKey(to), withdrawn: true }) : [],
  ]);
  res.json({ weeks, from, to, owners, complaints });
}));

module.exports = router;
