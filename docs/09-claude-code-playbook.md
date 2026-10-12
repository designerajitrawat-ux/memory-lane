# 09 · Claude Code Playbook (VS Code + Max plan)

How we drive the build with Claude Code so nothing gets confused between sessions.

## 1. One-time setup
1. Install VS Code + the **Claude Code** extension; sign in with the Max plan account.
2. Install Node ≥ 22.19, pnpm, git, and the Qloo harness (`03-qloo-integration.md` §1); run
   `qloo setup --qloo` with **your own** key (stored by the harness, not in the project).
3. Create an empty GitHub repo `memory-lane` (public), clone it, and copy **everything from this
   kit** into its root (`CLAUDE.md`, `START_HERE.md`, `docs/`, `.claude/`, `.mcp.json`,
   `.env.example`, `.gitignore`, `LICENSE`).
4. Open the folder in VS Code → open Claude Code panel. Trust the folder when asked (needed for
   project subagents and `.mcp.json`).
5. Approve the project MCP server `qloo` when prompted (from `.mcp.json`). It contains **no key** —
   it runs your local `qloo mcp`, which uses your harness config. If the client can't find `qloo`,
   put the full path from `command -v qloo` (or `where.exe qloo`) in `.mcp.json` locally.
6. Check: ask Claude Code "Run qloo_capabilities and tell me if Qloo is ready."

## 2. Working rules (tell Claude Code once; they're also in CLAUDE.md)
- **Start every session** with: `Read CLAUDE.md and docs/progress.md, then tell me where we are.`
- **Plan mode first** (Shift+Tab to cycle into plan mode) for any phase or multi-file change.
  Review the plan, then let it implement.
- **One phase per session.** When a phase is done: tests green → commit → deploy → update
  `docs/progress.md` → `/clear` before the next phase.
- **Docs are the contract.** If implementation needs to diverge from docs, Claude must update the
  doc in the same change and note it in progress.md "Decisions".
- Use subagents (in `.claude/agents/`): `qloo-data-scout`, `security-reviewer`, `ux-reviewer`,
  `hackathon-judge`.
- Solo build: one Claude Code session at a time. If you ever run parallel sessions, give each its
  own worktree; never two sessions editing the same files.
- Never paste keys into Claude Code chat. Keys go into hosting dashboards / local `.env` only.

## 3. Copy-paste prompts per phase

### Phase 0 — validation (with Qloo MCP connected in Claude Code)
```
Read CLAUDE.md and docs/03-qloo-integration.md. Use the qloo-data-scout subagent to run the Phase-0
validation script (section 8) through the qloo MCP tools. Keep calls minimal. Write results into
docs/qloo-findings.md using its template, then recommend the era/region strategy and list any
changes needed in docs/05-agent-design.md. Do not write app code yet.
```
(Also run a few questions yourself in `qloo explore` → `/request` to see raw request shapes.)

### Phase 1 — scaffold
```
Read CLAUDE.md, docs/04-architecture.md and docs/08-build-plan.md Phase 1. In plan mode, propose the
monorepo scaffold (pnpm workspaces: apps/web Next.js App Router + Tailwind + shadcn/ui, apps/agent
Fastify TS, packages/shared zod schemas), CI, Dockerfile for the agent (Node 22 + global
@qloo/qloo-harness), and /api/health that calls qloo_capabilities. After I approve, implement it,
run typecheck/lint/tests, and give me exact deploy steps for Vercel + Railway (or Render) + Neon.
```

### Phase 2 — Qloo gateway
```
Implement Phase 2 from docs/08-build-plan.md following docs/03-qloo-integration.md sections 4-6
exactly: long-lived MCP client (pass env: process.env), allow-list, redact.ts with unit tests,
Postgres cache, qloo_calls evidence log, envelope status handling, bounded retries only when
error.retryable, rate limit + daily budget, and a FixtureGateway + recorder script (recordings go to the
gitignored test/fixtures/recorded/; committed tests use synthetic envelopes). Plan first.
```

### Phase 3 — profiles & seeds
```
Implement Phase 3: shared zod schemas, Drizzle schema/migrations from docs/04-architecture.md §4,
owner-token cookie, the 4-step wizard (docs/06-ui-ux.md screen 3), and Stage 1 seed resolution with
SSE progress + confirm UI for needs_input (docs/05-agent-design.md Stage 1). Plan first. Use
synthetic Qloo envelopes in committed tests (never commit real Qloo responses).
```

### Phase 4 — taste profile
```
Implement Phase 4: Stage 2 agent loop per docs/05-agent-design.md (prompts 4.1, tool budget,
propose_candidates, grounding validator) with Claude API tool use (model claude-sonnet-5-5, prompt
caching on system+tools). Build the Life Taste Profile screen with evidence chips + evidence drawer
and the live agent progress stream. Plan first; show me the tool-call trace for one demo persona.
```

### Phase 5 — session & player
```
Implement Phase 5: Stage 3 compose (prompt 4.2, SessionPlanSchema), all validators in
docs/05-agent-design.md §3 with tests that prove a bad item is blocked, link URLs built in code,
the session plan screen and the phone-first player with reactions. Then run the ux-reviewer subagent.
```

### Phase 6 — adaptation
```
Implement Phase 6: Stage 4 adapt per docs/05-agent-design.md, what_changed text, learned
seeds/avoids, session 2 generation. Add a test: "sang" on item X shifts session 2 toward X's
neighbours; "distressed" item never reappears.
```

### Phase 7 — compare & how it works
```
Implement Phase 7: baseline (no tools, prompt 4.3) cached per profile, compare screen with grounded
count and a genericness metric (overlap of items across the 3 demo personas), and the How it works
page (mermaid diagram, Qloo tools used, limitations, research links from docs/02).
```

### Phase 8 — demo data & polish
```
Implement Phase 8: seed the 3 personas from docs/11-demo-personas.md, pre-warm caches and 2 sessions
each with sample reactions, finish all UI states from docs/06-ui-ux.md §4, dark mode, a11y. Then run
ux-reviewer and fix everything it flags.
```

### Phase 9 — hardening & submission
```
Run security-reviewer, then hackathon-judge on the live URL and repo. Fix all critical findings.
Then draft README.md from docs/10-submission-kit.md (fill real details, screenshots list, redacted
request-to-result example from a real qloo_calls record: request shape + status + entity names only, no raw
response payload) and the Devpost description text.
```

## 4. When things go wrong
- Claude drifts from docs → "Stop. Re-read CLAUDE.md and the relevant doc; list where your change differs."
- Context gets long/confused → update progress.md, `/clear`, restart with the session-start prompt.
- Qloo errors → `qloo setup --status`, `qloo doctor`, check `QLOO_API_KEY` on server and `env: process.env`.
- Ask in Qloo Discord with redacted error code + time (never the key).
