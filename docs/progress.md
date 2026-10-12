# Progress Log

Claude Code: update this file at the end of every phase/session. Newest entries on top.

## Current status
- Phase: 1 — Scaffold & deploy skeleton: **deployed**; gate waits only on the Qloo key (Qloo ✗ → ✓).
  Phase 2 — Qloo gateway: **code complete** (key-independent parts); live gate = run the recorder after
  the key. Phase 3a — profiles, owner token, wizard: **code complete**. Phase 3b — confirm matches (Stage 1):
  **skeleton complete** (real flow end to end; live it honestly says "Qloo isn't connected yet"; the
  `qloo_describe` → candidate mapping is provisional until real recordings). Phase 0 still waiting on the
  Qloo key.
- Live URLs: web: https://memory-lane-sable-rho.vercel.app · agent: https://memory-lane-agent.onrender.com
- Repo: https://github.com/designerajitrawat-ux/memory-lane (public; secret scanning + push protection on)
- Hosting: Vercel project `memory-lane` (root `apps/web`), Render Blueprint `memory-lane` → service
  `memory-lane-agent` (free, Virginia), Neon project `memory-lane` (aws-us-east-1, direct connection).

- Monitoring: UptimeRobot "Memory Lane agent - keep-alive (live)" (5 min, `/api/health/live`) +
  "Memory Lane agent - readiness (Qloo + DB)" (1 h, `/api/health`; shows Down until the Qloo key is set).

## Next steps
1. Wait for Qloo key email (requested 2026-10-12; usually within one business day, check spam). Make sure
   `QLOO_BASE_URL` + `QLOO_TRUSTED_BASE_URL` = `https://hackathon.api.qloo.com` are set as persistent
   user env vars, then run `qloo setup --qloo` yourself in a terminal (never paste the key in chat) →
   `qloo setup --status` shows "Qloo data: ready" → reload Claude Code so the `qloo` MCP server
   connects. Add QLOO_API_KEY on Render (Environment tab; you paste it) → the Phase-1 gate
   ("Agent ✓ · Qloo ✓ · DB ✓" on the public URL) passes. Record a real "ready" capabilities fixture
   (harness-local metadata, not Qloo response data, so it may be committed).
2. Phase-2 live gate: `pnpm --filter @memory-lane/agent record` (3 live calls → gitignored
   `test/fixtures/recorded/`; check `git status` stays clean).
3. Phase 3b after the key: record a few `qloo_describe` answers (gitignored), fit
   `stage1/mapDescribe.ts` (fields, type labels, year) and its tests to them, then click the confirm flow
   live.
4. Run Phase-0 validation; fill `docs/qloo-findings.md`. Note: `qloo_recommend`/`qloo_rank` accept a
   free-text `demographic` ("men 25-34") — test an older age band for era fit.
5. While waiting: join Discord, get an Anthropic API key (Console billing) for Phase 4.

