import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt } from 'jose';
import { agentJwt, ensureKeycloak, ACME } from './helpers.js';

before(async () => { await ensureKeycloak(); });

test('keycloak issues an access token with tenant_id and roles', async () => {
  const token = await agentJwt('acme-agent');
  const claims = decodeJwt(token);
  assert.equal(claims.tenant_id, ACME);
  assert.ok(Array.isArray(claims.roles));
  assert.ok(claims.roles.includes('agent'));
  assert.ok(claims.sub);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  assert.ok(audiences.includes('ccaas-spa'));
});
