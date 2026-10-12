# Memory Lane — reminiscence sessions, personal to them

> Qloo Agentic Hackathon 2026 · **Work in progress** · Live demo: _coming soon_

Memory Lane is an AI agent that plans personalised reminiscence sessions (music, films, food,
places, plus gentle conversation prompts) for older adults living with memory loss. Every item is
grounded in Qloo's taste graph, and the agent learns from caregiver-logged reactions.

Memory Lane supports reminiscence activities. It is not a medical device and does not diagnose or
treat any condition.

## Repo layout

| Path | What |
|---|---|
| `apps/web` | Next.js (App Router) frontend — deployed on Vercel |
| `apps/agent` | Fastify agent service + `qloo mcp` child process — Docker container on Render |
| `packages/shared` | zod schemas shared by web and agent (single source of truth) |
| `docs/` | Product spec, architecture, agent design, safety, build plan |

## Run it locally

Prerequisites: Node ≥ 22.19, pnpm 12, and the Qloo harness:

```sh
npm install --global @qloo/qloo-harness   # provides `qloo mcp`
export QLOO_BASE_URL=https://hackathon.api.qloo.com          # hackathon keys only work here
export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
qloo setup --qloo                          # paste your own Qloo key here, never in code or chat
pnpm install
cp .env.example .env                       # fill DATABASE_URL etc. (optional for a first run)
pnpm dev                                   # web on :3000, agent on :8787
```

Open http://localhost:3000 — the status strip shows whether the agent, Qloo and the database are
ready. Without a Qloo key it honestly shows "Qloo: waiting for API key".

No key or database yet? `pnpm --filter @memory-lane/agent dev:fixtures` runs the agent with an
in-memory database and synthetic Qloo answers (placeholder names like "Example Artist A"), so the whole
flow can be clicked through locally. Both switches are refused in production.

| Command | |
|---|---|
| `pnpm test` | unit tests (Vitest, synthetic Qloo envelopes — no live calls) |
| `pnpm typecheck` · `pnpm lint` | strict TypeScript · ESLint |
| `pnpm build` | Next.js build + single-file agent bundle |

## License

MIT — see [LICENSE](LICENSE).
