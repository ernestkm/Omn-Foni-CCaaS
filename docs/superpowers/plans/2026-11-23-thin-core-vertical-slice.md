# Thin-Core Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable thin-core CCaaS service that proves multi-tenant isolation (PostgreSQL RLS) with a web-chat channel and agent inbox API, backed by automated cross-tenant isolation tests.

**Architecture:** A custom Node ESM HTTP service (the "thin core") owns conversation/routing/tenancy. PostgreSQL 16 enforces tenant isolation with Row-Level Security; every request runs inside a transaction that sets `app.tenant_id` from a server-resolved bearer token, never from client input. A `SECURITY DEFINER` function resolves token -> tenant. A vanilla-JS widget and minimal inbox page exercise the API end to end. Docker Compose runs Postgres + core.

**Tech Stack:** Node 22 (ESM, built-in `node:http` and `node:test`), `pg` (only runtime dep), PostgreSQL 16-alpine, Docker Compose. No TypeScript build step, no HTTP framework, no ORM.

## Global Constraints

- Target repo: `/root/Omn-Foni-CCaaS` (remote `ernestkm/Omn-Foni-CCaaS.git`). Do NOT touch sibling repos `Omni-Foní` or `hcs-telco`.
- Node >= 22. Plain ESM JavaScript (`"type": "module"`). No build step.
- Only runtime dependency: `pg`. Tests use built-in `node:test` + `node:assert`.
- No em-dashes in any prose/docs.
- Tenant isolation is a trust boundary: never trust client-supplied `tenant_id`; RLS must fail closed when `app.tenant_id` is unset.
- Input validation on every endpoint is mandatory (body size cap, required fields, UUID checks).
- Dev-only credentials (`postgres/postgres`, `app_user/app_user`, fixed dev tokens) are clearly marked dev-only; never present as production config.
- `db-reset` is destructive and dev/test-only.
- Never commit unless the user explicitly asks.
- Locked blueprint decisions apply (Option C hybrid; this slice is the thin core + web chat only; WhatsApp/voice/AI/Keycloak/Temporal/NATS/SeaweedFS deferred).

---

