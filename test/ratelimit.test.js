import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/ratelimit.js';
import { createAppServer } from '../src/server.js';

function request(ip = '203.0.113.7', method = 'GET') {
  return { method, url: '/healthz', headers: {}, socket: { remoteAddress: ip } };
}

const publicRoute = { method: 'GET', pattern: /^\/healthz$/ };

test('fixed-window limiter blocks after the limit and recovers after the window', () => {
  let now = 0;
  const limiter = createRateLimiter({
    enabled: true, windowMs: 60_000, max: 2, widgetMax: 1, now: () => now,
  });
  assert.equal(limiter(request(), publicRoute), null);
  assert.equal(limiter(request(), publicRoute), null);
  assert.deepEqual(limiter(request(), publicRoute), {
    limit: 2, pattern: '^\\/healthz$', retryAfter: 60,
  });
  now = 60_001;
  assert.equal(limiter(request(), publicRoute), null);
});

test('widget POST requests use the stricter limit', () => {
  const limiter = createRateLimiter({
    enabled: true, windowMs: 60_000, max: 10, widgetMax: 2, now: () => 0,
  });
  const route = { method: 'POST', pattern: /^\/api\/widget\/messages$/, auth: 'widget' };
  assert.equal(limiter(request('198.51.100.9', 'POST'), route), null);
  assert.equal(limiter(request('198.51.100.9', 'POST'), route), null);
  assert.ok(limiter(request('198.51.100.9', 'POST'), route));
});

test('disabled limiter allows unlimited requests', () => {
  const limiter = createRateLimiter({ enabled: false, max: 1, widgetMax: 1 });
  for (let i = 0; i < 5; i += 1) {
    assert.equal(limiter(request(), publicRoute), null);
  }
});

test('server returns 429 with Retry-After before auth', async () => {
  const limiter = createRateLimiter({ enabled: true, max: 1, widgetMax: 1, windowMs: 60_000 });
  const server = createAppServer({ limiter });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${base}/healthz`);
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/healthz`);
    assert.equal(second.status, 429);
    assert.ok(Number(second.headers.get('retry-after')) >= 1);
    const json = await second.json();
    assert.match(json.error, /too many requests/);
  } finally {
    await new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
  }
});
