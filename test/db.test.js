import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.DATABASE_URL || 'postgres://app_user:app_user@localhost:5432/ccaas';
const ACME = '11111111-1111-1111-1111-111111111111';
const GLOBEX = '22222222-2222-2222-2222-222222222222';
let pool;

before(() => { pool = new pg.Pool({ connectionString: url }); });

async function asTenant(tenantId, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
    return await fn(c);
  } finally { await c.query('ROLLBACK'); c.release(); }
}

test('RLS hides other tenant rows', async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT set_config($1,$2,true)', ['app.tenant_id', ACME]);
    await c.query('INSERT INTO contacts(tenant_id, display_name) VALUES($1,$2)', [ACME, 'Acme Visitor']);
    await c.query('COMMIT');
  } finally { c.release(); }
  const visible = await asTenant(GLOBEX, async (client) => {
    const { rows } = await client.query('SELECT count(*)::int AS n FROM contacts');
    return rows[0].n;
  });
  assert.equal(visible, 0);
  const own = await asTenant(ACME, async (client) => {
    const { rows } = await client.query('SELECT count(*)::int AS n FROM contacts');
    return rows[0].n;
  });
  assert.ok(own >= 1);
});

test('RLS fails closed when tenant unset', async () => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query('SELECT count(*)::int AS n FROM contacts');
    assert.equal(rows[0].n, 0);
  } finally { await c.end(); }
});

test('RLS rejects cross-tenant insert', async () => {
  await assert.rejects(
    asTenant(ACME, (c) => c.query('INSERT INTO contacts(tenant_id, display_name) VALUES($1,$2)', [GLOBEX, 'forged'])),
    /row-level security/
  );
});

test('resolve_token maps hash to tenant and role', async () => {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update('acme-agent-token').digest('hex');
  const { rows } = await pool.query('SELECT tenant_id, role FROM resolve_token($1)', [hash]);
  assert.equal(rows[0].tenant_id, ACME);
  assert.equal(rows[0].role, 'agent');
});