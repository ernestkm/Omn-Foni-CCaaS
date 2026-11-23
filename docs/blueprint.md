# Omn-Foni-CCaaS Architecture and Implementation Blueprint

Status: decision-ready draft for review. Audience: senior engineering, security,
and product leadership. This is a multi-year program. Phase 1 is deliberately
bounded; later phases are scoped but not committed.

## 0. Scope, decisions, and evidence base

### 0.1 Locked decisions

These were approved before this document was written and are treated as fixed
inputs, not open questions.

| Decision | Choice |
|---|---|
| Deployment model | Multi-tenant SaaS, South Africa hosted, hard tenant isolation from phase 1 |
| MVP scope | Messaging-first: WhatsApp, web chat, email, agent desktop, basic AI flows. Voice is phase 2 |
| AI strategy | Hybrid: self-hosted open weights (vLLM) by default; per-tenant commercial API opt-in with POPIA s72 safeguards and DPAs |
| Architecture | Option C hybrid: custom thin conversation/routing/tenancy core plus commodity FOSS components |
| REA evidence scope | Public assets and docs only. Anything behind login is labeled unverified. No vendor accounts used |

### 0.2 Citation and verification convention

- Every external factual claim carries a source URL. All URLs were accessed
  2026-11-23 unless a different date is stated.
- Claims that could not be verified from public sources are tagged `[unverified]`.
- Vendor parity claims (what Sleekflow and Voiceflow actually ship) must be
  rechecked against live vendor docs immediately before budget commitment.
  Marketing and docs can lag or overstate shipped capability. This is recorded as
  residual unknown `unk_fa7db1ec080e8ce0ced8e4a4b63d4a974fe1cb0119423de49df0d4c64869aaf2` in `evidence/rea-bundle.json`.
- Legal and regulatory statements require qualified legal review before they are
  relied on. They are engineering planning inputs, not legal advice.
- License and maintenance facts were verified against the GitHub API and raw
  LICENSE/COPYING files on 2026-11-23. They change; re-verify before procurement.

### 0.3 Evidence base

Reverse engineering was performed with REA against publicly shipped
assets only. The full Evidence bundle is at `evidence/rea-bundle.json`
(15 records, 2 residual unknowns). Analyst string-extraction notes are at
`evidence/static-extraction-notes.md`.

What REA established:

- Voiceflow creator app shell at `creator.voiceflow.com/start` is an
  onboarding/login gate. The main bundle `assets/index-BCILlEtz.js`
  (17,947,005 bytes, SHA-256 `bb568e7ad04978dd0b59568ecb22d88dbeb541a33af5c85ab65a6fa746b73cb4`) is publicly shipped. Static
  extraction recovered service hosts and feature help-link slugs.
- Voiceflow chat widget `cdn.voiceflow.com/widget-next/bundle.mjs`
  (1,817,227 bytes, SHA-256 `69740b9b4cc63c1893cf92b4395cdfb32312538bdf0354ac47bf59152d483bd3`), banner
  `@voiceflow/chat 2.211.0`. Static extraction recovered the runtime endpoint
  `/v4/interact/socket`, file endpoints `/v1/uploads/file` and
  `/v1/handoff/file`, and message-type literals.
- Sleekflow app (`app.sleekflow.io`) redirects to `sso.sleekflow.io`
  (Auth0-style universal login) and returns a Vercel Security Checkpoint to
  non-browser clients. The authenticated Sleekflow app bundle is unobserved.

What REA could not establish (explicit unknowns):

- Full module/route/call graph of the Voiceflow creator and widget bundles. The
  17.9MB creator bundle exhausted the analyzer's 1024MiB heap; both full-graph
  runs were cancelled by the host tool deadline. Static string extraction
  succeeded but is not a complete census. Recorded as `unk_6915b63277dd9bbd616c8239dacb2bbfee90111e7a6a723eac71692a8d1e9a55`.
- Any authenticated behavior of either vendor. No login was performed.

Static strings do not prove runtime execution or reachability. Treat bundle
observations as shipped-artifact evidence, not as a behavior specification.

---

## 1. Feature parity matrix and gaps

Goal: replicate the union of Sleekflow (omnichannel customer engagement) and
Voiceflow (conversational AI design and runtime) capabilities, plus voice, on a
FOSS base we control. The matrix below maps each vendor capability to a target
component and flags the gap we must build or integrate.

Legend: `Build` = custom code in the thin core or canvas. `Integrate` = adopt a
FOSS component. `Reference` = study but do not adopt as the engine. `Gap` = not
covered by any chosen component and must be built.

### 1.1 Sleekflow capabilities

