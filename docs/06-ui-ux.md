# 06 · UI / UX Design

## 1. Design principles
1. **Calm & dignified** — this is about someone's parent. Warm, quiet, never cutesy or clinical.
2. **Phone-first** — caregivers use it sitting next to the person. One-handed player.
3. **Big & simple** — base 18 px (player 22–28 px), tap targets ≥ 48 px, one primary action per screen.
4. **Evidence visible but light** — small chips ("Qloo · recommend ✓"), details in a drawer.
5. **Agent is visible** — live progress stream while working; it makes the agentic behaviour tangible.
6. **Judge path in 30 seconds** — landing → "Try a demo" → session ready.

## 2. Visual direction
- Mood: "a warm family album". Soft paper-like background, deep ink text, one warm accent.
- Suggested tokens (adjust with frontend-design skill; check AA contrast):
  - `--bg` #FBF7F2 (light) / #17140F (dark) · `--ink` #241F1A / #F3ECE2
  - `--accent` #B5552B (terracotta) · `--accent-2` #2F6F6A (teal for evidence chips)
  - `--muted` #6B6158 · radius 16 px · soft shadows
- Type: a humane serif for headings (e.g. "Fraunces" or "Source Serif 4") + a very legible sans
  for body (e.g. "Atkinson Hyperlegible" — designed for low-vision readability).
- Imagery: no stock photos of sad elderly people. Use abstract illustrations / textures.
- Support light & dark mode; respect `prefers-reduced-motion`.

## 3. Screens
| # | Screen | Key elements |
|---|---|---|
| 1 | **Landing** | Headline ("Reminiscence sessions, personal to them."), 3-line explainer, primary CTA **Try a demo profile**, secondary **Create a profile**, "How it works" link, disclaimer footer |
| 2 | **Demo picker** | 3 persona cards (birth year, regions, 2 seed hints) → open |
| 3 | **Profile wizard** (4 steps, progress bar) | Basics · Places (life-stage rows: region + years) · Favourites (chips by domain, free text) · Avoid-list. Privacy note: "Nickname only, like "Dad" or "Nani". It stays in Memory Lane and is never sent to Qloo or the AI." (it is stored in our DB, so "never sent anywhere" would be untrue) |
| 4 | **Confirm matches** | Agent stream at top; per seed: ✓ confirmed / pick one of candidates (name, type, year) / "not found — skip" |
| 5 | **Life Taste Profile** | 4 domain sections, item cards with caption + evidence chip; button **Plan a session** |
| 6 | **Session plan** | Timeline of 5–6 items with duration, why, prompts preview; **Start session**; "What I changed" panel (session ≥2) |
| 7 | **Session player** | Full-screen card: kind icon, title, "Listen/Watch" (external), prompts (large), reaction buttons row, note, Next |
| 8 | **Session summary** | Reactions recap, agent's "What I learned / What changes next time", **Plan next session** |
| 9 | **Compare** | Two columns "Generic AI" vs "Memory Lane (Qloo-grounded)"; grounded count; genericness metric; short explanation |
| 10 | **How it works** | Diagram of the tool chain, list of Qloo tools used, evidence model, limitations, safety, research links |
| — | **Evidence drawer** | tool, redacted inputs, status badge, summary, time, cached? |

## 4. States to design (don't skip — judges click everything)
Loading (agent stream) · empty (no seeds) · needs_input · partial/degraded badge · Qloo quota hit
("We've hit today's research limit — demo profiles still work") · error with retry · offline.

## 5. Copy guidelines
- Plain, kind, short. "Let's find music from Dad's younger years."
- Aggregate wording for captions (see agent validators).
- Never: "patient", "suffering", "decline", "cure", "treatment". Prefer "your mum", "the person you care for".
- Disclaimer (footer + how-it-works): "Memory Lane supports reminiscence activities. It is not a
  medical device and does not diagnose or treat any condition."

## 6. Claude Code tips for UI work
- Ask Claude Code to use the **frontend-design** approach: commit to the visual direction above,
  avoid generic template look.
- Build components in isolation first (cards, chips, player), then screens.
- Run the `ux-reviewer` subagent after each screen (accessibility, states, copy).
