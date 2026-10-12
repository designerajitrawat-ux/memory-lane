# 04 · Architecture & Tech Stack

## 1. System diagram
```mermaid
flowchart LR
  U[Caregiver / Judge<br/>browser, phone] -->|HTTPS| W[apps/web<br/>Next.js on Vercel]
  W -->|REST + SSE<br/>/api/*| A[apps/agent<br/>Node 22 + Fastify<br/>Render Docker container]
  A -->|Messages API<br/>tool use| C[Claude API<br/>claude-sonnet-5-5]
  A -->|stdio MCP| Q[qloo mcp<br/>@qloo/qloo-harness<br/>child process]
  Q -->|HTTPS + QLOO_API_KEY| QA[(Qloo API)]
  A --> DB[(Postgres<br/>Neon)]
```
- Browser **never** talks to Qloo or Claude directly. Keys live only in the agent container.
- Frontend calls agent service via `NEXT_PUBLIC_AGENT_URL`; agent restricts CORS to the web origin.

## 2. Tech stack (use latest stable versions at scaffold time; pin in lockfile)
| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces (plain `pnpm -r` scripts, no Turborepo) | shared types, one repo for judges |
| Language | TypeScript strict everywhere | fewer bugs, shared types |
| Frontend | Next.js (App Router), React, Tailwind CSS, shadcn/ui (Radix), lucide icons | fast, accessible components |
| Forms/validation | react-hook-form + zod | shared zod schemas with backend |
| Data fetching | TanStack Query + native EventSource for SSE | streaming agent progress |
| Backend | Node ≥ 22.19, Fastify, zod; built with tsup into one self-contained `dist/server.cjs` | light, fast, long-lived process for MCP; tiny runtime image |
| Qloo | `@qloo/qloo-harness` (global in container) + `@modelcontextprotocol/sdk` client | official route |
| LLM | `@anthropic-ai/sdk`, model `claude-sonnet-5-5` (cost/speed); optionally `claude-opus-5-5` for compose step | strong tool use |
| DB | Postgres + Drizzle ORM + drizzle-kit migrations | simple, typed |
| Cache | Postgres table `qloo_cache` (no Redis needed) | fewer moving parts |
| Rate limit | `@fastify/rate-limit` + DB daily budget counter | quota safety |
| Testing | Vitest (unit), recorded Qloo fixtures, Playwright (2–3 e2e smoke flows) | reliability |
| Lint/format | ESLint + Prettier | consistency |
| CI | GitHub Actions: typecheck, lint, test | judges see quality |
| Hosting | Vercel (web), **Render free** (agent, `apps/agent/Dockerfile` via `render.yaml`), **Neon free** (DB); all US East | MCP needs a container; all free. Render free sleeps after 15 min idle → UptimeRobot 5-min keep-alive on `/api/health/live` (750 free h/month covers 24/7; touches no DB). Readiness monitor on `/api/health` only **hourly**, because Neon free has ~100 CU-h/month and a 5-min DB ping would keep it awake 24/7 |
| Observability | pino logs (redacted), simple `/api/health` | debugging |

**Note:** Claude Code Max plan pays for *building* with Claude Code. The deployed app's own LLM
calls need a separate **Anthropic API key** (Console billing). Budget it; cache aggressively.

## 3. Repo layout
```
memory-lane/
├─ CLAUDE.md                  # master rules for Claude Code
├─ README.md                  # judge-facing (template in docs/10)
├─ LICENSE                    # MIT
├─ .mcp.json                  # Claude Code dev access to `qloo mcp` (no secrets)
├─ .claude/agents/*.md        # project subagents
├─ .env.example
├─ docs/                      # this pack + qloo-findings.md + progress.md
├─ apps/
│  ├─ web/                    # Next.js
│  │  └─ src/app/{page,demo,profiles/new,profiles/[id],sessions/[id],compare/[id],how-it-works}
│  └─ agent/
│     ├─ Dockerfile           # node:22 + npm i -g @qloo/qloo-harness (build context = repo root)
│     └─ src/
│        ├─ server.ts         # Fastify routes
│        ├─ qloo/{mcpClient,gateway,redact,cache}.ts
│        ├─ agent/{orchestrator,prompts,tools,validators,baseline}.ts
│        ├─ db/{schema,client,migrations}
│        └─ seed/demoPersonas.ts
└─ packages/shared/src/{schemas,types}.ts   # zod schemas = single source of truth
```

