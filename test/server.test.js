import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, api, TOKENS } from './helpers.js';
import { registerRoute } from '../src/http.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

test('healthz is public', async () => {
  const { status, json } = await api(ctx.base, 'GET', '/healthz');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test('public config reflects the configured OIDC endpoints', async () => {
  const { status, json } = await api(ctx.base, 'GET', '/api/config');
  const issuer = process.env.KEYCLOAK_ISSUER || 'http://localhost:8081/realms/ccaas';
  assert.equal(status, 200);
  assert.equal(json.issuer, issuer);
  assert.equal(json.authorizationUrl, issuer + '/protocol/openid-connect/auth');
  assert.equal(json.tokenUrl, process.env.KEYCLOAK_TOKEN_URL || issuer + '/protocol/openid-connect/token');
  assert.equal(json.clientId, 'ccaas-spa');
  assert.equal(json.audience, process.env.KEYCLOAK_AUDIENCE || 'ccaas-spa');
});

test('registerRoute rejects an unknown auth mode', () => {
  assert.throws(
    () => registerRoute({ method: 'GET', pattern: /^\/invalid$/, roles: [], auth: 'legacy' }),
    /invalid auth mode/
  );
});

test('agent endpoint rejects missing token', async () => {
  const { status } = await api(ctx.base, 'GET', '/api/agent/conversations');
  assert.equal(status, 401);
});

test('agent endpoint rejects invalid token', async () => {
  const { status } = await api(ctx.base, 'GET', '/api/agent/conversations', { token: 'bad' });
  assert.equal(status, 401);
});

test('widget token cannot access agent endpoint', async () => {
  const { status } = await api(ctx.base, 'GET', '/api/agent/conversations', { token: TOKENS.acmeWidget });
  assert.equal(status, 401);
});

test('serves index.html at root', async () => {
  const res = await fetch(ctx.base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});