import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { authenticate, authenticateOidc } from './auth.js';
import { routes, send, readBody } from './http.js';
import { registerWidgetRoutes } from './routes/widget.js';
import { registerAdminRoutes } from './routes/admin.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function dispatch(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });

  if (req.method === 'GET' && path === '/') {
    const html = await readFile(join(root, 'public/index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  for (const route of routes) {
    if (req.method !== route.method) continue;
    const m = path.match(route.pattern);
    if (!m) continue;
    const tenant = route.auth === 'oidc' ? await authenticateOidc(req) : await authenticate(req);
    if (!tenant) return send(res, 401, { error: 'unauthorized' });
    if (!route.roles.includes(tenant.role)) return send(res, 403, { error: 'forbidden' });
    const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
    return route.handler(req, res, { tenant, params: m.groups || {}, body });
  }

  return send(res, 404, { error: 'not found' });
}

export function createAppServer() {
  return http.createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      send(res, status, { error: err.message || 'internal error' });
    });
  });
}

export function startServer(port = Number(process.env.PORT || 8080)) {
  const server = createAppServer();
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, port: server.address().port }));
  });
}

import { registerAgentRoutes } from './routes/agent.js';
registerAgentRoutes();
registerWidgetRoutes();
registerAdminRoutes();

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startServer().then(({ port }) => console.log(`thin-core listening on ${port}`));
}