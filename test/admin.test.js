import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, api, TOKENS, agentJwt, ensureKeycloak, ACME } from './helpers.js';
import { withTenant } from '../src/db.js';
import { hashToken } from '../src/auth.js';

let ctx;
let adminJwt;
let agentToken;
before(async () => {
  await ensureKeycloak();
  ctx = await boot();
  adminJwt = await agentJwt('acme-admin');
  agentToken = await agentJwt('acme-agent');
});
after(async () => { await ctx.close(); });

test('rotate requires admin role', async () => {
  const { status } = await api(ctx.base, 'POST', '/api/admin/tokens/rotate', { token: agentToken });
  assert.equal(status, 403);
});

test('rotate requires authentication', async () => {
  const { status } = await api(ctx.base, 'POST', '/api/admin/tokens/rotate');
  assert.equal(status, 401);
});

test('admin rotates the widget token and the action is audited', async () => {
  const { status, json } = await api(ctx.base, 'POST', '/api/admin/tokens/rotate', { token: adminJwt });
  assert.equal(status, 200);
  assert.ok(typeof json.token === 'string' && json.token.length > 0);

  const old = await api(ctx.base, 'POST', '/api/widget/conversations', { token: TOKENS.acmeWidget, body: {} });
  assert.equal(old.status, 401);

  const fresh = await api(ctx.base, 'POST', '/api/widget/conversations', { token: json.token, body: {} });
  assert.equal(fresh.status, 201);

  const rows = await withTenant(ACME, async (c) => {
    const { rows } = await c.query("SELECT actor, target FROM audit_events WHERE action='token.rotate'");
    return rows;
  });
  assert.ok(rows.length >= 1);
  assert.ok(rows[0].actor);

  await withTenant(ACME, (c) => c.query(
    'DELETE FROM api_tokens WHERE tenant_id=$1 AND token_hash=$2',
    [ACME, hashToken(json.token)]));

  // ponytail: restore the dev widget token so later alphabetical suites keep working
  await withTenant(ACME, (c) => c.query(
    'INSERT INTO api_tokens(tenant_id, token_hash, role) VALUES($1,$2,$3) ON CONFLICT (token_hash) DO NOTHING',
    [ACME, hashToken(TOKENS.acmeWidget), 'widget']));
});
