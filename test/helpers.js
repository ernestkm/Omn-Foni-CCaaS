import { createAppServer } from '../src/server.js';

export const TOKENS = {
  acmeAgent: 'acme-agent-token',
  acmeWidget: 'acme-widget-token',
  globexAgent: 'globex-agent-token',
  globexWidget: 'globex-widget-token',
};
export const ACME = '11111111-1111-1111-1111-111111111111';
export const GLOBEX = '22222222-2222-2222-2222-222222222222';

const KC_BASE = process.env.KEYCLOAK_ISSUER || 'http://localhost:8081/realms/ccaas';
const TOKEN_URL = process.env.KEYCLOAK_TOKEN_URL || `${KC_BASE}/protocol/openid-connect/token`;

export async function ensureKeycloak(timeoutMs = 90000) {
  const url = `${KC_BASE}/.well-known/openid-configuration`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Keycloak not ready at ' + url);
}

export async function agentJwt(username = 'acme-agent', password = 'dev-password') {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'ccaas-spa', username, password }),
  });
  if (!res.ok) throw new Error(`keycloak token request failed: ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

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