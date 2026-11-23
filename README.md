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

Core on http://localhost:8080, Postgres on localhost:5432. If host port 8080 is
already taken, override it: `CORE_PORT=8090 docker compose up -d --build`.

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

## Layout

- `src/server.js` HTTP core, dispatch, healthz, static serving.
- `src/http.js` shared helpers: route registry, body parsing, validation.
- `src/db.js` pool, `resolveToken`, `withTenant` (RLS transaction scope).
- `src/auth.js` bearer-token hashing and authentication.
- `src/routes/widget.js`, `src/routes/agent.js` channel and inbox endpoints.
- `db/schema.sql`, `db/seed.sql` schema, RLS policies, dev seed.
- `scripts/db-reset.js` destructive dev/test reset.
- `public/index.html` dev web-chat widget and agent inbox.
- `test/` node:test suite including isolation tests.

## License

MIT. See LICENSE.