Sources: [Sleekflow FAQ](https://www.sleekflow.io/en-us/faq),
[help.sleekflow.io](https://help.sleekflow.io),
[Sleekflow changelog](https://feedback.sleekflow.io/changelog), all accessed
2026-11-23. The Oct 23 2026 changelog entries (redesigned Choose-template
window; AgentFlow takeover/handback) confirm active development.

| Capability | Vendor detail | Target | Action |
|---|---|---|---|
| Omnichannel inbox | WhatsApp, Instagram, Messenger, SMS, live chat, WeChat, LINE, Telegram, Viber (9+ channels) | Thin core channel adapters + unified conversation model | Build core; Integrate WhatsApp via Meta Cloud API; others via adapter contracts |
| Unified inbox | Single agent workspace across channels | Agent desktop (Carbon) | Build |
| Contacts CRM | Contact profiles, custom objects | PostgreSQL + RLS contact store | Build |
| Flow builder | Classic + Advanced Flow Builder | React Flow canvas + Temporal runtime | Build |
| AgentFlow | AI playbooks, KB, human takeover/handback, "AI handling" inbox, optimization loop | AI orchestration service + handoff protocol | Build; this is the hardest parity item |
| Broadcasts | Outbound campaign messaging | Campaign service + channel rate limiting | Build |
| Ticketing + CSAT | Ticket lifecycle, satisfaction surveys | ITSM integration (section 5) + CSAT model | Integrate ITSM; Build CSAT |
| Analytics | Conversation and agent analytics | Event pipeline (NATS) + warehouse views | Build |

### 1.2 Voiceflow capabilities

Sources: [Workflows](https://www.voiceflow.com/docs/documentation/build/workflows),
[Build overview](https://www.voiceflow.com/docs/documentation/build/overview),
[Querying the knowledge base](https://www.voiceflow.com/docs/documentation/build/querying-the-knowledge-base),
[V4 migration guide](https://www.voiceflow.com/docs/v4-migration-guide),
[Changelog](https://www.voiceflow.com/docs/changelog/changelog),
[KB API](https://www.voiceflow.com/docs/api-reference/resources/knowledge-base),
[Conversation API](https://www.voiceflow.com/docs/api-reference/resources/conversation),
[Web chat API](https://www.voiceflow.com/docs/documentation/deploy/widget/web-chat-api),
all accessed 2026-11-23. Note `docs.voiceflow.com` redirects to
`www.voiceflow.com/docs`. REA static extraction of the shipped creator bundle
corroborates the feature set via embedded help-link slugs (playbooks,
global-prompt, kb-search, mcp-tool, api-tool, call-forward, secrets,
variables-set, javascript-step, capture, choice, buttons, cards-carousels,
components, logic, message, publishing-environments-backups,
prompts-cms-and-editor, custom-actions, Dialogflow ES and IBM Watson import).

| Capability | Vendor detail | Target | Action |
|---|---|---|---|
| Playbooks (agentic) | V4 agentic flows: playbook, crew, operator steps | AI orchestration service | Build |
| Workflows (deterministic) | Scripted steps: message, card, carousel, buttons, listen | React Flow canvas + Temporal | Build |
| Tools | integration, API, MCP, function steps | Tool gateway + MCP client | Build |
| Logic | set, condition, code, workflow, end, call-forward, handoff | Temporal workflow primitives | Build |
| Knowledge base / RAG | Chunking, metadata filtering, query rewriting, citations, retrieval API | RAG service + vector store | Build; Integrate vector store |
| Intent model shift | V4 dropped explicit intents for RAG-based "Voiceflow Classify"; V3 had intents/entities | RAG-based classification | Build; do not replicate V3 intent engine |
| Variables | User-scoped, optional persistence | Conversation state in PostgreSQL + Redis-class cache | Build |
| Code steps | Sandboxed JavaScript execution | gVisor-isolated sandbox (section 6) | Build; security-critical |
| Human handoff | Includes SIP transfer | Handoff protocol + FreeSWITCH (phase 2) | Build |
| Voice | Native voice + BYO SIP trunk | FreeSWITCH + Kamailio (phase 2) | Integrate |
| Environments | Versioning, traffic splits | Temporal versioning + deployment config | Build |
| SAML SSO | Enterprise-only | Keycloak SAML | Integrate |

### 1.3 Gaps we must own

These are not covered by any chosen FOSS component and are the core of the
custom build:

1. **Unified conversation model and routing.** The thin core that normalizes
   every channel into one conversation/event schema and routes to agent or bot.
   Chatwoot is evaluated as a possible engine versus a reference (section 2.3).
2. **AgentFlow-equivalent AI orchestration with takeover/handback.** The
   bidirectional human-AI control transfer is the highest-risk parity item.
3. **Multi-tenant isolation baked into every layer.** Vendors are multi-tenant
   but we cannot inspect their isolation. Ours must be provable (section 3).
4. **ZA data residency and POPIA cross-border controls.** Not a vendor feature
   we can copy; a hosting and legal design (section 7).
5. **Voice interconnect and numbering.** Requires a licensed partner; not a
   software-only gap (section 7.3).

### 1.4 Explicitly out of scope for parity

- Replicating Voiceflow V3 intent/entity engine. V4 abandoned it; we follow the
  RAG-based direction ([V4 migration guide](https://www.voiceflow.com/docs/v4-migration-guide)).
- Replicating proprietary vendor analytics ML. We build deterministic analytics
  first.

---

## 2. Architecture and TOGAF target state

### 2.1 Option C hybrid: the shape

A custom **thin core** owns the parts that are our differentiation and our
isolation boundary: the conversation model, channel routing, and tenant context.
Everything commodity is an adopted FOSS component with a stable interface.

```
                        +-----------------------------+
   Channels             |        Thin Core            |
   WhatsApp  ---------> |  conversation / routing /   |
   Web chat  ---------> |  tenancy  (custom service)  |
   Email     ---------> |                             |
   Voice(p2) ---------> +--------------+--------------+
                                       |
        +----------+----------+--------+--------+-----------+
        |          |          |        |        |           |
   Keycloak    PostgreSQL   NATS    Temporal  vLLM      SeaweedFS
   (identity)  (+RLS)     JetStream (flow    (open      (object
                          (events)  runtime)  weights)   storage)
        |
   FreeSWITCH + Kamailio (voice, phase 2)

   Agent desktop + flow canvas: React + Carbon + React Flow
```

### 2.2 Component selection and license verification

All licenses verified against GitHub API and raw LICENSE/COPYING files on
2026-11-23. Re-verify before procurement.

| Component | Choice | License | Maintenance note | Source |
|---|---|---|---|---|
| Identity | Keycloak | Apache-2.0 | Active | [keycloak/keycloak](https://github.com/keycloak/keycloak) |
| Flow runtime | Temporal | MIT | Active | [temporalio/temporal](https://github.com/temporalio/temporal) |
| AI inference | vLLM | Apache-2.0 | Active | [vllm-project/vllm](https://github.com/vllm-project/vllm) |
| Event bus | NATS JetStream | Apache-2.0 | Active | [nats-io/nats-server](https://github.com/nats-io/nats-server) |
| Object storage | SeaweedFS | Apache-2.0 | Active | [seaweedfs/seaweedfs](https://github.com/seaweedfs/seaweedfs) |
| Relational store | PostgreSQL + RLS | PostgreSQL License | Active | [postgresql.org](https://www.postgresql.org/) |
| SIP media | FreeSWITCH | MPL-1.1 (debian/ dual MPL-1.1 OR GPL-2+) | Push 2026-11-19 | [signalwire/freeswitch](https://github.com/signalwire/freeswitch) |
| SIP edge | Kamailio | GPL-2.0 (COPYING verified) | Active | [kamailio/kamailio](https://github.com/kamailio/kamailio) |
| Flow canvas | React Flow (xyflow) | MIT | Active | [xyflow/xyflow](https://github.com/xyflow/xyflow) |
| Flow reference | Langflow | MIT | Active; reference only | [langflow-ai/langflow](https://github.com/langflow-ai/langflow) |
| Inbox engine candidate | Chatwoot | MIT core + proprietary `enterprise/` (API NOASSERTION) | Active | [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) |

Excluded components and why (verified 2026-11-23):

| Excluded | License / state | Reason | Source |
|---|---|---|---|
| MinIO | AGPL-3.0, ARCHIVED (last push 2026-04-24) | Archived; AGPL network copyleft incompatible with resold SaaS posture. Use SeaweedFS | [minio/minio](https://github.com/minio/minio) |
| Flowise | Archived, EOL Aug 2026, unpatched critical CVEs | Security and maintenance risk | [FlowiseAI/Flowise](https://github.com/FlowiseAI/Flowise) |
| n8n | Sustainable Use License 1.0 (not OSI) | Restricts resold SaaS use | [n8n-io/n8n](https://github.com/n8n-io/n8n) |
| Botpress | Repo MIT but only SDK/integrations; cloud closed; v12 sunset | Not a usable open engine | [Botpress/botpress](https://github.com/Botpress/botpress) |
| Rasa OSS | Frozen/stale; dev moved to proprietary Pro | Not a viable engine | [RasaHQ/rasa](https://github.com/RasaHQ/rasa) |

License posture rule: prefer Apache-2.0/MIT for anything we link into the
resold SaaS. GPL/MPL components (Kamailio, FreeSWITCH) run as separate processes
over network interfaces, not linked into our code, to keep copyleft boundaries
clean. This is an engineering posture, not legal advice; confirm with counsel.

### 2.3 Chatwoot: engine versus reference

Chatwoot's core is MIT but its `enterprise/` directory is proprietary
([chatwoot/chatwoot](https://github.com/chatwoot/chatwoot), verified 2026-11-23).
Decision: treat Chatwoot as a **reference** for inbox UX and channel-adapter
patterns, not as the engine. Rationale:

- Adopting it as the engine risks depending on features that live only in the
  proprietary `enterprise/` tree, which we cannot lawfully ship in our SaaS.
- Our thin core already owns the conversation model; adopting Chatwoot's model
  would create two competing conversation schemas.
- We reuse its adapter design ideas, not its code path. `[unverified: exact
  feature split between MIT core and enterprise tree; confirm before any code
  reuse]`

### 2.4 TOGAF target state

Mapped to the TOGAF ADM
([The Open Group TOGAF](https://www.opengroup.org/togaf), accessed 2026-11-23).
The four architecture domains:

**Business architecture.** Actors: tenant admin, supervisor, agent, bot editor,
platform operator, auditor, integration service principal. Capabilities:
omnichannel engagement, conversational AI design, AI-assisted and human agent
handling, campaign broadcast, ticketing, analytics. Value stream: inbound
contact -> route -> (bot | agent) -> resolve -> ticket/CSAT -> analytics.

**Data architecture.** Canonical entities: Tenant, User, Contact, Conversation,
Message, Flow, FlowVersion, KnowledgeBase, Document, Chunk, Ticket, Campaign,
AuditEvent. Every tenant-scoped row carries `tenant_id` enforced by PostgreSQL
RLS. Conversation and message are the system of record; analytics are derived
views over the NATS event stream. Object payloads (attachments, recordings,
KB files) live in SeaweedFS keyed by tenant.

**Application architecture.** Thin core (conversation/routing/tenancy), AI
orchestration service, RAG service, tool gateway, campaign service, channel
adapters, agent desktop, flow canvas, identity (Keycloak), flow runtime
(Temporal), inference (vLLM), event bus (NATS), storage (PostgreSQL, SeaweedFS).
Interfaces are explicit contracts; the core never imports a commodity
component's internals.

**Technology architecture.** ZA-hosted Kubernetes. gVisor sandbox for code
steps and untrusted tool execution (section 6). Immutable infrastructure:
nodes and images are replaced, never mutated in place. mTLS between services
(Zero Trust, section 6). PostgreSQL with RLS and per-tenant encryption keys.
Observability stack with tenant-scoped dashboards.

**ADM mapping.**

| ADM phase | How this blueprint satisfies it |
|---|---|
| Preliminary | Scope, locked decisions, evidence base (section 0) |
| A. Architecture Vision | Option C shape, parity goal (sections 1, 2.1) |
| B. Business Architecture | Actors, capabilities, value stream (2.4) |
| C. Data / Application | Entities, services, contracts (2.4) |
| D. Technology | ZA hosting, gVisor, immutable infra, mTLS (2.4) |
| E. Opportunities & Solutions | Component selection, exclusions (2.2, 2.3) |
| F. Migration Planning | Phased roadmap (section 9) |
| G. Implementation Governance | Production standards, test strategy (section 8) |
| H. Change Management | Vendor parity recheck, license re-verify (0.2) |

---

## 3. Security: RBAC, tenant isolation, identity, audit

Baseline: ISO/IEC 27001 Annex A controls A.5 (organizational) and A.8
(technological)
([ISO 27001](https://www.iso.org/iso-27001-information-security.html), accessed
2026-11-23). Control numbering follows ISO/IEC 27001:2022 Annex A.

### 3.1 RBAC least-privilege roles

| Role | Scope | Key permissions | Explicitly denied |
|---|---|---|---|
| Platform operator | Cross-tenant infra | Deploy, infra config, break-glass | Read tenant conversation content by default |
| Tenant admin | One tenant | Users, flows, KB, channels, billing | Other tenants; platform infra |
| Supervisor | One tenant | Queues, agent monitoring, handoff, reports | Flow edit, channel secrets |
| Agent | One tenant | Assigned conversations, reply, CSAT | Flow edit, KB admin, other agents' queues |
| Bot editor | One tenant | Flows, KB, tools, variables | Live conversation content, billing |
| Auditor | One tenant (read-only) | Audit log, config read | Any write |
| Integration service principal | One tenant, scoped | Specific API scopes (section 5) | Interactive login, broad scopes |

Least privilege is enforced at three layers: Keycloak roles/groups, service
authorization middleware, and PostgreSQL RLS. A permission must be granted at
all applicable layers; default deny.

### 3.2 Tenant isolation

- **Row-level:** every tenant-scoped table has `tenant_id`; PostgreSQL RLS
  policies filter on a per-request `tenant_id` set from the authenticated
  context, never from client input.
- **Key-level:** per-tenant encryption keys for sensitive columns and object
  storage; key hierarchy rooted in a KMS. `[unverified: specific KMS product
  choice; select against ZA availability]`
- **Compute-level:** code steps and untrusted tools run in gVisor (section 6);
  no tenant code shares a kernel with another tenant's untrusted code.
- **Network-level:** mTLS service identity; tenant context propagated as a
  signed claim, validated at every hop.
- **Provable:** isolation is tested by automated cross-tenant access attempts
  in CI (section 8.3), not assumed.

### 3.3 Identity: OIDC and SAML

Keycloak is the identity provider
([keycloak/keycloak](https://github.com/keycloak/keycloak)). OIDC for the agent
desktop and APIs; SAML for enterprise tenant federation (parity with Voiceflow
enterprise SAML). Per-tenant realm or group model; decision deferred to phase 1
design `[unverified: realm-per-tenant vs group-per-tenant scale tradeoff;
prototype both]`. MFA enforced for privileged roles.

### 3.4 Privileged-action audit

Every privileged action (role change, flow publish, KB delete, channel secret
rotation, break-glass, cross-tenant access) emits an immutable AuditEvent to an
append-only store. Audit records carry actor, tenant, action, target, timestamp,
and source IP. Break-glass access is time-boxed, alerted, and post-hoc reviewed.
Maps to ISO 27001 A.8.15 (logging) and A.8.16 (monitoring activities).

---

## 4. UI/UX: component choice, WCAG 2.2 AA, keyboard-first

### 4.1 Component library decision

Recommendation: **Carbon Design System**
([carbon-design-system/carbon](https://github.com/carbon-design-system/carbon),
Apache-2.0, verified 2026-11-23). Rationale: explicit WCAG 2.2 AA target and a
keyboard-documented dense DataTable, which is exactly the agent-desktop inbox
pattern we need.

Alternatives assessed (licenses verified 2026-11-23):

| Library | License | A11y / table fit | Source |
|---|---|---|---|
| Carbon (chosen) | Apache-2.0 | Explicit WCAG 2.2 AA target; dense keyboard DataTable | [carbon](https://github.com/carbon-design-system/carbon) |
| PatternFly | MIT | A11y guide; composable Table | [patternfly/patternfly-react](https://github.com/patternfly/patternfly-react) |
| shadcn/ui + Radix | MIT | No table primitive; needs TanStack Table + own grid a11y | [shadcn-ui/ui](https://github.com/shadcn-ui/ui), [radix-ui/primitives](https://github.com/radix-ui/primitives) |
| Mantine | MIT | Basic table | [mantinedev/mantine](https://github.com/mantinedev/mantine) |
| MUI | MIT core | Partial WCAG 2.2 self-assessment (12 components); DataGrid Pro/Premium commercial | [mui/material-ui](https://github.com/mui/material-ui) |

MUI is rejected for the inbox because its advanced DataGrid is commercial and
its WCAG 2.2 self-assessment is partial. shadcn/ui is viable but shifts grid
accessibility work onto us. Carbon gives the densest accessible table with the
least custom a11y work.

### 4.2 WCAG 2.2 AA

Target WCAG 2.2 Level AA
([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), accessed 2026-11-23). New 2.2
criteria that matter for an agent desktop: focus appearance (2.4.11), target
size minimum (2.5.8), dragging alternatives (2.5.7), consistent help (3.2.6).
The inbox must be fully operable by keyboard: navigation, assignment, reply,
handoff, and macro actions all have keyboard paths and visible focus.

### 4.3 Keyboard-first agent desktop

The agent desktop is a keyboard-first application. Every high-frequency action
has a shortcut; shortcuts are discoverable and remappable; no action requires a
mouse. This is both an accessibility requirement and an agent-efficiency
requirement. Flow canvas uses React Flow
([xyflow/xyflow](https://github.com/xyflow/xyflow)) with keyboard node navigation
and connection editing.

---

## 5. Integrations: ERP/CRM, SIP/WebRTC, ITSM

Each integration specifies authentication, retry, and idempotency. These are
trust boundaries; input validation is mandatory and never simplified away.

### 5.1 ERP / CRM

Candidate FOSS targets (licenses verified 2026-11-23):

| System | License | Role | Source |
|---|---|---|---|
| SuiteCRM | AGPL-3.0 | CRM | [salesagility/SuiteCRM](https://github.com/salesagility/SuiteCRM) |
| ERPNext | GPL | ERP | [frappe/erpnext](https://github.com/frappe/erpnext) |
| Odoo (community) | LGPL | ERP | [odoo/odoo](https://github.com/odoo/odoo) |
| Dolibarr | GPL | ERP/CRM | [dolibarr/dolibarr](https://github.com/dolibarr/dolibarr) |
| Frappe Helpdesk | AGPL | Helpdesk | [frappe/helpdesk](https://github.com/frappe/helpdesk) |

AGPL/GPL systems integrate over their HTTP APIs as separate services, not
linked. For customers with existing proprietary ERP/CRM (SAP, Salesforce,
Microsoft Dynamics), we build connectors to their public APIs. `[unverified:
specific customer ERP landscape; discover in phase 1]`

- **Auth:** OAuth2 client-credentials or API key per tenant, stored encrypted,
  scoped least-privilege. Never shared across tenants.
- **Retry:** exponential backoff with jitter; respect `Retry-After`; circuit
  breaker per downstream.
- **Idempotency:** every write carries an idempotency key derived from
  (tenant, conversation, action); downstream upserts keyed on it. Replays are
  safe.

### 5.2 SIP / WebRTC (voice, phase 2)

FreeSWITCH handles media; Kamailio handles SIP edge/registrar
([signalwire/freeswitch](https://github.com/signalwire/freeswitch),
[kamailio/kamailio](https://github.com/kamailio/kamailio)). WebRTC clients
connect over SIP-over-WebSocket (WSS) with DTLS-SRTP.

- **Auth:** SIP digest auth backed by Keycloak-issued credentials; WebRTC
  clients authenticate via OIDC then receive short-lived SIP credentials.
- **Retry:** SIP transaction timers per RFC 3261; re-INVITE on media failure;
  failover to secondary Kamailio.
- **Idempotency:** call control keyed on Call-ID; duplicate INVITE handled by
  the SIP dialog state machine, not by application logic.
- **Numbering / interconnect:** requires a licensed ZA partner (section 7.3).
  This is a regulatory dependency, not a software task.

### 5.3 ITSM (ITIL v4)

Candidate FOSS ITSM (licenses verified 2026-11-23):

| System | License | Note | Source |
|---|---|---|---|
| Zammad | AGPL-3.0 | Modern, active | [zammad/zammad](https://github.com/zammad/zammad) |
| Znuny | GPL-3.0 | OTRS fork, active, small | [znuny/Znuny](https://github.com/znuny/Znuny) |
| GLPI | GPL-3.0 | ITSM + asset mgmt | [glpi-project/glpi](https://github.com/glpi-project/glpi) |

Map conversations to ITIL v4 practices: incident (service interruption),
service request (standard request), and change (flow/KB publish as a controlled
change). ITIL v4 is a framework reference
([PeopleCert ITIL](https://www.peoplecert.org/), accessed 2026-11-23)
`[unverified: exact ITIL 4 practice mapping depth; confirm with service-mgmt
lead]`.

- **Auth:** per-tenant API token, least-privilege, encrypted at rest.
- **Retry:** backoff + jitter; dead-letter queue for failed ticket syncs.
- **Idempotency:** ticket creation keyed on (tenant, conversation, ticket-type);
  updates use optimistic concurrency (version/etag). A conversation maps to at
  most one open ticket of a given type.

---

## 6. AI governance and secure execution

Frameworks: ISO/IEC 42001 (AI management system)
([ISO 42001](https://www.iso.org/standard/81230.html), accessed 2026-11-23)
`[unverified: confirm current ISO 42001 catalog URL before citation in external
docs]`; NIST AI Risk Management Framework
([NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework), accessed
2026-11-23); OWASP Top 10 for LLM Applications
([OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/),
accessed 2026-11-23); ISO/IEC 27090 (AI cybersecurity guidance, under
development) `[unverified: ISO 27090 is a developing standard; confirm status
and number before relying on it]`.

### 6.1 AI governance operating model (ISO 42001 / NIST AI RMF)

- **Govern:** an AI accountability register per tenant flow: model, version,
  data sources, intended use, human-oversight mode. Map to NIST AI RMF
  GOVERN/MAP/MEASURE/MANAGE functions.
- **Map:** context and risk mapping for each AI use (customer-facing bot,
  agent-assist, classification). Identify impact on data subjects.
- **Measure:** evaluation suite for accuracy, hallucination rate, refusal
  correctness, and bias before a flow version is published (section 8.3).
- **Manage:** human takeover/handback is always available; a bot can never
  deny a human escalation path. Risk treatments are logged.

### 6.2 OWASP LLM Top 10 mitigations

| Risk | Mitigation |
|---|---|
| Prompt injection | Untrusted content (customer messages, KB docs, tool output) is never treated as instructions; strict system/user/tool separation; output filtering |
| Insecure output handling | LLM output is data; never executed or rendered as raw HTML; sanitize before display |
| Training data poisoning | KB ingestion is gated, provenance-tracked, and reviewable |
| Model denial of service | Per-tenant rate limits and token budgets on vLLM |
| Supply chain | Pinned model weights and dependencies; provenance checks |
| Sensitive information disclosure | Per-tenant data isolation; PII redaction before any commercial API opt-in |
| Insecure plugin/tool design | Tool gateway enforces least-privilege scopes and input validation |
| Excessive agency | Human approval for high-impact actions; bounded tool autonomy |
| Overreliance | Citations surfaced; confidence and uncertainty shown to agents |
| Model theft | Weights access-controlled; inference endpoints authenticated |

### 6.3 Secure execution: gVisor and Zero Trust

- **gVisor** sandbox ([gVisor](https://gvisor.dev/), accessed 2026-11-23) for
  code steps and untrusted tool execution. Tenant code never shares a kernel
  with another tenant's untrusted code. This is the concrete isolation for
  Voiceflow-style sandboxed JavaScript code steps.
- **Zero Trust** per NIST SP 800-207
  ([NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final), accessed
  2026-11-23): mTLS service identity, no implicit network trust, per-request
  authorization, signed tenant-context claims validated at every hop.
- **Immutable infrastructure:** nodes and container images are replaced, never
  patched in place. Reduces drift and config-based attack surface.

### 6.4 Hybrid AI data path

Default path: tenant data -> self-hosted vLLM (open weights) in ZA. No tenant
data leaves ZA by default. Opt-in path: a tenant may enable a commercial API;
this triggers POPIA s72 cross-border safeguards, a signed DPA, PII redaction,
and an explicit tenant consent record (section 7.1). The opt-in is per-tenant,
audited, and reversible.

---

## 7. Legal and regulatory: POPIA, ECT, ICASA, African region

This section is an engineering planning input. Qualified legal review is
required before reliance.

### 7.1 POPIA (South Africa)

Protection of Personal Information Act 4 of 2013
([Information Regulator SA](https://www.justice.gov.za/inforeg/), accessed
2026-11-23). Engineering implications:

- **Residency:** ZA hosting is the default; personal information stays in ZA
  unless a lawful cross-border basis exists.
- **Section 72 (transborder flows):** a commercial AI API opt-in that sends
  personal information outside ZA requires a lawful basis (adequacy, consent,
  or contractual safeguards). We implement: signed DPA, PII redaction, explicit
  tenant consent record, and an audit trail. `[unverified: exact s72 legal
  basis per destination; counsel must confirm]`
- **Data-subject rights:** access, correction, deletion must be operable per
  tenant; deletion propagates to object storage, vector store, and backups on
  a defined schedule.
- **Security safeguards:** encryption, access control, and breach notification
  align with section 3.

### 7.2 ECT Act

Electronic Communications and Transactions Act 25 of 2002
([gov.za ECT Act](https://www.gov.za/documents/electronic-communications-and-transactions-act),
accessed 2026-11-23). Implications: data-message validity, electronic
signatures, and consumer-protection obligations for the SaaS terms.
`[unverified: specific consumer obligations; counsel review]`

### 7.3 ICASA and voice licensing

Independent Communications Authority of South Africa
([ICASA](https://www.icasa.org.za/), accessed 2026-11-23). Voice service and
numbering require licensing. Engineering plan: partner with a licensed
ECS/ECNS holder for numbering and interconnect rather than obtaining our own
license in phase 2. `[unverified: exact license class required for our voice
model; counsel and partner must confirm]` This is a hard dependency for the
voice phase and must be resolved before voice build starts.

### 7.4 African regional AI and data residency

For expansion beyond ZA, each market has its own data-protection regime.
Planning references (verify per market before entry):

| Market | Regime | Regulator / source |
|---|---|---|
| Nigeria | Nigeria Data Protection Act 2023 | [NDPC](https://ndpc.gov.ng/) |
| Kenya | Data Protection Act 2019 | [ODPC](https://www.odpc.go.ke/) |
| Ghana | Data Protection Act 2012 (Act 843) | [Data Protection Commission](https://www.dataprotection.org.gh/) |
| Egypt | Data Protection Law 151 of 2020 | `[unverified: regulator URL]` |
| AU-wide | Malabo Convention (cyber security & personal data) | [AU Malabo Convention](https://au.int/en/treaties/african-union-convention-cyber-security-and-personal-data-protection) |
| AU-wide | AU Continental AI Strategy (2024) | `[unverified: exact AU URL; confirm before citation]` |

Architecture implication: tenant data residency is a per-tenant attribute, not
a global constant. The thin core carries a residency tag; storage and inference
placement honor it. ZA is the default region; additional regions are added only
with a lawful basis and local hosting.

---

## 8. Production standards, test strategy, telecom frameworks

### 8.1 Production standards

- **SLOs:** per-tenant availability and latency targets defined before GA.
  Inbox message delivery and bot response have explicit latency budgets.
- **Observability:** tenant-scoped metrics, logs, traces; no cross-tenant
  leakage in dashboards. Audit events are immutable (section 3.4).
- **Disaster recovery:** defined RPO/RTO; backups encrypted with per-tenant
  keys; deletion propagates to backups on schedule (section 7.1).
- **Immutable infra and mTLS** per section 6.3.

### 8.2 Test strategy

| Layer | Scope | Gate |
|---|---|---|
| Unit | Thin-core logic, routing, RLS policy helpers, idempotency keys | Every PR |
| Integration | Channel adapters, Temporal flows, Keycloak, ITSM/ERP connectors | Every PR against ephemeral env |
| Security | Cross-tenant access attempts, prompt-injection corpus, sandbox escape probes, authz bypass | Every PR + nightly |
| AI eval | Accuracy, hallucination, refusal, bias per flow version | Before flow publish |
| Load | Per-tenant rate limits, vLLM token budgets, NATS backpressure | Before GA |

### 8.3 Security test specifics

Cross-tenant isolation is tested by automated attempts to read/write another
tenant's rows, objects, and inference context using forged tenant claims. These
must fail closed. Prompt-injection tests feed adversarial customer messages and
KB content and assert the bot does not execute injected instructions. Sandbox
tests assert gVisor confinement for code steps.

### 8.4 Telecom frameworks: TM Forum and 3GPP

- **TM Forum ODA / eTOM / SID**
  ([TM Forum ODA](https://www.tmforum.org/oda/), accessed 2026-11-23). Align our
  service model to ODA component boundaries, eTOM (Business Process Framework)
  for fulfillment/assurance/billing flows, and SID (Information Framework) for
  the canonical entity model. This keeps us interoperable with carrier OSS/BSS
  if we wholesale voice or messaging. `[unverified: depth of TM Forum conformance
  needed; depends on partner model]`
- **3GPP** ([3GPP](https://www.3gpp.org/), accessed 2026-11-23). Relevant if we
  interconnect at the carrier level (SMS, voice). We consume carrier
  interconnect via a licensed partner; we do not implement 3GPP radio/network
  functions. Standards alignment is at the interconnect boundary only.

---

## 9. Phased roadmap, dependencies, acceptance criteria

This is a multi-year program. Phase 1 is bounded and committable; later phases
are scoped but gated on dependencies. Each phase lists hard dependencies and
objective acceptance criteria.

### Phase 0: Foundations (platform and isolation)

- Scope: ZA hosting, Kubernetes, Keycloak, PostgreSQL + RLS, NATS, SeaweedFS,
  CI/CD, observability, immutable infra, mTLS.
- Dependencies: none (greenfield).
- Acceptance: cross-tenant isolation test suite passes; a provisioned tenant can
  authenticate via OIDC; audit log records a privileged action; infra is
  reproducible from code.

### Phase 1: Messaging MVP (bounded, committable)

- Scope: WhatsApp (Meta Cloud API), web chat widget, email adapters; unified
  inbox agent desktop (Carbon, keyboard-first); contacts CRM; basic deterministic
  flows (React Flow + Temporal); CSAT; RBAC roles; SAML for one design partner.
- Dependencies: Phase 0; WhatsApp Business approval; ICASA not required (no
  voice yet).
- Acceptance: a tenant runs WhatsApp + web chat + email end to end; an agent
  handles a conversation keyboard-only; a deterministic flow routes and replies;
  cross-tenant tests pass; WCAG 2.2 AA audit of the inbox passes.

### Phase 2: AI flows and knowledge base

- Scope: RAG service + vector store; KB ingestion with provenance; agentic
  playbooks; AgentFlow-equivalent takeover/handback; gVisor code-step sandbox;
  vLLM open-weights inference; commercial API opt-in with POPIA s72 controls;
  AI eval gate.
- Dependencies: Phase 1; GPU capacity in ZA; AI governance register (section 6).
- Acceptance: a bot answers from KB with citations; human takeover and handback
  work bidirectionally; prompt-injection suite passes; code steps are confined;
  a flow version cannot publish without passing AI eval.

### Phase 3: Voice

- Scope: FreeSWITCH + Kamailio; SIP-over-WSS WebRTC; voice bots; SIP handoff;
  carrier interconnect via licensed partner; numbering.
- Dependencies: Phase 2; **ICASA licensing/partner resolved (hard gate)**;
  licensed ECS/ECNS partner contract.
- Acceptance: an inbound call is answered by a bot, transferred to a human agent
  over SIP, and recorded with consent; call quality meets SLO; numbering is
  lawful.

### Phase 4: Enterprise and ecosystem

- Scope: ITSM integration (ITIL v4), ERP/CRM connectors, broadcasts/campaigns,
  advanced analytics, additional African regions with residency controls.
- Dependencies: Phases 1-3; per-market legal review; customer ERP discovery.
- Acceptance: a conversation creates an idempotent ticket; a campaign respects
  per-channel rate limits and consent; a new region honors residency tags.

### Cross-phase gates

- Vendor parity claims rechecked against live docs before each budget commit.
- Licenses re-verified before each procurement.
- Legal review before each new region and before voice launch.
- No phase starts while its hard dependencies are unresolved.

---

## Appendix A: residual unknowns

Tracked in `evidence/rea-bundle.json`:

- `unk_fa7db1ec080e8ce0ced8e4a4b63d4a974fe1cb0119423de49df0d4c64869aaf2` (high, vendor-parity): vendor feature matrices are from public
  docs/changelogs/static strings captured 2026-11-23; authenticated behavior not
  exercised; recheck live docs before budget.
- `unk_6915b63277dd9bbd616c8239dacb2bbfee90111e7a6a723eac71692a8d1e9a55` (medium, reverse-engineering): full semantic/route graph of
  Voiceflow creator and widget bundles is partial (heap exhaustion and host
  deadline cancellation); static extraction succeeded but is not a complete
  census.

Additional `[unverified]` items are tagged inline where they occur and must be
resolved before the decisions that depend on them.