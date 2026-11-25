// Forward-only migration runner. Existing rows and applied files are never rewritten.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'db', 'migrations');
const connectionString = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL
  || 'postgres://postgres:postgres@localhost:5432/ccaas';
const source = process.env.ADMIN_DATABASE_URL ? 'ADMIN_DATABASE_URL'
  : process.env.DATABASE_URL ? 'DATABASE_URL' : 'default';

function targetLabel() {
  try {
    const target = new URL(connectionString);
    const port = target.port ? `:${target.port}` : '';
    return `${target.hostname}${port}/${target.pathname.replace(/^\//, '')}`;
  } catch {
    return 'configured database';
  }
}

async function inTransaction(client, fn) {
  await client.query('BEGIN');
  try {
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

const sha256 = (sql) => createHash('sha256').update(sql).digest('hex');

async function migrate(client) {
  await inTransaction(client, () => client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `));

  const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
  const applied = new Map(rows.map((row) => [row.filename, row.checksum]));
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const sql = readFileSync(join(migrationsDir, filename), 'utf8');
      return { filename, sql, checksum: sha256(sql) };
    });

  for (const filename of applied.keys()) {
    if (!migrations.some((m) => m.filename === filename)) {
      throw new Error(`previously applied migration ${filename} is missing from db/migrations`);
    }
  }

  const pending = [];
  let seenApplied = false;
  for (const migration of migrations) {
    const { filename, checksum } = migration;
    if (applied.has(filename)) {
      if (applied.get(filename) !== checksum) {
        throw new Error(`checksum mismatch for ${filename}: applied ${applied.get(filename)}, file ${checksum}`);
      }
      seenApplied = true;
      console.log(`[migrate] skip ${filename} (already applied)`);
      continue;
    }
    if (seenApplied) {
      throw new Error(`out-of-order migration ${filename}: an applied migration sorts after it`);
    }
    pending.push(migration);
  }

  for (const { filename, sql, checksum } of pending) {
    await inTransaction(client, async () => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [filename, checksum]);
    });
    console.log(`[migrate] applied ${filename}`);
  }

  console.log(`[migrate] done: ${pending.length} applied, ${migrations.length - pending.length} skipped`);
}

let client;
let connected = false;
try {
  console.log(`[migrate] target: ${source} -> ${targetLabel()}`);
  client = new pg.Client({ connectionString });
  await client.connect();
  connected = true;
  await migrate(client);
} catch (err) {
  console.error(`[migrate] FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  if (connected) await client.end();
}
