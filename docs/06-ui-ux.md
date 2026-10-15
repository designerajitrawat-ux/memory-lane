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
- Imagery: no stock photos of sad elderly people. The pictures are the items themselves: Qloo's own
  photo, poster or place image for each item (from its API, through the image optimizer), decorative for
  screen readers (alt="", the name is always next to it). Thumbnails (plan, taste, summary) fall back to
  the kind icon on a warm tile; the player shows a picture only when there is one, in a frame about a quarter of the screen high (a failed load keeps the
  frame with the icon); the confirm screen shows pictures only when every match has one; the landing
  strip and demo picker show only the pictures there are. Beside text, pictures stack above it or hide
  when the screen is narrow for the text size (rem breakpoints). No pictures on the compare page.
- Light & dark: the device's setting by default; a colour button in the header ("Colours: Auto" →
  Light → Dark; icon only on phones; kept on this device, announced, applied before the page paints)
  lets someone whose phone is dark read on a light page — many older eyes read dark text on light more
  easily. Not in the player (no header there). Dark colours are for screens only: printing is always
  light. Respect `prefers-reduced-motion`.
- Layout: phone-first, one column. From `lg` (64rem: 1024px at the default text size, later with larger
  text, so large text gets the one-column layout) wide screens use the space: landing hero in two columns
  (words | Qloo's pictures), the three steps side by side; demo personas side by side (2 columns from
  `md`, 3 from `xl`); Life Taste Profile with the sessions in a side panel (DOM order = phone order);
  session plan with the title, Start, Print, Compare and Back in a left column; player with the picture
  (or, for a dish, the kind icon) in a left column and the name, links, prompts and reactions beside it.
  Side panels and the player's picture stay in view while scrolling only when they fit the window;
  the player's Back/Next bar sticks to the bottom on any screen at least 576px tall. Pages laid out wide
  get a wide header, so the edges line up. Forms (wizard, confirm), reading pages and the summary stay
  one narrow column; the printed plan is always one column.

