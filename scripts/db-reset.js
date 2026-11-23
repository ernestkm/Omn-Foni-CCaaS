// Dev/test-only destructive reset. Connects as superuser, recreates schema, seeds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.ADMIN_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ccaas';
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await client.query(readFileSync(join(root, 'db/schema.sql'), 'utf8'));
await client.query(readFileSync(join(root, 'db/seed.sql'), 'utf8'));
await client.end();
console.log('db reset complete (dev/test only)');