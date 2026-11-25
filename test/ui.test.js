import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

test('index contains widget and inbox panels', async () => {
  const html = await (await fetch(ctx.base + '/')).text();
  assert.match(html, /id="widget"/);
  assert.match(html, /id="inbox"/);
  assert.match(html, /api\/widget\/messages/);
  assert.match(html, /api\/agent\/conversations/);
});

test('index contains PKCE sign-in for the agent panel', async () => {
  const html = await (await fetch(ctx.base + '/')).text();
  assert.match(html, /id="signIn"/);
  assert.match(html, /code_challenge/);
  assert.match(html, /code_verifier/);
  assert.match(html, /pkce_state/);
  assert.match(html, /fetch\('\/api\/config'\)/);
  assert.match(html, /config\.authorizationUrl/);
  assert.match(html, /config\.tokenUrl/);
  assert.doesNotMatch(html, /localhost:8081/);
});
