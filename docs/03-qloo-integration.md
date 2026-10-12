# 03 · Qloo Integration Guide

Source: official kit https://github.com/qloo/qloo-hackathon-kit (read 12 Oct 2026). Re-check the
kit for updates; if anything differs, the kit wins — update this file.

## 1. Setup (each developer, own key)
```sh
# Node.js >= 22.19.0 required
npm install --global @qloo/qloo-harness
qloo --version            # must be >= 0.1.26
# Hackathon keys ONLY work against the hackathon API (Qloo kickoff email) — set both, persistently:
export QLOO_BASE_URL=https://hackathon.api.qloo.com
export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
qloo setup --qloo         # paste YOUR event key here (prompt hides it; never in chat/repo)
qloo setup --status       # readiness check — look for "Qloo data: ready"
qloo setup --model        # only needed for `qloo explore` (needs a model provider sign-in)
qloo doctor               # troubleshooting
```
On a server: set env var `QLOO_API_KEY` (secret) plus `QLOO_BASE_URL` / `QLOO_TRUSTED_BASE_URL` (not
secret; in `render.yaml`). Never use `--api-key` on CLI (shell history). Without the base URLs the harness
targets `https://api.qloo.com`, where hackathon keys fail. `.mcp.json` sets them for Claude Code's own
`qloo` server. Keys arrive by email, usually within one business day. Leaked key → email ian@qloo.com.
Kit starters worth comparing with our gateway: `starter/cli-workflow` (`qloo exec find_tags
--input-file request.json`) and `starter/mcp-client`; submission checklist: kit `docs/SUBMISSION.md`.

## 2. The four surfaces (same credential, same quota, same result shape)
| Surface | Use in our project |
|---|---|
| `qloo explore` | Day-0 data validation in plain language. Start it **inside the project folder**, never home dir. `/request` shows the underlying API calls; `/journey insight` is a guided walkthrough. Read-only. |
| `qloo exec <workflow> --input-file req.json` | Scripted checks / fixtures generation. Prints one normalized JSON result. |
| `qloo api <endpoint> ... --json` | Raw endpoint calls, e.g. `qloo api search --query "Mohammed Rafi" --type artist --take 3 --json`. `--dry-run` to preview. |
| `qloo mcp` | **Production path.** Local stdio MCP server started by our agent backend. |

Not allowed in hackathon: `integrate`, `plan`, `build` modes. Use `qloo mcp`, NOT legacy `qloo api mcp`.

## 3. MCP tools (documented in kit)
| Tool | Purpose | Key args (verify exact schema via `listTools()`) |
|---|---|---|
| `qloo_capabilities` | Readiness check, no Qloo call | — |
| `qloo_find_tags` | Resolve a concept to Qloo tag IDs (semantic) | `query`, `limit` (1–20) |
| `qloo_describe` | Resolve/describe an entity | entity name/id |
| `qloo_entity_tags` | Tags of an entity | entity |
| `qloo_recommend` | "Fans of X also like…" | `signals`, `target_type` |
| `qloo_rank` | Rank a shortlist for an audience | `options`, `option_type`, `signals` or `demographic` |
| `qloo_where_popular` | Where an entity is popular | `entity`, `within` |
| `qloo_compare_audiences` | How two fan bases differ | `group_a`, `group_b` |
| `qloo_audience_demographics` | Who an audience is | entity/audience |
| `qloo_trends` | Is it rising | `entity_type`, 1–5 entities, date range |

Recommended chain (from kit): **resolve → confirm with user → ask taste question**
`qloo_find_tags`/`qloo_describe` → confirm → `qloo_recommend` / `qloo_rank` / `qloo_where_popular`.

## 4. Result envelope (every tool)
```json
{ "status": "ok|empty|needs_input|partial|degraded|error",
  "summary": "…", "results": [], "result_count": 0,
  "error": { "code": "QLOO_AUTH", "retryable": false, "recovery": "…" } }
```
Handling rules (implement exactly):
| status | Our behaviour |
|---|---|
| `ok` | Use results; log evidence |
| `empty` | Refine input once (agent), else mark "no Qloo match" — never invent |
| `needs_input` | Show candidates to caregiver (seed-confirmation UI); do not guess |
| `partial` / `degraded` | Use, but evidence chip shows a "partial" badge + `summary` |
| `error` | Retry **only** if `error.retryable === true` (max 2, backoff); otherwise surface `recovery` message; never silently fall back to LLM-only content |

