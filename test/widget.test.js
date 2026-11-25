import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, api, TOKENS, agentJwt, ensureKeycloak } from './helpers.js';

let ctx;
before(async () => { await ensureKeycloak(); ctx = await boot(); });
after(async () => { await ctx.close(); });

test('widget creates a conversation', async () => {
  const { status, json } = await api(ctx.base, 'POST', '/api/widget/conversations', {
    token: TOKENS.acmeWidget, body: { displayName: 'Visitor' },
  });
  assert.equal(status, 201);
  assert.ok(json.id);
  assert.equal(json.status, 'open');
});

test('widget posts an inbound message', async () => {
  const conv = await api(ctx.base, 'POST', '/api/widget/conversations', { token: TOKENS.acmeWidget, body: {} });
  const { status, json } = await api(ctx.base, 'POST', '/api/widget/messages', {
    token: TOKENS.acmeWidget, body: { conversationId: conv.json.id, body: 'hello' },
  });
  assert.equal(status, 201);
  assert.ok(json.id);
});

test('widget message rejects unknown conversation', async () => {
  const { status } = await api(ctx.base, 'POST', '/api/widget/messages', {
    token: TOKENS.acmeWidget,
    body: { conversationId: '99999999-9999-9999-9999-999999999999', body: 'hi' },
  });
  assert.equal(status, 404);
});

test('widget message rejects empty body', async () => {
  const conv = await api(ctx.base, 'POST', '/api/widget/conversations', { token: TOKENS.acmeWidget, body: {} });
  const { status } = await api(ctx.base, 'POST', '/api/widget/messages', {
    token: TOKENS.acmeWidget, body: { conversationId: conv.json.id, body: '  ' },
  });
  assert.equal(status, 400);
});

test('agent JWT cannot use widget endpoint', async () => {
  const jwt = await agentJwt('acme-agent');
  const { status } = await api(ctx.base, 'POST', '/api/widget/conversations', { token: jwt, body: {} });
  assert.equal(status, 401);
});