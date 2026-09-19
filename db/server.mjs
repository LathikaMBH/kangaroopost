// Runs a local PostgreSQL server (data kept in ./data). Ctrl+C to stop.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';

const PORT = Number(process.env.PG_PORT || 5432);
const DB = process.env.PG_DATABASE || 'kangaroopost';
const pg = new EmbeddedPostgres({
  databaseDir: './data', user: 'postgres', password: 'postgres', port: PORT, persistent: true,
});

const fresh = !fs.existsSync('./data/PG_VERSION');
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase(DB);
console.log(`PostgreSQL ready: postgresql://postgres:postgres@localhost:${PORT}/${DB}`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
