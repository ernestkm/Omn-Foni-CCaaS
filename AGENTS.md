# AGENTS.md

## Repository

Omn-Foni-CCaaS: a FOSS multi-tenant omnichannel CCaaS targeting Sleekflow +
Voiceflow capability parity plus voice. Multi-tenant SaaS, ZA-hosted,
POPIA-aligned. The thin-core vertical slice is implemented (Node 22 ESM +
PostgreSQL RLS, web chat, agent inbox API); later blueprint phases are deferred.

- Git: branch `main`, remote `git@github.com:ernestkm/Omn-Foni-CCaaS.git`.
  Single commit `e51d430 Initial commit` (LICENSE only).
- License: MIT, Copyright (c) 2026 Ernest Manamela.
- Never commit unless explicitly asked.

## Layout

- `docs/blueprint.md`: architecture and implementation blueprint, sections 0-9
  plus Appendix A. The primary planning artifact.
- `evidence/rea-bundle.json`: REA Evidence bundle (15 records, 2 residual
  unknowns) from the public-asset vendor pass.
- `evidence/static-extraction-notes.md`: analyst string-extraction findings,
  artifact SHA-256 digests, and coverage limits.
- `src/`, `db/`, `scripts/`, `public/`, `test/`: thin-core slice (see README.md).
- `keycloak/`: realm export and Keycloak Compose assets.
- `docs/superpowers/plans/`: implementation plans.

## Documentation rules

- Senior technical audience. Concise. No em-dashes. No hedging or buzzwords.
- Every external factual claim needs a source URL plus access date, or an
  explicit `[unverified]` tag. Baseline access date for existing citations:
  2026-11-23.
- Vendor parity claims must be rechecked against live vendor docs before any
  budget commitment. License and maintenance facts must be re-verified before
  procurement.
- Legal/regulatory content is a planning input, not legal advice; flag for
  qualified review.
- Do not guess URLs. If a URL cannot be verified, mark it `[unverified]`.

## Locked decisions (do not relitigate without user approval)

- Option C hybrid architecture: custom thin conversation/routing/tenancy core
  plus Keycloak, PostgreSQL + RLS, NATS JetStream, Temporal, vLLM, SeaweedFS,
  FreeSWITCH + Kamailio (voice phase 2), React Flow canvas, Carbon UI.
- Messaging-first MVP; voice is phase 2 and gated on ICASA licensing/partner.
- Hybrid AI: self-hosted open weights default; per-tenant commercial API opt-in
  with POPIA s72 safeguards.
- Excluded: MinIO (archived, AGPL), Flowise (EOL, unpatched CVEs), n8n
  (non-OSI license), Botpress cloud, Rasa OSS (frozen). Chatwoot and Langflow
  are references, not engines.

## Environment (verified 2026-11-23)

- Debian 12 bookworm; `apt` works.
- Node v22.23.4 at `/opt/node-v22.23.4-linux-x64`; `npx` 10.9.9.
- Commands (thin-core slice, Node 22 ESM, runtime deps `pg` and `jose`):
  - `npm install` install deps.
  - `npm run db:up` start Postgres and Keycloak via Docker Compose.
  - `npm run kc:up` start Keycloak only via Docker Compose.
  - `npm run services:up` start Postgres and Keycloak via Docker Compose.
  - `npm run db:reset` destructive dev/test DB reset + seed.
  - `npm start` run the core on PORT (default 8080).
  - `npm test` reset DB then run node:test suite (requires Postgres and Keycloak).
  - No lint/typecheck configured (plain JS, no build step).

## Auth model (Phase 0)

Agent and admin routes require Keycloak OIDC bearer tokens (RS256, pinned issuer
and audience). Widget routes use static widget tokens. The agent panel signs in
with Authorization Code + PKCE. Audit rows in `audit_events` are append-only.

## REA tooling caveats

- `rea_analyze_web_bundle` requires `view: {kind: "javascript-routes",
  collection: "summary"}`; omitting it fails schema validation.
- `rea_analyze_javascript_application` is unusable on large bundles in this
  host: the ~60s host tool deadline cancels long runs. Do not repeat unchanged
  calls; use static extraction and label it as analyst observation.
- Vendor apps behind login (Sleekflow SSO, Voiceflow creator) are unobservable
  without accounts; label such behavior `[unverified]`.