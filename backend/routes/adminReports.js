// Reports the admin opens in the app (KAN-14). Admin only, with the normal app login.
// (The /api/reports endpoints are separate: they serve the website's server with its API key.)
const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, adminOnly } = require('../middleware/auth');

router.use(auth, adminOnly);

// ── KAN-46: riders directory ──────────────────────────────────────────────────
router.get('/riders', wrap(async (_req, res) => res.json(await queries.getRidersDirectory())));

// ── KAN-43: weekly network summary ────────────────────────────────────────────
// ?week=2026-47 (default: the latest finished week). Returns every route of that week; the page totals them per owner,
// so its region, city and owner filters and the total row all work on the same rows.
router.get('/network', wrap(async (req, res) => {
  const weeks = await queries.getReportWeeks();
  let week = weeks.find(w => w.finished) || weeks[0];
  if (req.query.week) {
    const [y, n] = String(req.query.week).split('-').map(Number);
    week = weeks.find(w => w.iso_year === y && w.iso_week === n);
    if (!week) return res.status(400).json({ error: 'Pick one of the last 52 delivery weeks' });
  }
  const [owners, routes] = await Promise.all([
    queries.getOwnerNames(),
    week ? queries.getWeeklyRoutes(week.iso_year, week.iso_week, week.window_end) : [],
  ]);
  res.json({ weeks, week, owners, routes });
}));

module.exports = router;
