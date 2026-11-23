import { withTenant } from './db.js';
export { withTenant };

export const routes = [];
export function registerRoute(route) { routes.push(route); }

export function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const MAX_BODY = 1_000_000;
export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw Object.assign(new Error(`${field} must be a UUID`), { status: 400 });
  }
  return value;
}
export function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 8000) {
    throw Object.assign(new Error(`${field} must be a non-empty string <= 8000 chars`), { status: 400 });
  }
  return value;
}