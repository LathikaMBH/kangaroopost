// One-off: copy data from the old lowdb file (papertrail.json) into PostgreSQL.
// Safe to re-run — rows that already exist (same id) are skipped.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, init } = require('./database');

(async () => {
  const file = path.join(__dirname, 'papertrail.json');
  if (!fs.existsSync(file)) { console.log('No papertrail.json — nothing to migrate.'); return; }
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  await init();

  const ins = async (table, cols, rows) => {
    let n = 0;
    for (const r of rows) {
      const res = await pool.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`,
        cols.map(c => r[c] ?? null)
      );
      n += res.rowCount;
    }
    console.log(`${table}: ${n} inserted, ${rows.length - n} skipped`);
  };

  // users first (routes reference riders), keeping original ids so links stay valid
  await ins('users', ['id', 'name', 'email', 'password_hash', 'role', 'city', 'phone', 'owner_id', 'created_at'],
    (d.users || []).map(u => ({ ...u, city: u.city || '', phone: u.phone || '' })));
  await ins('routes', ['id', 'name', 'owner_id', 'rider_id', 'status', 'started_at', 'paused_at', 'completed_at', 'created_at'], d.routes || []);
  await ins('stops', ['id', 'route_id', 'order_num', 'address', 'lat', 'lng', 'type', 'delivered', 'delivered_at', 'delivered_method', 'created_at'], d.stops || []);
  await ins('location_pings', ['id', 'route_id', 'rider_id', 'lat', 'lng', 'recorded_at'], d.location_pings || []);

  // explicit ids don't advance SERIAL sequences — do it, or the next insert collides
  for (const t of ['users', 'routes', 'stops', 'location_pings']) {
    await pool.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
  }
  console.log('✅ Migration done. Old file kept as papertrail.json (you can archive it).');
})().catch(e => { console.error('❌', e.message); process.exitCode = 1; }).finally(() => pool.end());
