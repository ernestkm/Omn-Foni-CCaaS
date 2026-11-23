import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, api, TOKENS } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

async function newConv(token) {
  const { json } = await api(ctx.base, 'POST', '/api/widget/conversations', { token, body: {} });
  return json.id;
}

test('agent lists only own tenant conversations', async () => {
  const acmeConv = await newConv(TOKENS.acmeWidget);
  const globexConv = await newConv(TOKENS.globexWidget);
  const { json } = await api(ctx.base, 'GET', '/api/agent/conversations', { token: TOKENS.acmeAgent });
  const ids = json.conversations.map((c) => c.id);
  assert.ok(ids.includes(acmeConv));
  assert.ok(!ids.includes(globexConv));
});

test('agent cannot read another tenant conversation', async () => {
  const globexConv = await newConv(TOKENS.globexWidget);
  const { status } = await api(ctx.base, 'GET', `/api/agent/conversations/${globexConv}/messages`, { token: TOKENS.acmeAgent });
  assert.equal(status, 404);
});

test('agent cannot reply into another tenant conversation', async () => {
  const globexConv = await newConv(TOKENS.globexWidget);
  const { status } = await api(ctx.base, 'POST', `/api/agent/conversations/${globexConv}/messages`, {
    token: TOKENS.acmeAgent, body: { body: 'intrude' },
  });
  assert.equal(status, 404);
});

test('forged tenant_id in body is ignored', async () => {
  const conv = await newConv(TOKENS.acmeWidget);
  const { status } = await api(ctx.base, 'POST', `/api/agent/conversations/${conv}/messages`, {
    token: TOKENS.acmeAgent, body: { body: 'hi', tenant_id: '22222222-2222-2222-2222-222222222222' },
  });
  assert.equal(status, 201);
  const globexRead = await api(ctx.base, 'GET', `/api/agent/conversations/${conv}/messages`, { token: TOKENS.globexAgent });
  assert.equal(globexRead.status, 404);
});

test('end-to-end widget to agent reply', async () => {
  const conv = await newConv(TOKENS.acmeWidget);
  await api(ctx.base, 'POST', '/api/widget/messages', { token: TOKENS.acmeWidget, body: { conversationId: conv, body: 'question' } });
  const reply = await api(ctx.base, 'POST', `/api/agent/conversations/${conv}/messages`, { token: TOKENS.acmeAgent, body: { body: 'answer' } });
  assert.equal(reply.status, 201);
  const { json } = await api(ctx.base, 'GET', `/api/agent/conversations/${conv}/messages`, { token: TOKENS.acmeAgent });
  assert.equal(json.messages.length, 2);
  assert.equal(json.messages[0].sender, 'customer');
  assert.equal(json.messages[1].sender, 'agent');
});