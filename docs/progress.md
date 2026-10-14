# Progress Log

Claude Code: update this file at the end of every phase/session. Newest entries on top.

## Current status
- **Phase 0 — done** (2026-10-13): key works, persona gate passes (docs/qloo-findings.md).
- **Phase 1 — gate passed**: live health shows Agent ✓ · Qloo ✓ · DB ✓.
- **Phase 2 — gate passed**: recorder made live calls into the gitignored folder; tests on synthetic
  envelopes; no Qloo data committed.
- **Phase 3 — done**: wizard → Stage 1 confirm with real Qloo (describe for singers/films/TV/places,
  find_tags for food/other; needs_input choices; one option per place listing).
- **Phase 4 — Qloo pipeline done, LLM step pending the Anthropic key**: Stage 2 builds a Life Taste Profile
  from confirmed seed IDs (music, films/TV in era, places, food) with evidence on every item, avoid-list +
  gentle filters, validators; screen 5 with evidence drawer. Checked live on all three personas.
- **Phase 5 — done (code templates; LLM prompts pending the key)**: Stage 3 composer + validators, sessions
  and reactions API, plan / player / summary screens. Checked locally end to end with real Qloo data.
- **Phase 6 — done**: Stage 4 learning loop (weights, learned neighbours from Qloo, learned avoid-list,
  "what changed"); gate test passes; live check (UK persona): two era-fitting singers learned from the favourite that landed.
- **Phase 7 — how-it-works done**; compare view waits for the Anthropic key (baseline = same model, no tools).
- **Phase 8 — demo personas + landing done**: three fictional personas seeded through the real pipeline at
  startup (public, read-only), `/demo` picker, new landing, demo banners and read-only screens. Live check
  (local, real Qloo): e.g. the India persona's session 2 learned two era singers and two 1960s–70s films.
- Next: Phase 7–9. **Blocking for the LLM steps (proposing
  era candidates, session prompts, "what changed" text, compare view): an Anthropic API key** — the
  developer creates it in the Anthropic Console (billing) and pastes it on Render (ANTHROPIC_API_KEY).
- Live URLs: web: https://memory-lane-sable-rho.vercel.app · agent: https://memory-lane-agent.onrender.com
- Repo: https://github.com/designerajitrawat-ux/memory-lane (public; secret scanning + push protection on)
- Hosting: Vercel project `memory-lane` (root `apps/web`), Render Blueprint `memory-lane` → service
  `memory-lane-agent` (free, Virginia), Neon project `memory-lane` (aws-us-east-1, direct connection).
- Monitoring: UptimeRobot "Memory Lane agent - keep-alive (live)" (5 min, `/api/health/live`) +
  "Memory Lane agent - readiness (Qloo + DB)" (1 h, `/api/health`).
- Local Qloo setup: key = Windows user env var `QLOO_API_KEY` (harness reports source "environment");
  use `qloo.cmd` in PowerShell (the .ps1 shim is blocked by the execution policy).

## Next steps
1. Submit on Devpost by Oct 29 IST (text ready in docs/devpost.md; screenshots in docs/screenshots/).
2. Developer adds `LLM_API_KEY` (OpenAI) on Render; then bump `DEMO_VERSION` so the demos are rebuilt
   with the LLM's prompts and gap filling (the compare view's generic plans warm by themselves).