## Decisions (ADR-lite)
| Date | Decision | Why | Docs updated |
|---|---|---|---|
| 2026-10-12 | Idea: Memory Lane (reminiscence sessions for memory loss) | New vertical for Qloo, clear Qloo-vs-LLM difference, real paying audience | all |
| 2026-10-12 | Stack: Next.js + Fastify agent container + qloo mcp + Claude API + Postgres | Kit: MCP needs long-lived process, no serverless | 04 |
| 2026-10-12 | Solo build: one developer + Claude Code (no team) | Kit assumed a team; only one Qloo key, no role split, sequential phases | 08, 09, 10, START_HERE |
| 2026-10-12 | Phase 1 started before the Phase-0 gate | Qloo key may take days; scaffold is persona-independent. Persona/data work stays gated on Phase 0 | progress |
| 2026-10-12 | Hosting: Vercel (web) + Render free (agent, Docker) + Neon free (DB), all US East; UptimeRobot 5-min ping keeps Render awake | All free; Render free sleeps after 15 min idle, the uptime monitor we need anyway prevents that (750 h/month covers 24/7) | 04, 08 |
| 2026-10-12 | Health split: `/api/health/live` (always 200, Render health check) + `/api/health` (readiness, 503 when degraded) | Deploys must succeed while the key/DB are missing; readiness stays honest | 04 |
| 2026-10-12 | Agent built with tsup into one self-contained `dist/server.cjs`; no Turborepo | Runtime image needs only Node + harness; fewer moving parts | 04 |
| 2026-10-12 | Qloo readiness = `qloo_capabilities` → `adapter.ready` (false without a credential) | Verified against harness 0.1.26 locally; no Qloo API call, no quota | 04 |
| 2026-10-12 | Set `QLOO_BASE_URL` / `QLOO_TRUSTED_BASE_URL` = hackathon API in `.env.example`, `render.yaml`, `.mcp.json` | Qloo kickoff email: hackathon keys only work against `hackathon.api.qloo.com`; harness default is `api.qloo.com` | 03, README |
| 2026-10-12 | Qloo harness child gets an allow-listed env (QLOO_API_KEY, QLOO_HOME, QLOO_BASE_URL, QLOO_TRUSTED_BASE_URL) instead of process.env | security-reviewer: harness is third-party and bundles an LLM agent runtime; DATABASE_URL / ANTHROPIC_API_KEY must not reach it | 03 |
| 2026-10-12 | Keep-alive ping on `/api/health/live`; readiness check only hourly | Neon free ≈ 100 CU-h/month; a 5-min DB ping would keep compute on 24/7 | 04 |
| 2026-10-12 | Deployed: Vercel `memory-lane` + Render Blueprint `memory-lane` + Neon `memory-lane`; Neon direct (unpooled) connection; strip `channel_binding` from DATABASE_URL | Long-lived single agent process; postgres.js forwards unknown URL params to the server | 04 |
| 2026-10-12 | Never commit real Qloo responses: committed tests use synthetic envelopes; recordings go to gitignored `apps/agent/test/fixtures/recorded/`; README example shows request shape + entity names only | Qloo developer guide: "do not store Qloo response data in a public repository"; our repo is public | CLAUDE.md, 03, 04, 05, 08, 09, 10, README |
| 2026-10-12 | Gateway order: allow-list → strict args → PII guard → cache → limits → MCP (≤2 retries, only `retryable`) → evidence; rejections create no evidence; errors never cached | One choke point for rule 4/6; harness validates args only after the credential check | 03 |
| 2026-10-12 | Tests: fake MCP under the real gateway (`fixtureMcp.ts`) + store SQL on PGlite with real migrations; migrations applied by the agent at startup | Exercises the real code path without a key, Docker or Neon; no manual DB steps on deploy | 04, 05, 08 |
| 2026-10-12 | Owner token = random bearer token (sha256 in DB, localStorage on the device) instead of an httpOnly cookie | Agent and web are different sites; an agent cookie would be third-party and blocked by Safari/Firefox/Brave | 04, 07 |
| 2026-10-12 | Client IP for rate limits from `cf-connecting-ip` (CLIENT_IP_HEADER), not hop counting | Probes: Cloudflare overwrites it and 403s client-sent values; the free tier adds an in-container proxy so hop counts depend on the plan | 04, render.yaml |
| 2026-10-12 | Phase 3 split: 3a (profiles, wizard) now; Stage 1 seed resolution after the key + Phase 0 | The real Qloo result shape and data quality decide the resolve/confirm design | 08 |
| 2026-10-12 | Profile text uses the Qloo guard's PII patterns (moved to packages/shared/src/pii.ts); avoid "why" returned to owners only; limits 20/owner, 200/day, IPv6 per /64; 90-day retention purge; "Forget profiles on this device" | security-reviewer W1–W4 | 04, 07 |
| 2026-10-12 | Wizard: Enter moves to the next step (never saves early), Back = previous step, draft kept in sessionStorage, field borders 3:1 (`--field-border`), plain year messages | ux-reviewer C1–C4, W1–W9 | 06 |
| 2026-10-12 | Favourites 1–10 (spec said 1–5) | Some caregivers know more; 10 keeps Qloo calls bounded | 01 |
| 2026-10-12 | Phase 3b built as the real flow before the key: no-key → honest "Qloo isn't connected yet" banner, seeds stay pending; synthetic candidates only in dev fixture mode (refused in production) | Rules 2/3: no fake or LLM-only content; the mapping from `qloo_describe` is the only provisional piece | 04, 05, 06, README |
| 2026-10-12 | Caregiver confirms every seed, single matches included (preselected, not auto-confirmed) | A person stays in the loop for every seed (US3); stricter than the old "single clear match" | 05, 06 |
| 2026-10-12 | Candidates stored server-side (`seed_candidates`, evidence_id NOT NULL); confirm accepts only stored candidate ids | Clients can't inject entity ids; every confirmed seed carries Qloo evidence | 04, 05 |
| 2026-10-12 | `qloo_calls.profile_id` with ON DELETE CASCADE | "Delete this profile" also removes its Qloo call records (security review S7) | 04, 07 |
| 2026-10-12 | Stage 1 streams SSE over a POST fetch; fixed user text per outcome | EventSource can't POST or send the bearer header; harness `summary`/`recovery` never reach the browser (S10) | 04 |
| 2026-10-12 | Stage 1 quota guards: one run per profile (409), lookups per device token (50/day) and per client IP (100/day), Stage 1 keeps 100 of the 500 daily units for demos, stop at the first failed lookup | security-reviewer W1/W2: 6 parallel runs made 18 live calls for 3 seeds; an outage run could cost 3 units per seed | 04, 05, 07 |
| 2026-10-12 | Seed `note` column (fixed reasons) + DB CHECKs (status, note, confirmed ⇒ evidence) + evidence FKs; Stage 1 writes guarded on `pending`; candidates deleted after a choice | ux-reviewer C2 (personal-info note was replaced by "not found"); security-reviewer W3 + S5/S11 | 04, 05 |
| 2026-10-12 | Confirm screen: focus moves to the choices after a run; focused banners are not live regions; stale choices refresh on 409; Check is secondary while choices wait | ux-reviewer C1, W1–W9 | 06 |
| 2026-10-12 | Dev-only `QLOO_FIXTURE_DIR` + `DATABASE_URL=pglite:memory` (`dev:fixtures`), both refused in production; PGlite kept external to the bundle | Click through the whole flow locally without secrets, Docker or Neon | 04, README |
| 2026-10-12 | Pinned mature deps (vitest 5.0.3, zod 4.6.5) instead of bypassing pnpm's minimum-release-age policy | Supply-chain safety | — |

