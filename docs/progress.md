# Progress Log

Claude Code: update this file at the end of every phase/session. Newest entries on top.

## Current status
- Phase: 1 — Scaffold & deploy skeleton: **deployed**; gate waits only on the Qloo key (Qloo ✗ → ✓).
  Phase 0 still waiting on the Qloo key.
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
   ("Agent ✓ · Qloo ✓ · DB ✓" on the public URL) passes. Record a real "ready" capabilities fixture.
2. Run Phase-0 validation; fill `docs/qloo-findings.md`.
3. While waiting: join Discord, get an Anthropic API key (Console billing) for Phase 4.

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
| 2026-10-12 | Pinned mature deps (vitest 5.0.3, zod 4.6.5) instead of bypassing pnpm's minimum-release-age policy | Supply-chain safety | — |

## Done
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
- Render proxy chain: with TRUST_PROXY_HOPS 1 and 2, req.ip is still an internal 10.x address (probe
  2026-10-12), so rate-limit buckets are per proxy node (not spoofable). Before Phase 2's per-IP limits,
  log the raw X-Forwarded-For once and pin the right trust rule (hop count or `uniquelocal` subnets).
- Phase 3 auth: an owner_token cookie set by onrender.com and read from vercel.app is third-party
  (blocked by Safari/Firefox/Brave). Decide before Phase 3: Vercel rewrites proxy (/api/agent/* → Render)
  or a bearer token header. Rewrites change the trusted hop count and CSP.
- Supply chain: harness 0.1.26 is pinned but its deps float on each image build; pin it with a lockfile
  (`npm ci`) and pin `node:22-bookworm-slim` by digest before submission. Pin CI actions to SHAs.
- Render free: 512 MB RAM / 0.1 CPU — watch memory of Node + `qloo mcp` child; first build verifies the Dockerfile (no local Docker).