3. Keep the app live and free through Nov 17 (UptimeRobot monitors on); re-run the reviewers after
   any larger change; bump `DEMO_VERSION` when research or session logic changes.

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
| 2026-10-13 | Qloo key as a Windows user env var (`QLOO_API_KEY`), not the harness's hidden prompt | The developer couldn't use `qloo setup --qloo` (PowerShell blocks qloo.ps1; the open terminal lacked the new URL vars, so the key was checked against api.qloo.com and rejected) | progress |
| 2026-10-13 | Stage 1 food/other via `qloo_find_tags`; describe candidates = selected + same-name alternatives (all same-type alternatives for places and non-exact matches); needs_input choices from `resolution.issues`, one option per place listing | Real recordings and live checks (WALL·E noise, "Butter chicken" → restaurant, five listings of one shrine) | 05 |
| 2026-10-13 | PII guard exempts exact Qloo IDs (UUIDs, tag URNs) in ID fields | Stage 2 sends confirmed seed IDs; a UUID's digits matched the phone rule | 03 |
| 2026-10-13 | Stage 2 = fixed 5-call Qloo plan + code era/avoid/gentle filters + validators; LLM proposals added when the key exists | Phase 0: no era filter in Qloo; deterministic plan is demo-safe and explainable; works before the Anthropic key | 05 |
| 2026-10-13 | Places kept by the opening words of Qloo's description (landmarks yes, hotels/bars no) + same-country rule | Live: hotels, banquet halls, a spa and a landmark across the border came back for an Indian town | 05 |
| 2026-10-13 | Avoid-list reads Qloo's full description, with related words for well-known painful topics; gentle filter for atrocities/suicide/abuse | Live: a border-ceremony landmark passed a "Partition" avoid; a Holocaust drama came back | 05, 07 |
| 2026-10-13 | Gateway runs ≤3 live calls at once | Phase 0: bursts of 8 hit a 429 | 03 |
| 2026-10-14 | Sessions planned in code from the taste profile (template + rotation + gentle prompt templates), plain JSON route; LLM prompts later through the same validators | Works before the Anthropic key; no Qloo call needed (the profile carries the evidence) | 04, 05, 06 |
| 2026-10-14 | PII guard: only server-vouched confirmed-seed UUIDs are exempt, in `signals` only; health terms bounded by letters (not ); Latin accents folded; places refuse street names | security-reviewer W1, W5, S1, S9 | 03, 07 |
| 2026-10-14 | Stage 2 never saves when every Qloo call failed or the allowance is used up (honest error, current version stays); avoid-list also checks captions/"because of" and keeps avoided favourites out of the signals; multi-word avoid entries need all their words | security-reviewer W3, W4; ux-reviewer C3, W2 | 05 |
| 2026-10-14 | Taste profile UX: badges stacked above names, "Found by Qloo" tag, summary "N favourites you confirmed, M more found by Qloo", partial chip, evidence drawer retry + plain status words, dialogs scroll / bottom sheet on phones | ux-reviewer C1, C2, W4–W11 | 06 |
| 2026-10-14 | Stage 4 runs when the next session is planned (not on "finish"), learned items become a new taste profile version (`source: "learned"`), distressed items join the avoid-list | One place to learn and plan; the profile visibly evolves; avoid-list learning also protects future builds | 05, 04 |
| 2026-10-14 | Demo personas seeded through the real pipeline at startup (SEED_DEMOS, default on in production), public read-only; demo players don't save reactions | The judge path needs ready profiles and sessions; using the real stages keeps it honest and grounded | 04, 06, 11 |
| 2026-10-14 | Stage 2 asks each domain with its own favourites, places twice (from tastes and from loved places), dishes for town + region with dish-only filters | Live: all favourites together gave a UK persona American dramas; music signals found a town's famous music venues; food tags were mostly restaurant styles | 05 |
| 2026-10-14 | Stage 4 uses `qloo_rank` to order what is still to play against what landed (Qloo decides the next session's order; rank call joins the item's evidence) | Judge review: give Qloo a real decision role in the learning loop | 03, 05 |
| 2026-10-14 | Build steps saved with each taste profile ("How Memory Lane built this"); evidence API returns names for the ids sent and Qloo's result names | Make the agent's work visible; richer evidence drawer | 04, 06 |
| 2026-10-14 | "Try it yourself": private copy of a demo persona (first taste profile + copied evidence rows), session 1 ready | Lets judges run the learning loop live without building a profile | 04, 06, 07 |
| 2026-10-14 | Demo personas versioned (`DEMO_VERSION`), complete-only listing, stale half-built rebuild, unique demo index; older versions removed after the new one is complete | Security review W2/UX W15: restarts and overlapping deploys left broken or duplicate demos | 04, 07 |
| 2026-10-15 | LLM steps on any OpenAI-compatible API (default OpenAI `gpt-6-luna`), not the Anthropic SDK: compare view, Stage 2 gap filling (LLM proposes, `qloo_rank` decides, code checks years), warmer Stage 3 prompts; cached by input hash, daily cap, off without a key | The developer has OpenAI API credit; the hackathon allows any model; gpt-6-luna is cheap ($0.10/$0.50 per 1M) with structured outputs | 04, 05, 07, CLAUDE.md |
| 2026-10-14 | Qloo's rank alone orders ranked items; each domain ranked against its own hits; Stage 2 asks again when <3 films fit; the log names what was left out | Judge re-score 7.9: the "what changed" text must match the plan; show the agent adapting and its reasons | 05 |
| 2026-10-14 | Player saves one at a time per item with the merged wanted state; a reaction never erases a note (server keeps the note when none is sent) | UX re-review C1: note lost on a natural flow; out-of-order writes could undo "Seemed upset" | 04, 06 |
| 2026-10-14 | An untouched newest session is returned instead of planning again; ≤50 sessions per profile; notes refuse personal/health details | Security review W1/W3 | 04, 07 |
| 2026-10-12 | Pinned mature deps (vitest 5.0.3, zod 4.6.5) instead of bypassing pnpm's minimum-release-age policy | Supply-chain safety | — |