## Done
- 2026-10-12: **Phase 3b skeleton complete.** Shared resolve schemas (`needs_input`, candidates, SSE events,
  confirm request), migration 0003 (`seed_candidates`, `qloo_calls.profile_id` cascade), Stage 1
  resolver over the gateway (`qloo_describe` only), owner-only routes (GET seeds, SSE resolve, confirm),
  confirm screen + status chips, `dev:fixtures` mode. Local Chrome check: fixture mode → log → candidates
  → save → "Confirmed with Qloo" / "Not used"; no-key mode → "Qloo isn't connected yet", focus on the
  alert, seeds stay pending, no profile text in agent logs. Fixed: "Add another favourite" focused the
  Type select, so typing changed it; it now focuses the name. ux-reviewer (2 Critical, 9 Warnings) and
  security-reviewer (0 Critical, 3 Warnings) findings fixed, plus most suggestions.
- 2026-10-12: **Phase 3a code complete.** Profiles (create/list/get/delete), bearer owner token (sha256 in
  DB), cf-connecting-ip client key, 4-step wizard + profile page + list, shared PII patterns for profile
  text, profile limits + 90-day retention purge. ux-reviewer (4 Critical) and security-reviewer (0 Critical,
  4 Warnings) findings fixed. 108 tests green (82 agent incl. PGlite routes, 14 shared, 12 web). Live
  check on Vercel+Render: create → list → delete works; Enter moves steps; Back keeps answers; health
  terms refused. Found live: typing before hydration was wiped, so the form now renders after hydration.
