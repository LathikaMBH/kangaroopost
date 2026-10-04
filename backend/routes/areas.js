// Regions and the cities in them. Every route belongs to one city.
//   read   : admin and route owners (they pick a city for each route)
//   change : admin only
const router = require('express').Router();
const wrap = require('../middleware/async');
const { queries } = require('../database');
const { auth, adminOnly, ownerOrAdmin } = require('../middleware/auth');

const cleanName = v => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
const isId = v => Number.isInteger(Number(v)) && Number(v) > 0;

// Postgres error codes: 23505 = the name is already used, 23001 = still in use by cities/routes (ON DELETE RESTRICT)
async function save(res, fn, taken) {
  try { return await fn(); }
  catch (e) {
    if (e.code === '23505') { res.status(409).json({ error: taken }); return null; }
    throw e;
  }
}

router.get('/', auth, ownerOrAdmin, wrap(async (_req, res) => res.json(await queries.getAreas())));

// ── Regions ───────────────────────────────────────────────────────────────────
router.post('/regions', auth, adminOnly, wrap(async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Region name required' });
  const region = await save(res, () => queries.createRegion(name), 'A region with that name already exists');
  if (region) res.status(201).json(region);
}));

router.put('/regions/:id', auth, adminOnly, wrap(async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Region name required' });
  if (!await queries.getRegionById(req.params.id)) return res.status(404).json({ error: 'Region not found' });
  const region = await save(res, () => queries.renameRegion(req.params.id, name), 'A region with that name already exists');
  if (region) res.json(region);
}));

router.delete('/regions/:id', auth, adminOnly, wrap(async (req, res) => {
  if (!await queries.getRegionById(req.params.id)) return res.status(404).json({ error: 'Region not found' });
  try { await queries.deleteRegion(req.params.id); }
  catch (e) {
    if (e.code === '23001') return res.status(409).json({ error: 'This region still has cities. Delete or move them first.' });
    throw e;
  }
  res.json({ success: true });
}));

// ── Cities ────────────────────────────────────────────────────────────────────
router.post('/cities', auth, adminOnly, wrap(async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'City name required' });
  if (!isId(req.body.region_id) || !await queries.getRegionById(req.body.region_id)) return res.status(400).json({ error: 'Region not found' });
  const city = await save(res, () => queries.createCity(req.body.region_id, name), 'That region already has a city with that name');
  if (city) res.status(201).json(city);
}));

// rename, and/or move to another region
router.put('/cities/:id', auth, adminOnly, wrap(async (req, res) => {
  const city = await queries.getCityById(req.params.id);
  if (!city) return res.status(404).json({ error: 'City not found' });
  const name = cleanName(req.body.name) || city.name;
  const region_id = req.body.region_id ?? city.region_id;
  if (!isId(region_id) || !await queries.getRegionById(region_id)) return res.status(400).json({ error: 'Region not found' });
  const saved = await save(res, () => queries.updateCity(city.id, region_id, name), 'That region already has a city with that name');
  if (saved) res.json(saved);
}));

router.delete('/cities/:id', auth, adminOnly, wrap(async (req, res) => {
  if (!await queries.getCityById(req.params.id)) return res.status(404).json({ error: 'City not found' });
  try { await queries.deleteCity(req.params.id); }
  catch (e) {
    if (e.code === '23001') return res.status(409).json({ error: 'This city still has routes. Move them to another city first.' });
    throw e;
  }
  res.json({ success: true });
}));

module.exports = router;
