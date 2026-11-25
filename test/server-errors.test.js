import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer, writeError, shutdownServer } from '../src/server.js';
import { createRateLimiter } from '../src/ratelimit.js';
import { setLogWriter } from '../src/log.js';

function mockRes() {
  return {
    headersSent: false,
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body || ''; },
  };
}

async function withQuietLogs(fn) {
  setLogWriter(() => {});
  try {
    return await fn();
  } finally {
    setLogWriter(null);
  }
}

test('500 responses are generic and error details stay server-side', async () => {
  await withQuietLogs(() => {
    const res = mockRes();
    writeError(res, new Error('database password hunter2'), { method: 'GET', path: '/boom' });
    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(res.body), { error: 'internal error' });
    assert.ok(!res.body.includes('hunter2'));
  });
});

test('explicit 4xx messages are preserved', async () => {
  await withQuietLogs(() => {
    const res = mockRes();
    writeError(res, Object.assign(new Error('id must be a UUID'), { status: 400 }));
    assert.equal(res.status, 400);
    assert.deepEqual(JSON.parse(res.body), { error: 'id must be a UUID' });
  });
});

test('a route error produces a sanitized 500 over HTTP', async () => {
  const server = createAppServer({
    limiter: createRateLimiter({ enabled: false }),
    routes: [{
      method: 'GET',
      pattern: /^\/boom$/,
      auth: 'widget',
      roles: ['widget'],
      handler: async () => { throw new Error('secret database DSN'); },
    }],
    authForRoute: async () => ({ tenant_id: '11111111-1111-1111-1111-111111111111', role: 'widget' }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await withQuietLogs(() => fetch(`${base}/boom`));
    const text = await res.text();
    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(text), { error: 'internal error' });
    assert.ok(!text.includes('secret database DSN'));
  } finally {
    await new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
  }
});

test('shutdownServer stops the listener and closes configured pools', async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let poolEnded = false;
  await withQuietLogs(() => shutdownServer(server, {
    exit: false,
    pools: [{ end: async () => { poolEnded = true; } }],
  }));
  assert.equal(server.listening, false);
  assert.equal(poolEnded, true);
});
