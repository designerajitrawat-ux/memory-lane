# 01 · Product Spec: Memory Lane

## 1. One-liner
**Memory Lane is an AI agent that plans personalised reminiscence sessions (music, films, food, places, and
conversation prompts) for older adults living with memory loss. Every suggestion is grounded in Qloo's taste
graph instead of an LLM's guess, and each session learns from how the person actually responded.**

## 2. Problem
- Reminiscence and personalised music are among the most widely used non-drug approaches in dementia care.
  They work best when the material is **personal**: the songs, films, food, and places of that person's own
  youth, region, and culture. See `02-research-evidence.md`.
- Finding that material is hard:
  - **Family caregivers** know a few favourites but not the wider cultural world of a parent's youth, for
    example a father who grew up in 1960s Amritsar.
  - **Care-home activity staff** run sessions for dozens of residents from very different backgrounds, often
    with one generic playlist.
  - People with memory loss often **cannot tell you** what they used to love.
- Generic AI makes this worse in a quiet way. It suggests the most famous, most average items, the same
  "greatest hits" for everyone, and it cannot show why it chose them.

## 3. Why Qloo is essential (the differentiator)
Without Qloo, an LLM produces plausible but generic lists with no evidence. With Qloo, Memory Lane can:
1. **Resolve** the few known favourites to real entities (`qloo_describe`, `qloo_find_tags`) and confirm them
   with the caregiver.
2. **Expand across domains.** From "loved Mohammed Rafi and Mughal-e-Azam", Qloo cross-domain affinity finds
   related music, films, dishes, and places that the caregiver did not know to ask about (`qloo_recommend`).
3. **Rank candidates for an audience.** Era-plausible candidates proposed by the LLM are ranked by Qloo for
   the relevant demographic and taste signals (`qloo_rank`). The LLM proposes and Qloo decides.
4. **Add regional grounding** (`qloo_where_popular`, `qloo_audience_demographics`).
5. **Show evidence.** Every item in a session carries a chip linking it to the Qloo call that produced it.
6. **Learn.** Positive reactions become new Qloo seeds and distressing items are excluded, so the next session
   changes for a reason the app can explain.

The app includes a **"Without Qloo" comparison** so judges can see the difference directly.

## 4. Users and personas
| Persona | Who | Goal | Pain |
|---|---|---|---|
| **Priya, family caregiver** (primary) | 42, lives in Pune, father (76) has early Alzheimer's | Meaningful 20 minutes a day with Dad | Doesn't know what to play or talk about, and conversations stall |
| **Mark, activity coordinator** (secondary, the buyer) | Care home in Ohio, 30 residents | Personalised activities for each resident, plus documentation | No time to research 30 life histories |
| **The person** (beneficiary) | Older adult with memory loss | Feel recognised, comfortable, connected | Generic activities feel childish or alien |

## 5. Scope

### MVP (must ship; judges must see all of it)
1. **Landing page** with a one-tap **"Try a demo profile"** path. Judges must reach value in under 30 seconds
   without signing up.
2. **Profile wizard** in 4 short steps:
   - basics: nickname, birth year, languages
   - places: country and region per life stage (coarse only)
   - favourites: 1–10 known items across music, film, food, and places (most people know 1–5)
   - avoid-list: topics, songs, or eras to avoid
3. **Seed confirmation.** The agent resolves favourites through Qloo. Ambiguous matches (`needs_input`) are
   shown as candidates for the caregiver to pick from.
4. **Life Taste Profile.** Cards per domain (Music, Film & TV, Food, Places), each item with an evidence chip
   and an aggregate-language caption.
5. **Session plan.** A 20–30 minute plan of 5–6 items. Each item has a title, why it's included (the
   evidence), 2–3 gentle conversation prompts, and an external listen/watch link. A sensory tip such as
   "make chai while this plays" is optional.
6. **Session player.** Large-type, one item per screen, with reaction buttons (😊 engaged · 🎵 smiled or
   sang · 😐 neutral · 😟 distressed), an optional note, and next/skip.
7. **Adaptation.** After a session the agent summarises what it learned and what changes next time, then
   generates the next session.
8. **"With vs Without Qloo" compare view** for the same profile.
9. **How it works** page covering the Qloo tools used, the evidence model, limitations, and safety.
10. **Agent activity stream.** While the agent works, the UI shows live steps such as
    "Resolving 'Mohammed Rafi' in Qloo… ✓". This makes the agentic behaviour visible.

### Stretch (only after MVP is polished)
- Printable or shareable **Session Card PDF** for care-home staff.
- **Multi-resident view** for coordinators: a list of residents with each one's next session.
- **Family contribution link**: relatives add favourites to a profile.
- Hindi and Spanish UI. Content language follows the profile.
- Text-to-speech for prompts.

### Explicit non-goals
- No diagnosis, symptom tracking, medication, or clinical claims.
- No hosting or streaming of copyrighted media. We link out to YouTube or Spotify search.
- No collection of real patient identity data.
- No native mobile app. A responsive web app is enough.

## 6. Key user stories with acceptance criteria
| # | Story | Acceptance criteria |
|---|---|---|
| US1 | As a judge, I can try the product instantly | The landing page has a "Try a demo" button. A seeded profile opens with a ready Taste Profile and session in under 3 s from cache. |
| US2 | As a caregiver, I can create a profile in under 3 minutes | The 4-step wizard validates input and stores nothing beyond a nickname. |
| US3 | As a caregiver, I confirm what the agent understood | Ambiguous Qloo matches show candidates. Nothing unconfirmed is used as a seed. |
| US4 | As a caregiver, I can see why each item was suggested | Every item has an evidence chip that opens the tool, inputs (redacted), status, and summary. |
| US5 | As a caregiver, I run a session on my phone | Player is usable one-handed, with fonts ≥ 18 px and tap targets ≥ 48 px. |
| US6 | As a caregiver, the next session reflects reactions | Session 2 differs from session 1 in explainable ways, and the agent's "What I changed" note lists them. |
| US7 | As a judge, I see what Qloo adds | The compare view shows both plans side by side, with grounded-item counts and specificity notes. |
| US8 | As anyone, I'm never misled | Disclaimer present, aggregate wording used, and no item violates the avoid-list (enforced by a validator). |

## 7. Success metrics (for the pitch)
- **Grounding rate:** 100% of session items backed by at least one Qloo evidence record. Enforced in code.
- **Specificity:** with Qloo, fewer items repeat across different personas than without Qloo. Measure this
  on the demo personas and put the number in the README.
- **Adaptation:** share of items in session 2 derived from positive reactions in session 1.
- **Pilot signals:** quotes from caregiver interviews (see `docs/research/caregiver-interview-guide.md`).

## 8. Business model (for the pitch)
- **Families:** free tier with a limited number of sessions per month, and a paid tier for unlimited sessions
  plus family sharing.
- **Care homes and assisted living (the main buyer):** per-resident monthly subscription with a coordinator
  dashboard, printable session cards, and activity documentation that helps with care-quality reporting.
- **Channels:** dementia-care associations, care-home groups, and day-care centres.
- **Why now:** ageing populations, agentic AI, and Qloo's taste graph now accessible to developers.
- Before quoting any market-size figure in the README, find a sourced statistic (for example WHO or
  Alzheimer's Disease International) and cite it. Never invent numbers.

## 9. Naming note
"Memory Lane" is a common phrase and other products may use it. It is fine for a hackathon. If the team
wants to be distinctive, alternatives include *Tuneback*, *Yaadein*, *Then & Now*, and *Recall Room*.
Decide once, early, and use the name consistently in UI, repo, and Devpost.