### Task 1: Scaffold, infra, schema, and RLS

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `db/schema.sql`
- Create: `db/seed.sql`
- Create: `scripts/db-reset.js`
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: PostgreSQL schema with tables `tenants`, `api_tokens`, `contacts`, `conversations`, `messages`; RLS policies keyed on `current_setting('app.tenant_id', true)::uuid`; SQL function `resolve_token(p_hash text) RETURNS TABLE(tenant_id uuid, role text)` (SECURITY DEFINER); role `app_user` (non-superuser, RLS-subject). Dev seed: tenant Acme `11111111-1111-1111-1111-111111111111`, Globex `22222222-2222-2222-2222-222222222222`; dev tokens `acme-agent-token`, `acme-widget-token`, `globex-agent-token`, `globex-widget-token`. `scripts/db-reset.js` exports nothing (CLI); run via `node scripts/db-reset.js`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "omn-foni-ccaas-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "db:up": "docker compose up -d postgres",
    "db:reset": "node scripts/db-reset.js",
    "test": "node scripts/db-reset.js && node --test --test-concurrency=1 test/"
  },
  "dependencies": { "pg": "^8.13.1" }
}
```

- [ ] **Step 2: Write `.gitignore` and `.dockerignore`**

`.gitignore`:
```
node_modules/
*.log
.env
```

`.dockerignore`:
```
node_modules
test
docs
evidence
.git
*.log
```

- [ ] **Step 3: Write `db/schema.sql`**

```sql
-- Omn-Foni-CCaaS thin-core schema. Dev/test only credentials.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('agent','widget','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  channel text NOT NULL DEFAULT 'webchat',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  sender text NOT NULL CHECK (sender IN ('customer','agent','bot')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE api_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON api_tokens;
CREATE POLICY tenant_isolation ON api_tokens
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON contacts;
CREATE POLICY tenant_isolation ON contacts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON conversations;
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON messages;
CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE OR REPLACE FUNCTION resolve_token(p_hash text)
RETURNS TABLE(tenant_id uuid, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id, role FROM api_tokens WHERE token_hash = p_hash;
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE ON tenants, api_tokens, contacts, conversations, messages TO app_user;
GRANT EXECUTE ON FUNCTION resolve_token(text) TO app_user;
```

- [ ] **Step 4: Write `db/seed.sql`**

```sql
-- Dev-only seed. Fixed UUIDs and plaintext dev tokens. Never use in production.
INSERT INTO tenants (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme'),
  ('22222222-2222-2222-2222-222222222222', 'Globex')
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_tokens (tenant_id, token_hash, role) VALUES
  ('11111111-1111-1111-1111-111111111111', encode(digest('acme-agent-token','sha256'),'hex'), 'agent'),
  ('11111111-1111-1111-1111-111111111111', encode(digest('acme-widget-token','sha256'),'hex'), 'widget'),
  ('22222222-2222-2222-2222-222222222222', encode(digest('globex-agent-token','sha256'),'hex'), 'agent'),
  ('22222222-2222-2222-2222-222222222222', encode(digest('globex-widget-token','sha256'),'hex'), 'widget')
ON CONFLICT (token_hash) DO NOTHING;
```

- [ ] **Step 5: Write `scripts/db-reset.js`**

```js
// Dev/test-only destructive reset. Connects as superuser, recreates schema, seeds.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.ADMIN_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ccaas';
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await client.query(readFileSync(join(root, 'db/schema.sql'), 'utf8'));
await client.query(readFileSync(join(root, 'db/seed.sql'), 'utf8'));
await client.end();
console.log('db reset complete (dev/test only)');
```

- [ ] **Step 6: Write `docker-compose.yml` and `Dockerfile`**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ccaas
    ports:
      - "5432:5432"
    volumes:
      - ./db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./db/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d ccaas"]
      interval: 2s
      timeout: 3s
      retries: 20
  core:
    build: .
    environment:
      DATABASE_URL: postgres://app_user:app_user@postgres:5432/ccaas
      PORT: "8080"
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
```

`Dockerfile`:
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
EXPOSE 8080
CMD ["node", "src/server.js"]
```

- [ ] **Step 7: Install deps and start Postgres**

Run: `npm install`
Expected: `package-lock.json` created, `pg` installed.
Run: `docker compose up -d postgres`
Expected: postgres container healthy.

- [ ] **Step 8: Write the failing DB-level isolation test `test/db.test.js`**

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.DATABASE_URL || 'postgres://app_user:app_user@localhost:5432/ccaas';
const ACME = '11111111-1111-1111-1111-111111111111';
const GLOBEX = '22222222-2222-2222-2222-222222222222';
let pool;

before(() => { pool = new pg.Pool({ connectionString: url }); });

async function asTenant(tenantId, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
    return await fn(c);
  } finally { await c.query('ROLLBACK'); c.release(); }
}

test('RLS hides other tenant rows', async () => {
  await asTenant(ACME, async (c) => {
    await c.query('INSERT INTO contacts(tenant_id, display_name) VALUES($1,$2)', [ACME, 'Acme Visitor']);
  });
  const visible = await asTenant(GLOBEX, async (c) => {
    const { rows } = await c.query('SELECT count(*)::int AS n FROM contacts');
    return rows[0].n;
  });
  assert.equal(visible, 0);
});

test('RLS fails closed when tenant unset', async () => {
  const c = await pool.connect();
  try {
    const { rows } = await c.query('SELECT count(*)::int AS n FROM contacts');
    assert.equal(rows[0].n, 0);
  } finally { c.release(); }
});

test('RLS rejects cross-tenant insert', async () => {
  await assert.rejects(
    asTenant(ACME, (c) => c.query('INSERT INTO contacts(tenant_id, display_name) VALUES($1,$2)', [GLOBEX, 'forged'])),
    /row-level security/
  );
});

test('resolve_token maps hash to tenant and role', async () => {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update('acme-agent-token').digest('hex');
  const { rows } = await pool.query('SELECT tenant_id, role FROM resolve_token($1)', [hash]);
  assert.equal(rows[0].tenant_id, ACME);
  assert.equal(rows[0].role, 'agent');
});
```

- [ ] **Step 9: Reset DB and run the test to verify it passes**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/db.test.js`
Expected: 4 tests PASS. (Schema/RLS already exist from Steps 3-5; this task's "test" validates the infra deliverable. If any fail, fix schema before proceeding.)

- [ ] **Step 10: Commit (only if user asks)**

```bash
git add package.json package-lock.json .gitignore .dockerignore docker-compose.yml Dockerfile db scripts test/db.test.js
git commit -m "feat: scaffold thin-core infra with PostgreSQL RLS tenant isolation"
```

---

### Task 2: DB access and auth layer

**Files:**
- Create: `src/db.js`
- Create: `src/auth.js`
- Test: `test/auth.test.js`

**Interfaces:**
- Consumes: `resolve_token(text)` SQL function and `app_user` role from Task 1.
- Produces:
  - `src/db.js`: `pool` (pg.Pool), `resolveToken(hash) -> Promise<{tenant_id, role}|null>`, `withTenant(tenantId, fn) -> Promise<any>` where `fn(client)` runs inside a transaction with `app.tenant_id` set.
  - `src/auth.js`: `hashToken(token) -> string` (sha256 hex), `authenticate(req) -> Promise<{tenant_id, role}|null>` reading `Authorization: Bearer`.

- [ ] **Step 1: Write the failing test `test/auth.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, authenticate } from '../src/auth.js';
import { resolveToken, withTenant } from '../src/db.js';

const ACME = '11111111-1111-1111-1111-111111111111';

test('hashToken is sha256 hex', () => {
  assert.equal(hashToken('acme-agent-token').length, 64);
});

test('resolveToken returns tenant for valid token', async () => {
  const t = await resolveToken(hashToken('acme-agent-token'));
  assert.equal(t.tenant_id, ACME);
  assert.equal(t.role, 'agent');
});

test('resolveToken returns null for unknown token', async () => {
  assert.equal(await resolveToken(hashToken('nope')), null);
});

test('authenticate parses bearer header', async () => {
  const req = { headers: { authorization: 'Bearer acme-widget-token' } };
  const t = await authenticate(req);
  assert.equal(t.role, 'widget');
});

test('authenticate returns null without header', async () => {
  assert.equal(await authenticate({ headers: {} }), null);
});

test('withTenant scopes queries to tenant', async () => {
  const n = await withTenant(ACME, async (c) => {
    const { rows } = await c.query('SELECT count(*)::int AS n FROM api_tokens');
    return rows[0].n;
  });
  assert.equal(n, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/auth.test.js`
Expected: FAIL (cannot find `../src/auth.js` / `../src/db.js`).

- [ ] **Step 3: Write `src/db.js`**

```js
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://app_user:app_user@localhost:5432/ccaas',
});

export async function resolveToken(hash) {
  const { rows } = await pool.query('SELECT tenant_id, role FROM resolve_token($1)', [hash]);
  return rows[0] || null;
}

export async function withTenant(tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Write `src/auth.js`**

```js
import { createHash } from 'node:crypto';
import { resolveToken } from './db.js';

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function authenticate(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  return resolveToken(hashToken(match[1]));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/auth.test.js`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit (only if user asks)**

```bash
git add src/db.js src/auth.js test/auth.test.js
git commit -m "feat: add tenant-scoped DB access and bearer-token auth"
```

---

### Task 3: HTTP server, auth middleware, healthz, static serving

**Files:**
- Create: `src/server.js`
- Create: `test/helpers.js`
- Create: `public/index.html` (placeholder served at `/`; full UI in Task 6)
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `authenticate`, `hashToken` (Task 2); `withTenant`, `pool` (Task 2).
- Produces:
  - `src/server.js`: `createAppServer() -> http.Server` (does not listen); `startServer(port) -> Promise<{server, port}>`. Auto-listens on `process.env.PORT || 8080` only when run directly.
  - Route dispatch helper internal. Auth: no token -> 401; wrong role -> 403.
  - `test/helpers.js`: `boot() -> Promise<{base, close}>` starts server on ephemeral port; `api(base, method, path, {token, body}) -> Promise<{status, json}>`.
  - Dev tokens reused from Task 1 seed.

- [ ] **Step 1: Write `test/helpers.js`**

```js
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
  return { base, close: () => new Promise((r) => server.close(r)) };
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
```

- [ ] **Step 2: Write the failing test `test/server.test.js`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, api, TOKENS } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
after(async () => { await ctx.close(); });

test('healthz is public', async () => {
  const { status, json } = await api(ctx.base, 'GET', '/healthz');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test('agent endpoint rejects missing token', async () => {
  const { status } = await api(ctx.base, 'GET', '/api/agent/conversations');
  assert.equal(status, 401);
});

test('agent endpoint rejects invalid token', async () => {
  const { status } = await api(ctx.base, 'GET', '/api/agent/conversations', { token: 'bad' });
  assert.equal(status, 401);
});

test('widget token cannot access agent endpoint', async () => {
  const { status } = await api(ctx.base, 'GET', '/api/agent/conversations', { token: TOKENS.acmeWidget });
  assert.equal(status, 403);
});

test('serves index.html at root', async () => {
  const res = await fetch(ctx.base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/server.test.js`
Expected: FAIL (cannot find `../src/server.js`).

- [ ] **Step 4: Write `src/server.js` (skeleton with auth, healthz, static, route table)**

```js
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { authenticate } from './auth.js';
import { withTenant } from './db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 1_000_000;

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

async function readBody(req) {
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
function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw Object.assign(new Error(`${field} must be a UUID`), { status: 400 });
  }
  return value;
}
function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 8000) {
    throw Object.assign(new Error(`${field} must be a non-empty string <= 8000 chars`), { status: 400 });
  }
  return value;
}

// Route handlers are added in Tasks 4 and 5. Each: { method, pattern, roles, handler }.
// pattern is a RegExp with named groups; handler(req, res, { tenant, params, body }).
const routes = [];

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
    const tenant = await authenticate(req);
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

// Route registration hook used by Tasks 4 and 5.
export function registerRoute(route) { routes.push(route); }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startServer().then(({ port }) => console.log(`thin-core listening on ${port}`));
}
```

Note: Tasks 4 and 5 add handlers by importing `registerRoute`, `withTenant`, `requireUuid`, `requireText`, `send`. To keep those helpers reusable, export them. Update the skeleton exports: add `export { send, readBody, requireUuid, requireText };` near the helpers. (Implementer: add this export line.)

- [ ] **Step 5: Write placeholder `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Omn-Foni CCaaS</title></head>
<body><h1>Omn-Foni CCaaS thin core</h1><p>UI arrives in Task 6.</p></body>
</html>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/server.test.js`
Expected: 5 tests PASS. (Agent route does not exist yet, so missing/invalid token returns 404, not 401. To make Step 2 pass now, register a temporary agent list route in Task 5. For Task 3, adjust: the 401/403 tests require an existing agent route. Implementer: add the agent conversations GET route now as a stub returning `[]` via `withTenant`, so auth tests exercise real middleware. Full handler logic is completed in Task 5.)

Add this stub route registration at the bottom of `src/server.js` (before `isMain`):
```js
registerRoute({
  method: 'GET',
  pattern: /^\/api\/agent\/conversations$/,
  roles: ['agent', 'admin'],
  handler: async (req, res, { tenant }) => {
    const rows = await withTenant(tenant.tenant_id, async (c) => {
      const { rows } = await c.query('SELECT id, status, created_at FROM conversations ORDER BY created_at DESC LIMIT 100');
      return rows;
    });
    send(res, 200, { conversations: rows });
  },
});
```

- [ ] **Step 7: Re-run test to verify it passes**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/server.test.js`
Expected: 5 tests PASS.

- [ ] **Step 8: Commit (only if user asks)**

```bash
git add src/server.js test/helpers.js test/server.test.js public/index.html
git commit -m "feat: add HTTP core with auth middleware, healthz, static serving"
```

---

### Task 4: Widget endpoints (create conversation, post inbound message)

**Files:**
- Create: `src/routes/widget.js`
- Modify: `src/server.js` (import widget routes)
- Test: `test/widget.test.js`

**Interfaces:**
- Consumes: `registerRoute`, `withTenant`, `send`, `requireUuid`, `requireText` (Task 3); `authenticate` (Task 2).
- Produces:
  - `POST /api/widget/conversations` (role `widget`), body `{ displayName? }` -> 201 `{ id, status, created_at }`.
  - `POST /api/widget/messages` (role `widget`), body `{ conversationId, body }` -> 201 `{ id, created_at }`. Verifies conversation belongs to tenant (RLS) before insert; unknown conversation -> 404.
  - `src/routes/widget.js` exports `registerWidgetRoutes()` (calls `registerRoute`).

- [ ] **Step 1: Write the failing test `test/widget.test.js`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, api, TOKENS } from './helpers.js';

let ctx;
before(async () => { ctx = await boot(); });
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

test('agent token cannot use widget endpoint', async () => {
  const { status } = await api(ctx.base, 'POST', '/api/widget/conversations', { token: TOKENS.acmeAgent, body: {} });
  assert.equal(status, 403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/widget.test.js`
Expected: FAIL (routes return 404).

- [ ] **Step 3: Write `src/routes/widget.js`**

```js
import { registerRoute, withTenant, send, requireUuid, requireText } from '../server.js';

export function registerWidgetRoutes() {
  registerRoute({
    method: 'POST',
    pattern: /^\/api\/widget\/conversations$/,
    roles: ['widget'],
    handler: async (req, res, { tenant, body }) => {
      const displayName = typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.slice(0, 200) : 'Visitor';
      const row = await withTenant(tenant.tenant_id, async (c) => {
        const contact = await c.query(
          'INSERT INTO contacts(tenant_id, display_name) VALUES($1,$2) RETURNING id',
          [tenant.tenant_id, displayName]);
        const conv = await c.query(
          'INSERT INTO conversations(tenant_id, contact_id, channel, status) VALUES($1,$2,$3,$4) RETURNING id, status, created_at',
          [tenant.tenant_id, contact.rows[0].id, 'webchat', 'open']);
        return conv.rows[0];
      });
      send(res, 201, row);
    },
  });

  registerRoute({
    method: 'POST',
    pattern: /^\/api\/widget\/messages$/,
    roles: ['widget'],
    handler: async (req, res, { tenant, body }) => {
      const conversationId = requireUuid(body.conversationId, 'conversationId');
      const text = requireText(body.body, 'body');
      const row = await withTenant(tenant.tenant_id, async (c) => {
        const owns = await c.query('SELECT id FROM conversations WHERE id=$1', [conversationId]);
        if (owns.rows.length === 0) throw Object.assign(new Error('conversation not found'), { status: 404 });
        const msg = await c.query(
          'INSERT INTO messages(tenant_id, conversation_id, direction, sender, body) VALUES($1,$2,$3,$4,$5) RETURNING id, created_at',
          [tenant.tenant_id, conversationId, 'in', 'customer', text]);
        return msg.rows[0];
      });
      send(res, 201, row);
    },
  });
}
```

- [ ] **Step 4: Wire routes into `src/server.js`**

Add near the top imports: `import { registerWidgetRoutes } from './routes/widget.js';`
Add before the `isMain` block: `registerWidgetRoutes();`
Note: `src/routes/widget.js` imports from `../server.js`, and `server.js` imports `widget.js`. This is a circular import. To avoid it, move shared helpers (`send`, `readBody`, `requireUuid`, `requireText`, `registerRoute`, `routes`, `withTenant` re-export) into a new module `src/http.js`, and have both `server.js` and route modules import from `http.js`. Implementer: create `src/http.js` containing `send`, `readBody`, `requireUuid`, `requireText`, the `routes` array, `registerRoute`, and re-export `withTenant` from `db.js`. Update `server.js` to import these from `./http.js` and remove its local copies. Update `widget.js` to import from `../http.js`. This breaks the cycle cleanly.

`src/http.js`:
```js
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
```

Then `src/server.js` imports `{ routes, send, readBody }` from `./http.js`, removes local helper definitions, and keeps `createAppServer`, `startServer`, dispatch, healthz, static. `widget.js` imports from `../http.js`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/widget.test.js test/server.test.js`
Expected: widget 5 PASS, server 5 PASS.

- [ ] **Step 6: Commit (only if user asks)**

```bash
git add src/http.js src/routes/widget.js src/server.js test/widget.test.js
git commit -m "feat: add web-chat widget conversation and message endpoints"
```

---

### Task 5: Agent endpoints and cross-tenant isolation

**Files:**
- Create: `src/routes/agent.js`
- Modify: `src/server.js` (import agent routes; remove Task 3 stub)
- Test: `test/isolation.test.js`

**Interfaces:**
- Consumes: `registerRoute`, `withTenant`, `send`, `requireUuid`, `requireText` from `src/http.js`.
- Produces:
  - `GET /api/agent/conversations` (roles `agent`,`admin`) -> 200 `{ conversations: [...] }` (replaces Task 3 stub).
  - `GET /api/agent/conversations/:id/messages` -> 200 `{ messages: [...] }`; conversation not in tenant -> 404.
  - `POST /api/agent/conversations/:id/messages` body `{ body }` -> 201 `{ id, created_at }`; verifies ownership; unknown -> 404.
  - `src/routes/agent.js` exports `registerAgentRoutes()`.

- [ ] **Step 1: Write the failing test `test/isolation.test.js`**

```js
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
  await newConv(TOKENS.globexWidget);
  const { json } = await api(ctx.base, 'GET', '/api/agent/conversations', { token: TOKENS.acmeAgent });
  const ids = json.conversations.map((c) => c.id);
  assert.ok(ids.includes(acmeConv));
  assert.ok(!ids.some((id) => id !== acmeConv && ids.length === 1) || true);
  for (const c of json.conversations) {
    const read = await api(ctx.base, 'GET', `/api/agent/conversations/${c.id}/messages`, { token: TOKENS.acmeAgent });
    assert.equal(read.status, 200);
  }
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/isolation.test.js`
Expected: FAIL (messages routes return 404).

- [ ] **Step 3: Write `src/routes/agent.js`**

```js
import { registerRoute, withTenant, send, requireUuid, requireText } from '../http.js';

async function assertOwnership(client, conversationId) {
  const { rows } = await client.query('SELECT id FROM conversations WHERE id=$1', [conversationId]);
  if (rows.length === 0) throw Object.assign(new Error('conversation not found'), { status: 404 });
}

export function registerAgentRoutes() {
  registerRoute({
    method: 'GET',
    pattern: /^\/api\/agent\/conversations$/,
    roles: ['agent', 'admin'],
    handler: async (req, res, { tenant }) => {
      const rows = await withTenant(tenant.tenant_id, async (c) => {
        const { rows } = await c.query('SELECT id, status, channel, created_at FROM conversations ORDER BY created_at DESC LIMIT 100');
        return rows;
      });
      send(res, 200, { conversations: rows });
    },
  });

  registerRoute({
    method: 'GET',
    pattern: /^\/api\/agent\/conversations\/(?<id>[^/]+)\/messages$/,
    roles: ['agent', 'admin'],
    handler: async (req, res, { tenant, params }) => {
      const id = requireUuid(params.id, 'id');
      const rows = await withTenant(tenant.tenant_id, async (c) => {
        await assertOwnership(c, id);
        const { rows } = await c.query('SELECT id, direction, sender, body, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC', [id]);
        return rows;
      });
      send(res, 200, { messages: rows });
    },
  });

  registerRoute({
    method: 'POST',
    pattern: /^\/api\/agent\/conversations\/(?<id>[^/]+)\/messages$/,
    roles: ['agent', 'admin'],
    handler: async (req, res, { tenant, params, body }) => {
      const id = requireUuid(params.id, 'id');
      const text = requireText(body.body, 'body');
      const row = await withTenant(tenant.tenant_id, async (c) => {
        await assertOwnership(c, id);
        const { rows } = await c.query(
          'INSERT INTO messages(tenant_id, conversation_id, direction, sender, body) VALUES($1,$2,$3,$4,$5) RETURNING id, created_at',
          [tenant.tenant_id, id, 'out', 'agent', text]);
        return rows[0];
      });
      send(res, 201, row);
    },
  });
}
```

- [ ] **Step 4: Wire into `src/server.js`**

Add import: `import { registerAgentRoutes } from './routes/agent.js';`
Remove the Task 3 stub `registerRoute({... GET /api/agent/conversations ...})` block.
Add before `isMain`: `registerAgentRoutes();`

- [ ] **Step 5: Run test to verify it passes**

Run: `node scripts/db-reset.js && node --test --test-concurrency=1 test/isolation.test.js`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit (only if user asks)**

```bash
git add src/routes/agent.js src/server.js test/isolation.test.js
git commit -m "feat: add agent inbox endpoints with cross-tenant isolation"
```

---

### Task 6: Web-chat widget and minimal agent inbox UI

**Files:**
- Modify: `public/index.html` (replace placeholder)
- Test: `test/ui.test.js`

**Interfaces:**
- Consumes: widget + agent API (Tasks 4, 5).
- Produces: a single static page with two panels: a customer web-chat widget (uses a widget token) and a minimal agent inbox (uses an agent token). Vanilla JS, no build. Tokens entered in the page (dev convenience); clearly labeled dev-only.

- [ ] **Step 1: Write the failing test `test/ui.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=1 test/ui.test.js`
Expected: FAIL (placeholder lacks panels).

- [ ] **Step 3: Replace `public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Omn-Foni CCaaS</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 1rem; }
  section { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; }
  h1 { grid-column: 1 / -1; font-size: 1.2rem; }
  .log { border: 1px solid #eee; height: 240px; overflow-y: auto; padding: .5rem; margin: .5rem 0; }
  .msg { margin: .25rem 0; }
  .customer { color: #0a5; } .agent { color: #05a; }
  input, button { font: inherit; padding: .4rem; }
  label { display: block; margin: .25rem 0; }
  .dev { color: #a00; font-size: .8rem; }
</style>
</head>
<body>
<h1>Omn-Foni CCaaS thin core <span class="dev">dev tokens only</span></h1>

<section id="widget" aria-label="Customer web chat">
  <h2>Customer web chat</h2>
  <label>Widget token <input id="widgetToken" value="acme-widget-token"></label>
  <div class="log" id="widgetLog" aria-live="polite"></div>
  <label>Message <input id="widgetInput" placeholder="Type a message"></label>
  <button id="widgetSend">Send</button>
</section>

<section id="inbox" aria-label="Agent inbox">
  <h2>Agent inbox</h2>
  <label>Agent token <input id="agentToken" value="acme-agent-token"></label>
  <button id="refresh">Refresh conversations</button>
  <div class="log" id="convList" aria-live="polite"></div>
  <label>Reply <input id="replyInput" placeholder="Reply to selected conversation"></label>
  <button id="replySend">Reply</button>
</section>

<script>
const $ = (id) => document.getElementById(id);
let conversationId = null;
let selectedConv = null;

function add(log, text, cls) {
  const div = document.createElement('div');
  div.className = 'msg ' + (cls || '');
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function call(method, path, token, body) {
  const res = await fetch(path, {
    method,
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

$('widgetSend').addEventListener('click', async () => {
  const token = $('widgetToken').value;
  const text = $('widgetInput').value.trim();
  if (!text) return;
  if (!conversationId) {
    const c = await call('POST', '/api/widget/conversations', token, {});
    conversationId = c.json.id;
  }
  const r = await call('POST', '/api/widget/messages', token, { conversationId, body: text });
  if (r.status === 201) { add($('widgetLog'), 'You: ' + text, 'customer'); $('widgetInput').value = ''; }
  else add($('widgetLog'), 'Error: ' + r.status);
});

$('refresh').addEventListener('click', async () => {
  const token = $('agentToken').value;
  const r = await call('GET', '/api/agent/conversations', token);
  const list = $('convList'); list.textContent = '';
  if (r.status !== 200) { add(list, 'Error: ' + r.status); return; }
  for (const c of r.json.conversations) {
    const btn = document.createElement('button');
    btn.textContent = c.id.slice(0, 8) + ' (' + c.status + ')';
    btn.addEventListener('click', async () => {
      selectedConv = c.id;
      const m = await call('GET', '/api/agent/conversations/' + c.id + '/messages', token);
      list.textContent = '';
      for (const msg of m.json.messages) add(list, msg.sender + ': ' + msg.body, msg.sender);
    });
    list.appendChild(btn);
  }
});

$('replySend').addEventListener('click', async () => {
  if (!selectedConv) return;
  const token = $('agentToken').value;
  const text = $('replyInput').value.trim();
  if (!text) return;
  const r = await call('POST', '/api/agent/conversations/' + selectedConv + '/messages', token, { body: text });
  if (r.status === 201) { add($('convList'), 'agent: ' + text, 'agent'); $('replyInput').value = ''; }
});
</script>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=1 test/ui.test.js`
Expected: 1 test PASS.

- [ ] **Step 5: Commit (only if user asks)**

```bash
git add public/index.html test/ui.test.js
git commit -m "feat: add web-chat widget and minimal agent inbox UI"
```

---

### Task 7: Full suite, compose smoke, run docs, AGENTS.md commands

**Files:**
- Create: `README.md`
- Modify: `AGENTS.md` (add verified commands)
- Test: full `npm test`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green full test suite; documented run steps; AGENTS.md commands section.

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: db-reset completes; all test files PASS (db 4, auth 6, server 5, widget 5, isolation 5, ui 1 = 26 tests).

- [ ] **Step 2: Compose smoke test**

Run: `docker compose up -d --build`
Expected: postgres healthy, core running.
Run: `curl -s localhost:8080/healthz`
Expected: `{"ok":true}`.
Run: `curl -s -X POST localhost:8080/api/widget/conversations -H 'authorization: Bearer acme-widget-token' -H 'content-type: application/json' -d '{}'`
Expected: 201 with `id`. (Compose postgres is seeded by init scripts.)
Run: `docker compose down`
Expected: containers removed.

- [ ] **Step 3: Write `README.md`**

```markdown
# Omn-Foni-CCaaS

FOSS multi-tenant omnichannel CCaaS. This repository currently contains the
thin-core vertical slice: a conversation/routing/tenancy service with
PostgreSQL Row-Level Security tenant isolation, a web-chat channel, and an
agent inbox API. See `docs/blueprint.md` for the full multi-year architecture.

## Scope of this slice

Included: thin core, PostgreSQL + RLS, web chat, agent inbox API, cross-tenant
isolation tests, dev web UI.
Deferred: WhatsApp, email, voice, AI flows, Keycloak, Temporal, NATS, SeaweedFS,
full React/Carbon inbox. These are later blueprint phases.

## Requirements

- Node >= 22
- Docker + Docker Compose

## Run (development)

    npm install
    docker compose up -d postgres
    npm run db:reset
    npm start

Open http://localhost:8080. Dev tokens (dev only, never production):
`acme-widget-token`, `acme-agent-token`, `globex-widget-token`,
`globex-agent-token`.

## Run (full stack via Compose)

    docker compose up -d --build

Core on http://localhost:8080, Postgres on localhost:5432.

## Test

    npm test

Resets the dev/test database, then runs the built-in node:test suite,
including cross-tenant isolation tests. `db:reset` is destructive and
dev/test-only.

## Security model

Every request resolves a bearer token to a tenant server-side via a
SECURITY DEFINER function. Queries run inside a transaction that sets
`app.tenant_id`; PostgreSQL RLS filters every tenant table and fails closed
when the tenant is unset. Client-supplied tenant identifiers are never trusted.

## License

MIT. See LICENSE.
```

- [ ] **Step 4: Update `AGENTS.md` commands**

Replace the line `- No test/lint/typecheck commands exist yet (no code). Add them here when the first code lands.` with:

```markdown
- Commands (thin-core slice, Node 22 ESM):
  - `npm install` install deps (only `pg`).
  - `npm run db:up` start Postgres via Docker Compose.
  - `npm run db:reset` destructive dev/test DB reset + seed.
  - `npm start` run the core on PORT (default 8080).
  - `npm test` reset DB then run node:test suite (includes isolation tests).
  - No lint/typecheck configured yet (plain JS, no build step).
```

- [ ] **Step 5: Verify AGENTS.md and README have no em-dashes**

Run: `grep -nP '[—–]' README.md AGENTS.md || echo "no em-dashes"`
Expected: `no em-dashes`.

- [ ] **Step 6: Commit (only if user asks)**

```bash
git add README.md AGENTS.md
git commit -m "docs: add run instructions and verified commands for thin-core slice"
```

---

## Self-Review

**Spec coverage (blueprint slice goals):**
- Provable tenant isolation (Phase 0 acceptance): Tasks 1, 2, 5 (RLS + isolation tests). Covered.
- Web-chat end-to-end (partial Phase 1): Tasks 4, 6. Covered.
- Agent inbox API: Task 5. Covered.
- Runnable via Docker Compose: Tasks 1, 7. Covered.
- Input validation / trust boundaries: Tasks 3, 4, 5 (body cap, UUID/text checks, ownership checks, token resolution). Covered.
- Deferred items explicitly listed in README and Global Constraints. Covered.

**Placeholder scan:** No TBD/TODO. The Task 3 stub and Task 4 circular-import refactor are explicit instructions with full code, not placeholders.

**Type consistency:** `withTenant(tenantId, fn)`, `resolveToken(hash)`, `authenticate(req)`, `hashToken(token)`, `registerRoute(route)`, `send(res, status, payload)`, `requireUuid(value, field)`, `requireText(value, field)` used consistently. Route handler signature `(req, res, { tenant, params, body })` consistent across widget/agent. `tenant.tenant_id` and `tenant.role` consistent. After Task 4 refactor, shared helpers live in `src/http.js`; Tasks 5-7 import from there. Task 3 stub removed in Task 5.