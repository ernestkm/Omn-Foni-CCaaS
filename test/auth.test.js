import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, authenticate } from '../src/auth.js';
import { resolveToken, withTenant } from '../src/db.js';

const ACME = '11111111-1111-1111-1111-111111111111';

test('hashToken is sha256 hex', () => {
  assert.equal(hashToken('acme-agent-token').length, 64);
});

test('resolveToken returns tenant for valid token', async () => {
  const t = await resolveToken(hashToken('acme-agent-token'));
  assert.equal(t.tenant_id, ACME);
  assert.equal(t.role, 'agent');
});

test('resolveToken returns null for unknown token', async () => {
  assert.equal(await resolveToken(hashToken('nope')), null);
});

test('authenticate parses bearer header', async () => {
  const req = { headers: { authorization: 'Bearer acme-widget-token' } };
  const t = await authenticate(req);
  assert.equal(t.role, 'widget');
});

test('authenticate returns null without header', async () => {
  assert.equal(await authenticate({ headers: {} }), null);
});

test('withTenant scopes queries to tenant', async () => {
  const n = await withTenant(ACME, async (c) => {
    const { rows } = await c.query('SELECT count(*)::int AS n FROM api_tokens');
    return rows[0].n;
  });
  assert.equal(n, 2);
});