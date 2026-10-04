// Runs a local PostgreSQL server (data kept in ./data). Ctrl+C to stop.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';

const PORT = Number(process.env.PG_PORT || 5432);
const DB = process.env.PG_DATABASE || 'kangaroopostiapp';
const OLD_DB = 'kangaroopost'; // the app's database before it was renamed
const pg = new EmbeddedPostgres({
  databaseDir: './data', user: 'postgres', password: 'postgres', port: PORT, persistent: true,
});

const fresh = !fs.existsSync('./data/PG_VERSION');
if (fresh) await pg.initialise();
await pg.start();

// Create the database if it is missing. An existing local database under the old name is renamed, keeping its data.
const client = pg.getPgClient('postgres');
await client.connect();
const exists = async name => (await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount > 0;
if (!await exists(DB)) {
  if (DB !== OLD_DB && await exists(OLD_DB)) {
    await client.query(`ALTER DATABASE "${OLD_DB}" RENAME TO "${DB}"`);
    console.log(`Renamed database ${OLD_DB} -> ${DB}`);
  } else {
    await client.query(`CREATE DATABASE "${DB}"`);
  }
}
await client.end();
console.log(`PostgreSQL ready: postgresql://postgres:postgres@localhost:${PORT}/${DB}`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