## Done
- 2026-10-15: **LLM steps (Phase 7 compare + Phase 4/5 LLM parts).** `llm/client.ts` (OpenAI-compatible,
  structured outputs, guard, cache, daily cap), `/api/profiles/:id/compare` + screen 9, Stage 2 gap
  filling with `qloo_rank` on named options, warmer prompts with validators, demos' generic plans
  warmed at seeding. Agent 157 tests.
- 2026-10-14: **Phase 9 round 2** (judge 7.9, security: no criticals, UX: 1 critical). Rank-led session
  order, per-domain ranking, Stage 2 second look and named exclusions, lodging filter, town-first place
  prompts; try-it idempotent with cleanup and a shared rate bucket; rank evidence replaced; player save
  queue with drafts, unsaved list, offline notice; 4xx agent messages, longer planning timeouts with
  progress lines, Safari-safe timeouts; GitHub About homepage + topics fixed.
- 2026-10-14: **Phase 9 hardening round 1 (judge 7.25/10, UX and security reviews).** Agent: per-domain
  Stage 2 signals, two place calls, town + region food with dish filters, medical/horror screen filter,
  lasting-place rules, map links with the town, decade in song searches, possessive fix, link path
  allow-list, `qloo_rank` in Stage 4 with rank evidence, saved build steps, evidence names/results,
  session reuse + cap, note PII check, demo guards, versioned/robust demo seeding, "try it yourself"
  copies. Web: evidence chips on session items, player rework (wrapping sticky nav, save races, retry,
  notes on blur, demo end card, a11y), plan print + top Start, demo-first taste page with build log,
  demo picker polling and direct session link, request timeout + slow notes, GitHub link. Agent 151 tests.
- 2026-10-14: **Phases 7 (how it works) + 8 (demos, landing).** `demo/` (personas, seeder), read access for
  demos, `planNextSession` shared by route and seeder, `/demo`, `/how-it-works`, new landing, footer
  links, demo banners. Agent 140 tests.
- 2026-10-14: **Phase 6 done.** `stage4/adapt.ts` + session route integration (allowance + lock), learned
  avoid items, learned taste items with badges, "what changed" on the plan screen. Gate test: "sang"
  shifts session 2 toward Qloo neighbours, "distressed" never returns. Agent 139 tests.
- 2026-10-14: **Phase 5 + review fixes.** Stage 3 (`stage3/`: compose, prompts, links, validate, store,
  routes), migration 0006 (`sessions`, `session_items`), screens 6–8; security W1–W5 and most suggestions
  (trusted seed ids, avoid gaps, honest allowance, health/accents/street rules, lock + semaphore, version
  pruning, orphan evidence purge); UX C1–C3 and W1–W11. Agent 138 tests, shared 15, web 14.
- 2026-10-13: **Phase 0 done, Phase 1/2 gates passed, Stage 1 on real Qloo, Phase 4 Qloo pipeline.** Key set up
  locally (env var) and on Render; live health Agent ✓ · Qloo ✓ · DB ✓. qloo-data-scout validation
  (persona gate passes). Stage 1 candidates pinned against recordings. Stage 2: `stage2/` (era, avoid,
  language, validators, store, build, routes), migration 0005 (`taste_profiles`, seed year/description),
  shared allowance + run lock across research routes, evidence endpoint; screen 5 with evidence drawer.
  Tests: agent 125+, shared 14, web 14. Live-checked all three personas against real Qloo.
- 2026-10-12: **Phase 3b skeleton complete.** Shared resolve schemas (`needs_input`, candidates, SSE events,
  confirm request), migration 0003 (`seed_candidates`, `qloo_calls.profile_id` cascade), Stage 1
  resolver over the gateway (`qloo_describe` only), owner-only routes (GET seeds, SSE resolve, confirm),
  confirm screen + status chips, `dev:fixtures` mode. Local Chrome check: fixture mode → log → candidates
  → save → "Confirmed with Qloo" / "Not used"; no-key mode → "Qloo isn't connected yet", focus on the
  alert, seeds stay pending, no profile text in agent logs. Fixed: "Add another favourite" focused the
  Type select, so typing changed it; it now focuses the name. ux-reviewer (2 Critical, 9 Warnings) and
  security-reviewer (0 Critical, 3 Warnings) findings fixed, plus most suggestions.
  128 tests green (100 agent, 14 shared, 14 web). Deployed (867f69f, 7a32266): CI green, Render
  applied migration 0003 on Neon (health DB ok), live check on Vercel+Render: "Check 1 favourite" →
  focused "Qloo isn't connected yet" banner, seed stays pending. One synthetic test profile (no
  nickname, favourite "Mohammed Rafi") is left on the live DB; the 90-day purge removes it.
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
