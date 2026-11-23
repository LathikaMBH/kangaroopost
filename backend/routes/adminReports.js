// Reports the admin opens in the app (KAN-14). Admin only, with the normal app login.
// (The /api/reports endpoints are separate: they serve the website's server with its API key.)
const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, adminOnly } = require('../middleware/auth');

router.use(auth, adminOnly);

// ── KAN-46: riders directory ──────────────────────────────────────────────────
router.get('/riders', wrap(async (_req, res) => res.json(await queries.getRidersDirectory())));

module.exports = router;