## 5. Backend connection (Node/TS), adapted from kit `backend.mjs`
```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// IMPORTANT: QLOO_API_KEY (+ QLOO_BASE_URL / QLOO_TRUSTED_BASE_URL) must be passed explicitly, but
// pass ONLY those (harnessEnv() in mcpClient.ts) — never process.env: DATABASE_URL / ANTHROPIC_API_KEY
// must not reach this third-party process. The SDK adds a safe default env (PATH, HOME, …) itself.
const transport = new StdioClientTransport({ command: "qloo", args: ["mcp"], env: harnessEnv() });
const client = new Client({ name: "memory-lane-agent", version: "0.1.0" });
await client.connect(transport);           // ENOENT => harness not installed
const { tools } = await client.listTools(); // pass (allow-listed) tools to Claude
const res = await client.callTool({ name: "qloo_find_tags", arguments: { query: "ghazal", limit: 5 } });
const envelope = res.structuredContent;      // treat missing status as error
```
- Keep **one long-lived MCP client** per agent-service process; reconnect on crash.
- Deploy on a VM/container (Railway/Render/Fly) with Node ≥22.19 + harness installed globally.
  **Serverless (Vercel functions) is NOT supported** for this. Browser can never call Qloo.

## 6. Our "Qloo Gateway" layer (wrap every call)
All Qloo calls go through `apps/agent/src/qloo/gateway.ts`, which:
1. Checks tool against an **allow-list** (only tools in §3 we actually use).
2. **Redacts/validates args** — rejects anything that looks like personal data (names of the
   person, emails, exact addresses, health terms). Only public cultural signals pass
   (entity names, tags, coarse regions like "Punjab, India", decades, target types).
3. Looks up **cache** (Postgres table `qloo_cache`, key = sha256(tool + canonical JSON args),
   TTL 7 days; demo personas: no expiry).
4. Calls MCP, normalises envelope, applies §4 rules.
5. Writes an **evidence record** (`qloo_calls` table) and returns `{ envelope, evidenceId }`.
6. Enforces **rate limits** (per IP + per profile + global daily budget) → friendly "quota" UI state.

## 7. How we get "era" and "region" (hypothesis — VERIFY in Phase 0)
The documented tools have no explicit "year" filter. Strategy, in order of preference:
1. **Tags**: `qloo_find_tags` for concepts like "1960s", "oldies", "golden era Bollywood",
   "ghazal", "doo-wop", "rock and roll" → use tags as signals.
2. **Seeds**: caregiver's confirmed favourites are strong era anchors → `qloo_recommend` from them
   (cross-domain: artist → films, dishes, places).
3. **LLM proposes, Qloo ranks**: Claude proposes era/region-plausible candidates → each resolved
   via `qloo_describe` (drop unresolved) → `qloo_rank` with `signals` from seeds and/or
   `demographic` (older age band, if supported). Only ranked, resolved items survive.
4. **Region**: `qloo_where_popular` to check regional fit of candidate entities (coarse region only).
Record what actually works in `docs/qloo-findings.md` and update `05-agent-design.md`.

## 8. Phase-0 validation script (run in `qloo explore`, paste answers into findings)
1. "Find the Qloo tags for: 1960s, oldies, ghazal, golden age Bollywood, doo-wop, country music, Merseybeat. Show candidates."
2. "Describe these entities and show matches: Mohammed Rafi; Mughal-e-Azam; Patsy Cline; The Sound of Music (film); Cilla Black; sarson da saag."
3. "Fans of Mohammed Rafi and Lata Mangeshkar — recommend movies, then recommend dishes/restaurants types, then places."
4. "Rank these songs/artists for an older audience who like Patsy Cline: [list of 8]."
5. "Where is Mohammed Rafi most popular? Within India / within Punjab?"
6. "Does qloo_rank support a demographic/age band? Show the request with /request."
7. "Fans of The Beatles — recommend TV shows and foods."
8. Check: entity types available (artist, movie, tv_show, place, destination, dish?, brand, book…).
For each: status, result quality (1–5), surprising/useful items, exact request shape (`/request`).

## 9. Feedback to Qloo (bonus visibility)
While building, file 1–3 genuine, constructive issues/discussions on the kit repo (docs gaps, bugs,
feature requests like "decade filter"). Link them in README "Notes for Qloo".
