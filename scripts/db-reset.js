// Dev/test-only destructive reset. Connects as superuser, recreates schema, seeds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.ADMIN_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ccaas';

function assertDevTarget(connectionString) {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('NODE_ENV=production: destructive reset refused');
  }
  let target;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error('database URL could not be parsed');
  }
  const overridden = ['host', 'hostaddr', 'port', 'database', 'dbname', 'service']
    .filter((key) => target.searchParams.has(key));
  if (overridden.length) {
    throw new Error(`connection option ${overridden.join(', ')} cannot be used with a reset target`);
  }
  const host = target.hostname.toLowerCase();
  const database = decodeURIComponent(target.pathname.slice(1));
  const localHost = host === 'localhost' || host === '127.0.0.1';
  const devDatabase = database === 'ccaas' || /^[A-Za-z0-9_-]+_test$/.test(database);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !localHost || !devDatabase) {
    throw new Error(`only localhost/127.0.0.1 databases named ccaas or *_test are allowed (host=${host || 'unknown'}, database=${database || 'unknown'})`);
  }
  return { host, database };
}

let target;
try {
  target = assertDevTarget(url);
} catch (err) {
  console.error(`[db-reset] REFUSED: ${err.message}`);
  process.exit(1);
}
console.log(`[db-reset] guard passed: host=${target.host} database=${target.database} (NODE_ENV=${process.env.NODE_ENV || 'unset'})`);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query(readFileSync(join(root, 'db/schema.sql'), 'utf8'));
  await client.query(readFileSync(join(root, 'db/seed.sql'), 'utf8'));
  console.log('db reset complete (dev/test only)');
} finally {
  await client.end();
}
