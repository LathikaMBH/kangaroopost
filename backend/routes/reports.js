// Admin reports for the Kangarooposti website. Only the website's server calls this (X-Api-Key); the website
// checks the visitor is the admin before asking. The reports themselves live in ../reports/index.js.
const router = require('express').Router();
const wrap = require('../middleware/async');
const websiteKey = require('../middleware/websiteKey');
const REPORTS = require('../reports');

router.use(websiteKey);

router.get('/', (_req, res) => res.json(REPORTS.map(({ id, title, description }) => ({ id, title, description }))));

router.get('/:id', wrap(async (req, res) => {
  const report = REPORTS.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const { columns, rows } = await report.run(req.query);
  res.json({ id: report.id, title: report.title, description: report.description, columns, rows, generated_at: new Date().toISOString() });
}));

module.exports = router;
