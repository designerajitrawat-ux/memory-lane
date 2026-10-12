# CLAUDE.md — Memory Lane (Qloo Agentic Hackathon)

You are building **Memory Lane**: an AI agent that plans personalised reminiscence sessions (music,
films, food, places + gentle conversation prompts) for older adults living with memory loss, with
every item grounded in Qloo's taste graph, and a learning loop from caregiver-logged reactions.

## Read before working
| When | Read |
|---|---|
| Every session start | this file + `docs/progress.md` |
| Rules, judging, deadlines | `docs/00-hackathon-brief.md` |
| What to build, scope, user stories | `docs/01-product-spec.md` |
| Evidence & honest claims | `docs/02-research-evidence.md` |
| Anything touching Qloo | `docs/03-qloo-integration.md` + `docs/qloo-findings.md` |
| Structure, stack, DB, API | `docs/04-architecture.md` |
| Agent stages, prompts, validators | `docs/05-agent-design.md` |
| Screens, visual style, states | `docs/06-ui-ux.md` |
| Privacy & safety requirements | `docs/07-safety-privacy.md` |
| Current phase & gates | `docs/08-build-plan.md` |
| Submission/README | `docs/10-submission-kit.md` |
| Demo data | `docs/11-demo-personas.md` |

## Non-negotiables
1. **If a feature would work the same without Qloo, redesign it.** LLM proposes, Qloo decides, code verifies.
2. Every recommended item must carry Qloo evidence (`evidence_ids`); validators block anything else.
3. Never fall back silently to LLM-only content when Qloo fails — show the state honestly.
4. Qloo access only via `qloo mcp` (harness) from the agent backend through `qloo/gateway.ts`.
   Never call Qloo or Claude from the browser. No serverless for the agent service.
5. Secrets (`QLOO_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`) only in env vars. Never in code,
   repo, logs, prompts, fixtures, screenshots. Never ask the user to paste a key into chat.
6. No personal data to Qloo (no nickname, contact info, addresses, health terms). Coarse regions only.
7. Aggregate wording ("people who grew up with X often enjoyed Y"); no medical/treatment claims.
8. Don't host or reproduce copyrighted media or lyrics; link to YouTube/Spotify search URLs.
9. Respect the avoid-list absolutely.
10. Only the harness surfaces `explore`, `exec`, `api`, `mcp` — never `integrate`/`plan`/`build` modes.

## How to work
- Work one phase at a time from `docs/08-build-plan.md`; use plan mode for multi-file changes.
- If code must diverge from a doc, update the doc in the same change and log it in
  `docs/progress.md` → Decisions.
- Before building a Qloo-dependent feature, confirm the data exists (`qloo-data-scout` subagent).
- Finish a phase only when its gate passes; then: tests green → commit → deploy → update progress.md.
- Subagents: `qloo-data-scout`, `security-reviewer` (before deploys), `ux-reviewer` (after UI work),
  `hackathon-judge` (end of phases).
- TypeScript strict; zod schemas in `packages/shared` are the single source of truth; small commits.
- Tests use synthetic Qloo envelopes committed in the repo. Real recorded Qloo responses stay local in
  gitignored `apps/agent/test/fixtures/recorded/` (Qloo rule: no Qloo response data in a public repo).
  Keep live calls minimal (shared quota).

## Commands (fill in once scaffolded)
- install: `pnpm install` · dev: `pnpm dev` · test: `pnpm test` · lint: `pnpm lint` · typecheck: `pnpm typecheck`
- Qloo readiness: `qloo setup --status` · `qloo doctor`

## Key dates
Submit by **Oct 29, 2026 (IST)** (official deadline Oct 30, 11:45 pm EDT). Keep the live app up
and free through **Nov 17, 2026**.
