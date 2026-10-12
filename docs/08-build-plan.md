# 08 · Build Plan (phases + acceptance gates)

Work phase by phase. A phase is done only when every acceptance check passes. After each phase:
commit, deploy (from Phase 1 onward), update `docs/progress.md`. Prompts for each phase are in
`09-claude-code-playbook.md`.

## Phase 0 — Access & data validation (BLOCKING)
- [ ] Registered on Devpost; own Qloo key (form on Resources page)
- [ ] Harness installed, `qloo setup --status` ready; Discord joined
- [ ] Run the validation script (`03-qloo-integration.md` §8) in `qloo explore`
- [ ] Fill `docs/qloo-findings.md`; decide era/region strategy; update `05-agent-design.md` if needed
- [ ] Decide: product name, hosting accounts (Vercel, Railway/Render/Fly, Neon/Supabase), Anthropic API key
- **Gate:** at least 2 of 3 demo personas return rich, sensible Qloo results. If not → adjust personas/strategy before coding.

## Phase 1 — Scaffold & deploy skeleton
- [ ] pnpm monorepo: `apps/web`, `apps/agent`, `packages/shared`; TS strict; ESLint/Prettier; Vitest
- [ ] MIT LICENSE, README stub, `.env.example`, `.gitignore`, GitHub Actions CI (typecheck/lint/test)
- [ ] Agent Dockerfile (Node 22 + global harness); `/api/health` calls `qloo_capabilities`
- [ ] Deploy web (Vercel) + agent (Render free, Docker via `render.yaml`) + DB (Neon); web shows agent health; UptimeRobot 5-min monitor on `/api/health`
- **Gate:** public URL shows "Agent ✓ · Qloo ✓ · DB ✓". Repo public with license detected.

## Phase 2 — Qloo gateway
- [ ] MCP client (long-lived, reconnect), allow-list, redact, cache, evidence log, envelope rules, retries, rate limit, budget
- [ ] Fixture recorder (writes to gitignored `test/fixtures/recorded/`) + `FixtureGateway`; CI uses synthetic envelopes
- [ ] Unit tests: redact, envelope handling, cache key, budget
- **Gate:** a script calls 3 tools live, records fixtures locally (gitignored); tests green on synthetic envelopes; no secret in logs; no Qloo response data committed.

## Phase 3 — Profiles & seed resolution
- [ ] Shared zod schemas; DB schema + migrations; owner token cookie
- [ ] Wizard UI (4 steps) + `POST /api/profiles`
- [ ] Stage 1 resolve (SSE) + confirm UI incl. needs_input candidates
- **Gate:** new profile → favourites resolved/confirmed; unresolved never used.

## Phase 4 — Life Taste Profile
- [ ] Stage 2 agent loop with budgets, `propose_candidates`, validators
- [ ] Taste Profile UI with evidence chips + drawer; agent progress stream
- **Gate:** each demo persona produces 4 domains, all items with evidence.

## Phase 5 — Session plan & player
- [ ] Stage 3 compose + validators (grounding, avoid, language, prompts)
- [ ] Plan screen + player + reactions API
- **Gate:** full session runnable on a phone; validators provably block a bad item (test).

## Phase 6 — Adaptation loop
- [ ] Stage 4 adapt; `what_changed`; learned seeds/avoids; session 2 generation
- **Gate:** reacting "sang" to an item measurably shifts session 2; "distressed" item never returns.

## Phase 7 — Compare & How it works
- [ ] Baseline (no tools) generation, cached; compare UI with grounded count + genericness metric
- [ ] How-it-works page (diagram, tools, limitations, research links)
- **Gate:** compare view clearly shows difference for all 3 personas.

## Phase 8 — Demo data, polish, accessibility
- [ ] Seed 3 personas; pre-warm caches incl. 2 sessions with sample reactions each
- [ ] All states (loading/empty/error/quota/partial); responsive; dark mode; a11y pass (`ux-reviewer`)
- [ ] Landing page final copy; disclaimer; delete-profile
- **Gate:** a fresh visitor on a phone reaches a ready session in < 30 s; Lighthouse a11y ≥ 90.

## Phase 9 — Hardening & submission
- [ ] `security-reviewer` + `hackathon-judge` subagent reviews; fix findings
- [ ] Load sanity (10 parallel demo opens); uptime monitor on `/api/health`
- [ ] README final (template in `10-submission-kit.md`), screenshots, architecture diagram
- [ ] Clean-clone setup test (fresh folder, follow README only)
- [ ] Devpost form filled; **submit by Oct 29 IST**; keep app live through Nov 17
- **Gate:** checklist in `10-submission-kit.md` 100% ticked.

## Working mode (solo)
One developer + Claude Code. Phases run in order, one at a time. Subagents cover the specialist
roles: `qloo-data-scout` (data/Qloo), `ux-reviewer` (frontend/a11y), `security-reviewer`,
`hackathon-judge` (pitch/scoring). Product/pitch work (interviews, README, Devpost text,
screenshots) is done by the developer, with Claude Code drafting it.
Use small feature branches if helpful; worktrees only when running parallel Claude Code sessions.
