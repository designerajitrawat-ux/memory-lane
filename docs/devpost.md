# Devpost submission text (ready to paste)

**Project name:** Memory Lane
**Tagline:** Reminiscence sessions, personal to them — every song, film, dish and place grounded in
Qloo's taste graph, and Qloo decides what comes next.
**Demo:** https://memory-lane-sable-rho.vercel.app (no login: "Try a demo profile")
**Repo:** https://github.com/designerajitrawat-ux/memory-lane
**Built by:** Ajit Rawat (solo)
**Built with:** qloo, qloo-mcp, openai, typescript, next.js, react, tailwindcss, fastify, node.js,
postgresql, neon, drizzle-orm, zod, vercel, render, docker, vitest

## Inspiration
Reminiscence and personalised music are part of everyday dementia care, and the research shows small
but real benefits for quality of life and communication. The hard part is never the idea; it is
preparation: finding the songs, films, food and places of *this* person's youth, in *their* culture,
every week. Generic playlists drift to the same Western "greatest hits", and a generic AI answer can't
show why an item fits or check its years. I wanted an agent that does the preparation honestly, with
evidence for every suggestion.

## What it does
1. A caregiver adds a few public favourites (a singer, a film, a dish, a place), where the person grew
   up (town level) and anything to avoid. No personal details.
2. The agent matches each favourite in Qloo; when there are several matches, the caregiver picks one.
3. It builds a Life Taste Profile with Qloo, domain by domain: singers from the singers they love,
   films and TV from their films and shows (kept to their era), places in and around where they grew
   up, and dishes from Qloo's food tags. When Qloo leaves a gap, an AI model proposes era-typical
   names that count only once Qloo matches and ranks them. Every item carries the Qloo call behind it
   and shows Qloo's own picture (the singer, the film poster, the place).
4. It plans a 25-minute session (opening song, a film or TV memory, food, a place, "your choice",
   closing song): familiar favourites first, then what Qloo found, with gentle prompts written by the
   AI about each item in particular and checked in code (they invite, never test), and links to
   YouTube, Spotify or Maps. A one-item-at-a-time player shows the picture to look at together.
5. The caregiver taps how each item landed. Next time, Qloo is asked for more like what they sang along
   to, `qloo_rank` orders everything still to play against it, anything upsetting never returns, and
   the plan explains what changed.

## How we built it
- **Agent stages:** Stage 1 match (`qloo_describe`, `qloo_find_tags`, caregiver confirms) → Stage 2
  Life Taste Profile (`qloo_recommend` per domain with `explain`, places with `filter_location`, food
  tags for town and region, `qloo_rank` to decide which AI proposals count) → Stage 3 session
  (template, prompts, links built in code) → Stage 4 learn (`qloo_recommend` more like what landed,
  `qloo_rank` for what comes next, learned avoid-list).
- **Qloo decides, code verifies:** validators drop anything without Qloo evidence, anything on the
  avoid-list (reading Qloo's own descriptions, with related words for painful topics), wording that
  makes claims about the person, memory-test prompts, prompts two items share, and links outside
  allowed search pages.
- **Qloo access:** only through `qloo mcp` from the agent service, behind a gateway with an allow-list,
  strict argument schemas, a personal-data guard, caching, budgets and an evidence record per call.
  Qloo's item pictures are allow-listed and served through the web app's image optimizer.
- **The AI model** (OpenAI `gpt-6-luna`, structured outputs) proposes names for gaps, writes prompts
  for items already chosen, and plays the "generic AI" in the comparison; it never decides what's in
  a session, and it only ever sees public facts. Its spend is capped per day, device and network.
- **Stack:** Next.js 16 on Vercel, a Fastify agent in Docker on Render, Postgres on Neon, zod schemas
  shared by both. 200+ tests on synthetic Qloo envelopes and a fake AI; no Qloo data in the public repo.

## Challenges we ran into
- **Era without a decade filter.** Qloo has no release-year filter in the MCP tools, so films and TV
  are kept to the person's years by `release_year` in code, singers are ordered by the decades Qloo's
  descriptions mention, and `qloo_rank` pushes later names down.
- **Asking the right question per domain.** With all favourites at once, a UK persona got American
  dramas; asking TV with her TV favourite and singer brought British soaps, and asking places near
  Liverpool with her singers found the city's music landmarks.
- **AI proposals need Qloo to decide.** The model's TV suggestions for an Indian childhood were good
  ("Ramayan", "Mahabharat"), but Qloo knows several shows by those names; the agent picks each title's
  entity from the person's years before asking Qloo to rank them.
- **Places and food near a town are mostly businesses.** Only lasting landmarks are kept (not hotels,
  bars or new venues), and only named dishes (restaurant styles and "Punjabi"-style labels are left
  out); when nothing is left, the profile says so instead of guessing.
- **A fair comparison.** A first generic-AI baseline only handed back the favourites; asked for the same
  task with the same wording rules, it makes a reasonable plan, so the page now counts what really
  differs: evidence, years and checks.

## Accomplishments that we're proud of
- Every item on every screen is grounded: one tap shows the exact Qloo calls (what was asked, with the
  favourites by name, what Qloo answered, and where this item sat in that answer), with Qloo's picture.
- A real learning loop where Qloo, not our code, decides the order of the next session.
- An honest comparison: given the same facts, task and wording rules, the same AI without Qloo makes
  a reasonable plan, but 0 of its 6 items can show why (Memory Lane: 6 of 6 with Qloo evidence), and
  nothing checks its years (one song for Harjeet predates his years). Counted in code, on the page.
- "Try the learning yourself": judges can copy a demo persona, react, and watch session 2 planned live.
- Accessible screens for older caregivers: phone-first with large type and a one-handed player, wide
  layouts on laptops, a colour button (Auto / Light / Dark), honest states; Lighthouse accessibility 100.

## Who it's for, and how it grows
Families caring for a parent at home, and care homes and day centres where activity coordinators run
reminiscence for many residents. Families: a free tier with a few sessions a month, paid for unlimited
sessions and sharing with siblings or carers. Care homes: a per-resident subscription with a
coordinator view. Channels: dementia-care associations, care-home groups and memory cafés.

## What we learned
Qloo is remarkably era- and culture-faithful when it is asked with the right signals for each domain;
the agent's job is choosing those signals well, checking every answer, and being honest about gaps.

## Known limitations
Qloo describes what groups enjoy, not what one person will like; "songs" are singers and bands (the
link searches their songs from the decade they're remembered for); places aren't dated, so a few
landmarks are newer; food is lighter than music; one model run per profile in the comparison.
Reminiscence is an activity, not medical care.

## What's next
Multilingual prompts (Hindi and Punjabi for the India persona), a coordinator view for care homes,
accounts with device transfer, and pilots with care homes and memory cafés.

## Testing instructions
Open https://memory-lane-sable-rho.vercel.app → **Try a demo profile** → pick a persona → **Open
session 2: what it learned from session 1** → read "What changed since last time" and tap a green
"Qloo ·" chip to see the evidence. Then open **Generic AI vs Memory Lane** on the profile. To run the
learning loop yourself: **Try the learning yourself** → play session 1 and tap reactions → Finish →
**Plan the next session**. To test the full agent: **Create a profile** with 2–3 favourites. If Qloo's
shared quota is used up, the app says so honestly and the demo personas still work.
