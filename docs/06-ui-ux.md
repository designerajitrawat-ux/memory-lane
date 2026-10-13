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
| 1 | **Landing** (`/`) | "For families and carers", headline, explainer naming Qloo, **Try a demo profile** (primary), **Create a profile** (outline), **How it works**; "Three steps"; status strip; footer links + disclaimer |
| 2 | **Demo picker** (`/demo`) | "Three fictional people…"; a card per persona (name, born, regions, confirmed favourites) → their Life Taste Profile. Demo screens show a banner ("A fictional demo profile… Create your own") and hide every change action; the player works but reactions aren't saved |
| 3 | **Profile wizard** (4 steps, progress bar) | Basics · Places (life-stage rows: region + years) · Favourites (chips by domain, free text) · Avoid-list. Privacy note: "Nickname only, like "Dad" or "Nani". It stays in Memory Lane and is never sent to Qloo or the AI." (it is stored in our DB, so "never sent anywhere" would be untrue) |
| 4 | **Confirm matches** (`/profiles/[id]/confirm`, owner only) | "Not checked yet" list + **Check N favourites with Qloo** → live agent log (`role="log"`, one outcome line per favourite) → focus moves to **Choose the right matches**; per seed a radio group "Which “X” did you mean?" of candidates (name · type · year) + "None of these" (whole row tappable, single match preselected); "Won't be used" notes (not found / not sent: personal info); **Save choices** → profile with a focused "Choices saved." (+ how many still need a choice); no-key / quota / outage / stopped banner (focused, not a live region, so it is read once). Check turns secondary while choices wait or Qloo can't answer. Profile page chips: Not checked yet · Choose a match · Confirmed with Qloo · Not found in Qloo · Not sent to Qloo · Not used |
| 5 | **Life Taste Profile** (`/profiles/[id]/taste`) | Intro + **Build the profile** → live agent log; then a summary line ("20 things to share, from 5 favourites", era years), section jump-chips with counts, 4 domain sections of cards (2 columns from `sm`): name, type · year, "Their favourite" badge + Qloo's one line for favourites, aggregate caption for Qloo finds, evidence chip ("Qloo · recommended") → drawer with Qloo's description and the recorded call (what, asked, answer, when). "What Memory Lane did" notes; **Build again** (outline); **Plan a session** (Phase 5) |
| 6 | **Session plan** (`/sessions/[id]`) | Session N · minutes; numbered timeline (slot label · minutes, name (year), why, "To start:" first prompt, logged reaction); **Start the session** / **Carry on** / **See how it went**; "What changed since last time" panel (session ≥2); a calm how-to line |
| 7 | **Session player** (`/sessions/[id]/play`, no site nav) | "Session N · 2 of 6", Pause, progress bar; card: slot label, title (focused per item), big "Listen on YouTube" (+ Spotify) opening a new tab, prompts at 2xl, why; reactions as 4 toggle buttons (Sang along / Engaged / Neutral / Seemed upset — upset shows a gentle "it's fine to stop; it won't be suggested again"), optional note; saves on tap (polite status); Back / Next / **Finish the session**; resumes at the first item without a reaction |
| 8 | **Session summary** (`/sessions/[id]/summary`) | "How session N went" (n of 6 landed well), each item with its reaction and note, **Plan the next session**; Stage 4's "What I learned" (Phase 6) |
| 9 | **Compare** | Two columns "Generic AI" vs "Memory Lane (Qloo-grounded)"; grounded count; genericness metric; short explanation |
| 10 | **How it works** (`/how-it-works`) | Timeline of the 4 stages (who decides at each), "Grounded, every time", where the AI fits, privacy and safety, what it doesn't do, research links (docs/02) |
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
