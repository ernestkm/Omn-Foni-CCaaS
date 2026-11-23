import { createAppServer } from '../src/server.js';

export const TOKENS = {
  acmeAgent: 'acme-agent-token',
  acmeWidget: 'acme-widget-token',
  globexAgent: 'globex-agent-token',
  globexWidget: 'globex-widget-token',
};
export const ACME = '11111111-1111-1111-1111-111111111111';
export const GLOBEX = '22222222-2222-2222-2222-222222222222';

export async function boot() {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}

export async function api(base, method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}