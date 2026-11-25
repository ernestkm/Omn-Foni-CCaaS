import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { authenticate, authenticateOidc } from './auth.js';
import { routes, send, readBody } from './http.js';
import { registerWidgetRoutes } from './routes/widget.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAgentRoutes } from './routes/agent.js';
import { port as defaultPort, issuer, tokenUrl, audience, publicBaseUrl } from './config.js';
import { clientIp } from './clientip.js';
import { rateLimiter } from './ratelimit.js';
import { log } from './log.js';
import { pool } from './db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHUTDOWN_TIMEOUT_MS = 10_000;

export function publicConfig() {
  return {
    issuer,
    authorizationUrl: `${issuer}/protocol/openid-connect/auth`,
    tokenUrl,
    clientId: 'ccaas-spa',
    audience,
    publicBaseUrl,
  };
}

function authForRoute(route, req) {
  if (route.auth === 'widget') return authenticate(req);
  if (route.auth === 'oidc') return authenticateOidc(req);
  throw Object.assign(new Error(`invalid auth mode: ${route.auth}`), { status: 500 });
}

function findRoute(activeRoutes, req, path) {
  for (const route of activeRoutes) {
    if (req.method !== route.method) continue;
    const match = path.match(route.pattern);
    if (match) return { route, params: match.groups || {} };
  }
  return null;
}

export function makeDispatch({
  limiter = rateLimiter,
  routes: activeRoutes = routes,
  authForRoute: authenticateRoute = authForRoute,
} = {}) {
  return async function dispatch(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;
    const matched = findRoute(activeRoutes, req, path);
    const pattern = matched?.route.pattern?.source || path;

    const limited = limiter(req, matched?.route || { pattern: path });
    if (limited) {
      log('warn', 'request.rate_limited', {
        method: req.method, path, route: pattern, ip: clientIp(req), limit: limited.limit,
      });
      return send(res, 429, { error: 'too many requests' }, {
        'retry-after': String(limited.retryAfter),
      });
    }

    if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });
    if (req.method === 'GET' && path === '/api/config') return send(res, 200, publicConfig());
    if (req.method === 'GET' && path === '/') {
      const html = await readFile(join(root, 'public/index.html'), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (matched) {
      const tenant = await authenticateRoute(matched.route, req);
      if (!tenant) {
        log('warn', 'auth.denied', { method: req.method, path, route: pattern, ip: clientIp(req), status: 401 });
        return send(res, 401, { error: 'unauthorized' });
      }
      if (!matched.route.roles.includes(tenant.role)) {
        log('warn', 'auth.denied', { method: req.method, path, route: pattern, ip: clientIp(req), status: 403 });
        return send(res, 403, { error: 'forbidden' });
      }
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
      return matched.route.handler(req, res, { tenant, params: matched.params, body });
    }

    return send(res, 404, { error: 'not found' });
  };
}

export function writeError(res, err, context = {}) {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599
    ? err.status : 500;
  if (status >= 500) {
    log('error', status === 503 ? 'upstream.unavailable' : 'request.error', {
      ...context, status, error: err,
    });
  }
  const message = (status < 500 || err?.expose === true)
    ? (err?.message || 'request failed')
    : 'internal error';
  if (res.headersSent) return res.end();
  return send(res, status, { error: message });
}

export function createAppServer(options = {}) {
  const dispatch = makeDispatch(options);
  return http.createServer((req, res) => {
    dispatch(req, res).catch((err) => writeError(res, err, {
      method: req.method,
      path: req.url,
    }));
  });
}

export function startServer(port = defaultPort) {
  const server = createAppServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolve({ server, port: server.address().port });
    });
  });
}

export async function shutdownServer(server, {
  timeoutMs = SHUTDOWN_TIMEOUT_MS, pools = [pool], exit = false, signal = null,
} = {}) {
  if (server?.listening) {
    await new Promise((resolve) => {
      let finished = false;
      let timer;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(() => {
        log('warn', 'server.shutdown_timeout', { timeoutMs, signal });
        server.closeAllConnections?.();
        finish();
      }, timeoutMs);
      timer.unref?.();
      server.close(finish);
      server.closeIdleConnections?.();
    });
  }

  for (const candidate of pools) {
    try {
      await candidate?.end?.();
    } catch (err) {
      log('error', 'pool.close_failed', { error: err });
    }
  }
  log('info', 'server.stopped', { signal });
  if (exit) process.exit(0);
}

export function installShutdownHandlers(server, options = {}) {
  let stopping = false;
  const handlers = new Map();
  for (const signal of ['SIGTERM', 'SIGINT']) {
    const handler = () => {
      if (stopping) return;
      stopping = true;
      log('info', 'server.signal', { signal });
      void shutdownServer(server, { ...options, signal, exit: options.exit ?? true })
        .catch((err) => {
          log('error', 'server.shutdown_failed', { error: err });
          if (options.exit !== false) process.exit(1);
        });
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
}

registerAgentRoutes();
registerWidgetRoutes();
registerAdminRoutes();

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startServer()
    .then(({ server, port }) => {
      log('info', 'server.started', { port });
      installShutdownHandlers(server);
    })
    .catch((err) => {
      log('error', 'server.start_failed', { error: err });
      process.exitCode = 1;
    });
}
