# Devpost submission text (ready to paste)

**Project name:** Memory Lane
**Tagline:** Reminiscence sessions, personal to them — every song, film, dish and place grounded in
Qloo's taste graph, and Qloo decides what comes next.
**Demo:** https://memory-lane-sable-rho.vercel.app (no login: "Try a demo profile")
**Repo:** https://github.com/designerajitrawat-ux/memory-lane
**Built with:** qloo, qloo-mcp, openai, typescript, next.js, react, tailwindcss, fastify, node.js,
postgresql, neon, drizzle-orm, zod, vercel, render, docker, vitest

## Inspiration
Reminiscence and personalised music are part of everyday dementia care, and the research shows small
but real benefits for quality of life and communication. The hard part is never the idea; it is
preparation: finding the songs, films, food and places of *this* person's youth, in *their* culture,
every week. Generic playlists drift to the same Western "greatest hits", and a generic AI answer can't
show why an item fits or check its years. We wanted an agent that does the preparation honestly, with
evidence for every suggestion.

## What it does
1. A caregiver adds a few public favourites (a singer, a film, a dish, a place), where the person grew
   up (town level) and anything to avoid. No personal details.
2. The agent matches each favourite in Qloo; when there are several matches, the caregiver picks one.
3. It builds a Life Taste Profile with Qloo, domain by domain: singers from the singers they love,
   films and TV from their films and shows (kept to their era), places in and around where they grew
   up, and dishes from Qloo's food tags. When Qloo leaves a gap, an AI model proposes era-typical
   names that count only once Qloo matches and ranks them. Every item carries the Qloo call behind it.
4. It plans a 25-minute session (opening song, a film or TV memory, food, a place, "your choice",
   closing song) with gentle, item-specific prompts (written by the AI from Qloo's description, then
   checked) that invite, never test, and links to YouTube, Spotify or Maps.
5. The caregiver taps how each item landed. Next time, Qloo is asked for more like what they sang along
   to, `qloo_rank` orders everything still to play against it, anything upsetting never returns, and
   the plan explains what changed.

## How we built it
- **Agent stages:** Stage 1 match (`qloo_describe`, `qloo_find_tags`, caregiver confirms) → Stage 2
  Life Taste Profile (`qloo_recommend` per domain with `explain`, places with `filter_location`, food
  tags for town and region) → Stage 3 session (template, prompts, links built in code) → Stage 4 learn
  (`qloo_recommend` more like what landed, `qloo_rank` for what comes next, learned avoid-list).
- **Qloo decides, code verifies:** validators drop anything without Qloo evidence, anything on the
  avoid-list (reading Qloo's own descriptions, with related words for painful topics), wording that
  makes claims about the person, memory-test prompts and links outside allowed search pages.
- **Qloo access:** only through `qloo mcp` from the agent service, behind a gateway with an allow-list,
  strict argument schemas, a personal-data guard, caching, budgets and an evidence record per call.
- **The AI model** (OpenAI `gpt-6-luna`, structured outputs) proposes names for gaps, writes prompts
  for items already chosen, and plays the "generic AI" in the comparison; it never decides what's in
  a session, and it only ever sees public facts.
- **Stack:** Next.js 16 on Vercel, a Fastify agent in Docker on Render, Postgres on Neon, zod schemas
  shared by both. 187 tests on synthetic Qloo envelopes and a fake AI; no Qloo data in the public repo.

## Challenges we ran into
- **Era without a decade filter.** Qloo has no release-year filter, so films and TV are kept to the
  person's years by `release_year` in code, singers are ordered by the decades Qloo's descriptions
  mention, and `qloo_rank` pushes later names down.
- **Asking the right question per domain.** With all favourites at once, a UK persona got American
  dramas; asking TV with her TV favourite and singer brought British soaps, and asking places near
  Liverpool with her singers found the city's music landmarks.
- **AI proposals need Qloo to decide.** The model's TV suggestions for an Indian childhood were good
  ("Ramayan", "Mahabharat"), but Qloo knows several shows by those names; the agent now picks each
  title's entity from the person's years before asking Qloo to rank them.
- **Places and food near a town are mostly businesses.** Only lasting landmarks are kept (not hotels,
  bars or new venues), and only named dishes (restaurant styles and "Punjabi"-style labels are left
  out); when nothing is left, the profile says so instead of guessing.

## Accomplishments that we're proud of
- Every item on every screen is grounded: one tap shows the exact Qloo calls (what was asked, with the
  favourites by name, what Qloo answered, and where this item sat in that answer).
- A real learning loop where Qloo, not our code, decides the order of the next session.
- An honest comparison: given the same facts, task and wording rules, the same AI without Qloo makes
  a reasonable plan, but 0 of its 6 items can show why (Memory Lane: 6 of 6 with Qloo evidence), and
  nothing checks its years (one song for Harjeet predates his years). Counted in code, on the page.
- "Try the learning yourself": judges can copy a demo persona, react, and watch session 2 planned live.
- Accessible, phone-first screens for older caregivers: large type, one-handed player, honest states.

## What we learned
Qloo is remarkably era- and culture-faithful when it is asked with the right signals for each domain;
the agent's job is choosing those signals well, checking every answer, and being honest about gaps.

## What's next
Multilingual prompts, a coordinator view for care homes,
accounts with device transfer, and pilots with care homes and memory cafés.

## Testing instructions
Open https://memory-lane-sable-rho.vercel.app → **Try a demo profile** → pick a persona → **Open
session 2: what it learned from session 1** → read "What changed since last time" and tap a green
"Qloo ·" chip to see the evidence. Then open **Generic AI vs Memory Lane** on the profile. To run the learning loop yourself: **Try the learning yourself** →
play session 1 and tap reactions → Finish → **Plan the next session**. To test the full agent: **Create
a profile** with 2–3 favourites. If Qloo's shared quota is used up, the app says so honestly and the
demo personas still work.
