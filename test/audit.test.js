import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { boot, api, agentJwt, ensureKeycloak, ACME } from './helpers.js';
import { withTenant } from '../src/db.js';

let ctx;
let acmeAgent;
before(async () => {
  await ensureKeycloak();
  ctx = await boot();
  acmeAgent = await agentJwt('acme-agent');
});
after(async () => { await ctx.close(); });

test('cross-tenant read is denied and audited', async () => {
  const globexConv = randomUUID();
  const { status } = await api(ctx.base, 'GET', `/api/agent/conversations/${globexConv}/messages`, { token: acmeAgent });
  assert.equal(status, 404);
  const rows = await withTenant(ACME, async (c) => {
    const { rows } = await c.query("SELECT action, target, actor FROM audit_events WHERE action='access.denied'");
    return rows;
  });
  assert.ok(rows.some((r) => r.target === globexConv));
  assert.ok(rows.every((r) => r.actor));
});

test('audit_events is append-only for app_user', async () => {
  await assert.rejects(
    withTenant(ACME, (c) => c.query("UPDATE audit_events SET action='x'")),
    /permission denied/
  );
  await assert.rejects(
    withTenant(ACME, (c) => c.query('DELETE FROM audit_events')),
    /permission denied/
  );
});
