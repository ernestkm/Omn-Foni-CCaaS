# Static extraction notes (analyst observations)

Access date: 2026-11-23. These are bounded string/host extractions from publicly
shipped JavaScript, performed with `grep` over downloaded bytes. They are analyst
observations, not REA semantic-graph results. REA full-graph analysis of both
bundles is partial (see `rea-bundle.json`, unknowns `unk_6915b6...` and
`unk_fa7db1...`). Static strings do not prove runtime execution or reachability.

## Artifacts

| Artifact | URL | SHA-256 | Bytes |
|---|---|---|---|
| Voiceflow creator main bundle | https://creator.voiceflow.com/assets/index-BCILlEtz.js | `bb568e7ad04978dd0b59568ecb22d88dbeb541a33af5c85ab65a6fa746b73cb4` | 17,947,005 |
| Voiceflow chat widget | https://cdn.voiceflow.com/widget-next/bundle.mjs | `69740b9b4cc63c1893cf92b4395cdfb32312538bdf0354ac47bf59152d483bd3` | 1,817,227 |

Widget banner: `Voiceflow @voiceflow/chat 2.211.0`.

## Voiceflow service hosts (creator bundle string literals)

- `https://general-runtime.voiceflow.com` (conversation runtime)
- `https://identity-api.voiceflow.com`
- `https://realtime-api.voiceflow.com`
- `https://general-service.voiceflow.com`
- `https://auth-api.voiceflow.com`
- `https://google-service.voiceflow.com`
- `https://alexa-service.voiceflow.com`
- `https://canvas-export.voiceflow.app`
- `https://cdn.voiceflow.com/voice-catalog/v1` (voice catalog)
- TTS sample paths: `cdn.voiceflow.com/samples/tts/{cartesia,rimelabs,soniox}/`
- `https://www.twilio.com/console` link present (BYO telephony pointer)

## Voiceflow widget runtime surface (widget bundle string literals)

- `/v4/interact/socket` (WebSocket interaction endpoint)
- `/v1/uploads/file`
- `/v1/handoff/file`
- Default runtime host literal: `https://general-runtime.voiceflow.com`
- Message/event type literals observed: `text`, `audio`, `video`, `carousel`,
  `card`, `visual`, `handoff`, `end`, `trace`, `debug`, `agent_typing`,
  `agent-start`, `audio-preference`.

## Creator help-link slugs (feature corroboration, not behavior proof)

Embedded docs links reference: playbooks, global-prompt, kb-search, mcp-tool,
api-tool, call-forward, secrets, variables-set, javascript-step, capture, choice,
buttons, cards-carousels, components, logic, message,
publishing-environments-backups, prompts-cms-and-editor, custom-actions,
importing-exporting (Dialogflow ES and IBM Watson import articles).

## Limits

- No authenticated surface was loaded; Sleekflow app redirects to
  `sso.sleekflow.io` (Auth0-style universal login) and `app.sleekflow.io` returns a
  Vercel Security Checkpoint to non-browser clients. Sleekflow app bundle is
  therefore unobserved.
- Voiceflow creator `/start` is an onboarding/login shell; the 17.9MB main bundle
  is publicly shipped but its full module/route graph was not completed by REA.
- String-built routes, encrypted config, and server-side behavior remain unknown.