# Omn-Foni-CCaaS

FOSS multi-tenant omnichannel CCaaS. This repository currently contains the
thin-core vertical slice: a conversation/routing/tenancy service with
PostgreSQL Row-Level Security tenant isolation, a web-chat channel, and an
agent inbox API. See `docs/blueprint.md` for the full multi-year architecture.

## Scope of this slice

Included: thin core, PostgreSQL + RLS, web chat, agent inbox API, cross-tenant
isolation tests, dev web UI, Keycloak identity, and append-only audit.
Deferred: WhatsApp, email, voice, AI flows, Temporal, NATS, SeaweedFS,
full React/Carbon inbox. These are later blueprint phases.

## Requirements

- Node >= 22
- Docker + Docker Compose

## Run (development)

    npm install
    docker compose up -d postgres
    npm run db:reset
    npm start

Open http://localhost:8080. Widget tokens (dev only, never production):
`acme-widget-token`, `globex-widget-token`. Agent and admin routes require a
Keycloak OIDC sign-in via the dev UI. See "Phase 0 identity and audit" below.

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

## Phase 0 identity and audit

Keycloak supplies identity for agent and admin routes. Start it with
`npm run kc:up` (Keycloak only) or `npm run services:up` (Postgres and Keycloak).
The realm is `ccaas`, the SPA client is `ccaas-spa`, and the dev users are
`acme-agent` and `globex-agent` (role agent) plus `acme-admin` (role admin).
All three use password `dev-password`. These are development identities only.

The core verifies RS256 access tokens against a remote JWKS with `jose`, pinning
issuer and audience. Configuration uses these environment variables:

- `KEYCLOAK_ISSUER`: default `http://localhost:8081/realms/ccaas`
- `KEYCLOAK_JWKS_URL`: default `${ISSUER}/protocol/openid-connect/certs`
- `KEYCLOAK_AUDIENCE`: default `ccaas-spa`
- `KEYCLOAK_TOKEN_URL`: default `${ISSUER}/protocol/openid-connect/token`

Agent and admin API routes require a Keycloak OIDC bearer token. Widget routes
keep static widget-token auth. The dev SPA signs in with Authorization Code +
PKCE against
`http://localhost:8081/realms/ccaas/protocol/openid-connect/auth`.

Audit rows are append-only in the `audit_events` table. Privileged actions and
cross-tenant denials are recorded. Rotate a tenant's widget token with
`POST /api/admin/tokens/rotate`, which requires an admin OIDC token.

`npm test` requires both Postgres and Keycloak running. It resets the dev/test
database before running the node:test suite.

Version sources, accessed 2026-11-23:

- Keycloak image `quay.io/keycloak/keycloak:26.8.2`: https://github.com/keycloak/keycloak/releases/tag/26.8.2
- `jose` `^6.2.18`: https://www.npmjs.com/package/jose

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