- 2026-10-12: **Phase 2 code complete (no key needed).** Gateway `call()` with allow-list, strict arg
  schemas mirrored from `qloo_capabilities`, PII guard, Postgres cache/evidence/budget stores (+ in-memory
  for dev), per-profile limiter, bounded retries, honest error/quota results, health `quota_exhausted`,
  drizzle schema + startup migrations, fixture MCP + synthetic envelopes, real harness QLOO_AUTH fixture,
  recorder script. Bundle verified: finds `drizzle/`, survives an unreachable DB (logs code only).
  security-reviewer: no Critical; fixed W1–W5 + most suggestions (Unicode-normalised PII guard with
  nickname parts/prefixes, postcodes/streets, any-script digits, stem-tolerant health terms, age-band-only
  `demographic`; required `nickname`; retries charged to the budget, timeouts not retried; recorder
  path pinned + `git check-ignore` guard, `**/fixtures/recorded/` ignored in git/Docker + CI check; log
  serializer drops SQL params; store errors → honest `unavailable`; cache re-validation; complete-only
  persistent cache; `args_checked` rename; DATABASE_URL required in prod; migration failure shown in
  health). 75 tests green (66 agent incl. PGlite).
- 2026-10-12: **Phase 1 code complete locally.** pnpm monorepo (`apps/web` Next.js 16.4 + Tailwind 4 +
  shadcn, `apps/agent` Fastify 5 + MCP client + gateway + postgres/drizzle, `packages/shared` zod
  `HealthResponseSchema`), CI workflow, agent Dockerfile, `render.yaml`, README stub, MIT LICENSE.
  typecheck/lint/test (31 tests)/build green. Verified: bundled agent runs without node_modules; real
  `qloo mcp` spawn → health reports `no_credential`; web status strip renders honest states, no
  CSP/CORS console errors. ux-reviewer + security-reviewer findings fixed (focus handling, screen-reader
  labels, focus ring/hover contrast; harness env allow-list, DB TLS verify-full, 5xx error handler,
  nested .dockerignore, WEB_ORIGIN validation, readiness cache, CORS tightened, COOP, no X-Powered-By).
- 2026-10-12: Joined hackathon on Devpost; submitted Qloo API key request form; installed
  `@qloo/qloo-harness` 0.1.26 globally (Node v25.8.2).
- 2026-10-12: Planning docs kit created.

## Open questions / risks
- Does Qloo support decade/age signals well enough for era fit? (Phase 0)
- Coverage of older Indian content? (Phase 0)
- Anthropic API budget for live app.
- Before/with Phase 4 routes (security review W6, S4, S6; S7 evidence cascade and S10 fixed text done in 3b): per-IP + per-owner-token limits on every
  route that reaches the gateway and a cap on profile creation; per-stage call caps (docs/05); reuse one
  evidence id per (session, cacheKey) instead of a row per cache hit; `persistent` set server-side only;
  pre-warm demo caches; purge expired cache / old evidence rows and link evidence to profile/session with
  cascading delete ("Delete this profile"); map harness error codes to fixed user text (never forward
  harness `summary`/`recovery` to the browser or Claude); consider `pg_advisory_lock` around migrations.
- Judge path: landing has no "Try a demo profile" yet (US1, docs/06 §1.6) — arrives with demo personas (Phase 8).
  Then also: link "Try a demo profile" from the confirm screen's no-key/quota banners, and seed demo
  personas with `confirmed` seeds (else judges see "Not checked yet" with no action).
- Phase 4: refuse to confirm a seed whose Qloo entity is on the profile's avoid-list (rule 9), once avoid
  items are resolved to entities.
- Stage 1 allowances live in memory (single Render instance); a restart resets them. The global daily
  budget (Postgres) still holds.
- CSP still has script-src 'unsafe-inline' (Next static shell); the localStorage token makes XSS costly,
  so `react/no-danger` is enforced. Consider nonce-based CSP before submission.
- Evidence rows (qloo_calls) are not purged yet: Phase 4 links them to sessions; then purge unreferenced
  rows and note Neon's point-in-time history window publicly.
- Owner token lives in one browser: clearing site data or switching devices loses access to those
  profiles (stated in the UI). A "transfer to another device" link could come later.
- Supply chain: harness 0.1.26 is pinned but its deps float on each image build; pin it with a lockfile
  (`npm ci`) and pin `node:22-bookworm-slim` by digest before submission. Pin CI actions to SHAs.
- Render free: 512 MB RAM / 0.1 CPU — watch memory of Node + `qloo mcp` child; first build verifies the Dockerfile (no local Docker).