## 3. Screens
| # | Screen | Key elements |
|---|---|---|
| 1 | **Landing** (`/`) | "For families and carers", headline, explainer naming Qloo, **Try a demo profile** (primary), **Create a profile** (outline), **How it works**; a preview of a demo's newest session (up to two "what it learned" lines, the first three items with pictures, reasons and evidence chips, "Open X's session N"; space kept while loading, gone if it can't load); a strip of up to six Qloo pictures, taking the demo profiles in turn (space kept while loading; hidden if none load; the pictures link to /demo), "Pictures Qloo has for the music, films and places it found for … our fictional demo profiles." and **See the demo profiles**; "Three steps"; status strip; footer links + disclaimer |
| 2 | **Demo picker** (`/demo`) | "Three fictional people…"; a card per complete persona (name as h2, born, regions read as "A, then B", four of Qloo's pictures from their profile, confirmed favourites) → their Life Taste Profile, plus "or go straight to session 2". While personas are being built: a status card that checks again every 15 s for 2 min, **Check again**, "Create a profile instead". Demo screens show a banner ("A fictional demo profile… Create your own") and hide every change action; the player works but reactions aren't saved |
| 3 | **Profile wizard** (4 steps, progress bar) | Basics · Places (life-stage rows: region + years) · Favourites (chips by domain, free text) · Avoid-list. Privacy note: "Nickname only, like "Dad" or "Nani". It stays in Memory Lane and is never sent to Qloo or the AI." (it is stored in our DB, so "never sent anywhere" would be untrue) |
| 4 | **Confirm matches** (`/profiles/[id]/confirm`, owner only) | "Not checked yet" list + **Check N favourites with Qloo** → live agent log (`role="log"`, one outcome line per favourite) → focus moves to **Choose the right matches**; per seed a radio group "Which “X” did you mean?" of candidates (Qloo's pictures when every match has one, name · type · year) + "None of these" (whole row tappable, single match preselected); "Won't be used" notes (not found / not sent: personal info); **Save choices** → profile with a focused "Choices saved." (+ how many still need a choice); no-key / quota / outage / stopped banner (focused, not a live region, so it is read once). Check turns secondary while choices wait or Qloo can't answer. Profile page chips: Not checked yet · Choose a match · Confirmed with Qloo · Not found in Qloo · Not sent to Qloo · Not used |
| 5 | **Life Taste Profile** (`/profiles/[id]/taste`) | h1 names whose profile it is. Intro + **Build the profile** → live agent log; then a summary line ("4 favourites you confirmed, 16 more found by Qloo"; demo: "4 confirmed favourites…"), era years, section jump-chips with counts, 4 domain sections of cards (2 columns from `sm`): Qloo's picture (or the kind icon), name, type · year, badge (Added as a favourite / Found by Qloo / Learned from a session) + Qloo's one line or the aggregate caption, evidence chip → drawer with Qloo's description and each recorded call (what, asked — favourites by name —, answer with this item's place in it, other results, when). **How Memory Lane built this** (the build's saved steps, collapsed). Notes; **Build again** (outline); Sessions panel with **Plan the first/next session**. On a demo the Sessions panel comes first, with a primary "Open session 2: what it learned from session 1", then **Try the learning yourself** (private copy, session 1 ready) |
| 6 | **Session plan** (`/sessions/[id]`) | Session N · minutes, how-to line, **Start the session** near the top and again at the end; "What changed since last time" panel (session ≥2); numbered timeline (Qloo's picture or the kind icon beside the slot label and name, hidden when narrow for the text size, loaded at once so it prints; slot label · minutes, name (year) as h3, then full width: why, "To start:" first prompt, logged reaction with hidden "How it landed:", evidence chip per item); **Print this plan** (print styles: plan only); demo: **Try the learning yourself** |
| 7 | **Session player** (`/sessions/[id]/play`, no site nav, disclaimer-only footer) | "Session N · 2 of 6", "Pause (see the plan)", progress bar ("Item 2 of 6"); card: slot label, title, then Qloo's picture to look at together (whole, in a frame sized by the screen's height; none for dishes) — title (focused per item with hidden "Item 2 of 6:", page scrolls to top), big link named by destination ("Listen on YouTube", "See it on Google Maps", map-pin icon for places) + new-tab icon and "Come back to this tab" hint, prompts at 2xl, why + evidence chip; reactions as 4 toggle buttons (Sang along / Enjoyed it / Quiet / Seemed upset; selected = teal tint + check) — upset says gently it won't be suggested again (demo: "wouldn't be"); note (opens when one exists, saves on blur, refuses health/contact details gently); saves on tap, one request at a time per item carrying the reaction and any unsaved note (a tap never erases a note; drafts save on Next/Finish); a failure names the item and stays listed in the bar with **Try again** (retried when back online; an offline notice shows); Finish waits for saves on their way and offers **Finish anyway** if some never saved; Back / Next (or **Finish the session**) in a bar that sticks to the bottom on tall phones and wraps at large text; resumes at the first item without a reaction; demo Finish → an end card explaining what saving and learning would do |
| 8 | **Session summary** (`/sessions/[id]/summary`) | "How session N went" (n of 6 landed well; kinder line when none did), "What happens next" (learning happens when the next session is planned: what landed comes first, Qloo is asked for more and ranks what's next, upsetting items never return), each item with its picture, reaction and note, **Plan the next session**; demo: banner + "See session 2: what Memory Lane learned"; load errors offer Try again and links |
| 9 | **Compare** | Intro (same model, same facts and task, no Qloo; Memory Lane's session 1, before any reactions); a two-line summary built from the counts; metric cards only where the sides differ (beyond what the caregiver typed, Qloo evidence, outside their years, on the avoid-list, reasons Memory Lane wouldn't show, shared with the other demos' plans), ties in one line; two plan columns (one column on phones) with badges ("One of their favourites" / "By X…" / "Where they lived", "New find", "Suggested by AI, ranked by Qloo", Outside, Avoid-list, Wording blocked); honest states (off, budget, device limit, refused, failed + Try again); demo banner on demos; no pictures (the generic side has no Qloo entities, so pictures on one side only would tilt the comparison). Linked from demo profiles and, on a caregiver's profile, from the Sessions panel once a session exists |
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
