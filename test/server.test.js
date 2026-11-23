import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, api, TOKENS } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

test('healthz is public', async () => {
  const { status, json } = await api(ctx.base, 'GET', '/healthz');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
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