## 4. Data model (Drizzle / Postgres)
| Table | Key columns |
|---|---|
| `profiles` | id (uuid), owner_token (random, stored in browser), nickname, birth_year, languages[], life_stages jsonb [{region, from_year, to_year}], is_demo bool, created_at |
| `seeds` | id, profile_id, raw_text, domain (music/film/tv/food/place/other), qloo_entity_id, qloo_entity_type, display_name, status (pending/confirmed/rejected/unresolved), source (caregiver/learned), evidence_id |
| `avoid_items` | id, profile_id, text, qloo_entity_id nullable, reason, source (caregiver/learned) |
| `taste_profiles` | id, profile_id, version, items jsonb [{domain, entity_id, name, caption, evidence_ids[]}], created_at |
| `sessions` | id, profile_id, number, status (planned/in_progress/done), plan jsonb, what_changed text, created_at |
| `session_items` | id, session_id, order, kind (song/film/food/place/tv/other), qloo_entity_id, title, why text, prompts text[], link_url, evidence_ids[] |
| `reactions` | id, session_item_id, value (engaged/sang/neutral/distressed), note, created_at |
| `qloo_calls` | id, tool, args_redacted jsonb, status, summary, result_count, results_digest jsonb, cached bool, latency_ms, created_at |
| `qloo_cache` | key (sha256), tool, args jsonb, envelope jsonb, expires_at |
| `budget` | day, qloo_calls, llm_tokens |

Auth: **no login**. A random `owner_token` (httpOnly cookie) owns created profiles. Demo personas
are public read-only (`is_demo`), "Duplicate to try changes" creates an owned copy.

## 5. API (agent service)
| Method & path | Purpose |
|---|---|
| GET `/api/health/live` | liveness only, always 200 (Render health-check path, so deploys succeed while Qloo/DB aren't ready) |
| GET `/api/health` | readiness: agent + `qloo_capabilities` (`adapter.ready`) + DB `select 1`; 200 when all ok, 503 when degraded; body = `HealthResponseSchema` |
| GET `/api/demo-profiles` | list seeded personas |
| POST `/api/profiles` | create profile (zod-validated) |
| GET `/api/profiles/:id` | profile + seeds + latest taste profile + sessions |
| POST `/api/profiles/:id/seeds/resolve` | SSE: resolve raw favourites via Qloo → candidates |
| POST `/api/profiles/:id/seeds/confirm` | caregiver confirms/rejects candidates |
| POST `/api/profiles/:id/taste-profile` | SSE: agent builds Life Taste Profile |
| POST `/api/profiles/:id/sessions` | SSE: agent composes next session (uses reactions history) |
| GET `/api/sessions/:id` | session + items |
| POST `/api/session-items/:id/reaction` | log reaction |
| POST `/api/sessions/:id/complete` | SSE: adapt step → `what_changed` + learned seeds/avoids |
| GET `/api/profiles/:id/compare` | baseline (LLM-only) vs grounded plan (cached) |
| GET `/api/evidence/:id` | one evidence record (redacted) |

SSE event shape: `{type:"step"|"tool"|"result"|"error"|"done", message, tool?, status?, evidenceId?, data?}`.

## 6. Non-functional requirements
- p95 cached demo load < 3 s; uncached session build target < 45 s with live progress.
- Every failure path shows a human message + retry; never a blank screen.
- Accessibility: WCAG AA contrast, keyboard navigable, base font ≥ 18 px in player.
- Security: secrets only in env; CORS allow-list; input size limits; helmet headers; no PII in logs.
- Keep the hosted app up until ≥ Nov 17; free UptimeRobot: 5-min keep-alive on `/api/health/live` +
  hourly readiness check on `/api/health`.
- Agent hardening (Phase 1): Qloo harness gets an allow-listed env only; DB TLS `verify-full` in
  production; global error handler never echoes 5xx error text; readiness cached 10 s; `WEB_ORIGIN`
  required (exact https origins) in production.
