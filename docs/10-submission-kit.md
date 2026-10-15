# 10 · Submission Kit

## 1. Final checklist (all must be ✓)
- [ ] Live demo URL works end to end on desktop + phone, no login needed (demo personas)
- [ ] App stays live & free until ≥ Nov 17, 2026; uptime monitor on
- [ ] Public GitHub repo; MIT LICENSE shown in repo **About** section
- [ ] README complete (template below), English, with screenshots + architecture diagram
- [ ] Setup from a fresh clone tested by following only the README (`.env.example` lists every variable)
- [ ] No secrets in repo/history/bundle/screenshots (`security-reviewer` clean)
- [ ] Devpost: description, built-with tags, demo URL, repo URL, testing instructions, images
- [ ] Known limitations + Qloo tools used + redacted request-to-result example included (request shape, status,
  entity names only — no raw Qloo response payload in the public repo, per Qloo's developer guide)
- [ ] Kit `docs/SUBMISSION.md` covered: the request-to-result example explains our **entity and tag choices**
  (e.g. several Qloo matches for one favourite → the caregiver picked one on the confirm screen); known
  limitations say **what the results do not establish** (aggregate affinities, not facts about this person;
  no clinical effect); setup works from a clean environment (incl. `dev:fixtures` without a key)
- [ ] Screenshots and demo show demo personas only: no credentials, no personal data, and never taken in
  `dev:fixtures` mode (synthetic answers would look Qloo-confirmed)
- [ ] Submitted by **Oct 29 IST** (deadline Oct 30, 11:45 pm EDT = Oct 31, 9:15 am IST)

## 2. README template
```markdown
# Memory Lane — reminiscence sessions, personal to them
> Qloo Agentic Hackathon 2026 · Live demo: <URL> · No login needed: tap "Try a demo profile".

![hero screenshot](docs/screenshots/hero.png)

## The problem
<3–4 sentences: reminiscence & personalised music are widely used in dementia care; the
barrier is finding material that is truly personal; generic AI gives generic "greatest hits".
Cite docs/02 sources. Add 1–2 caregiver quotes.>

## What Memory Lane does
1. Caregiver adds a few known favourites (no personal data).
2. The agent resolves them in Qloo, asks to confirm ambiguous matches.
3. Builds a Life Taste Profile across music, film/TV, food, places — every item with Qloo evidence.
4. Plans a 20–30 min session with gentle prompts; caregiver logs reactions.
5. The agent learns and explains what it changed for the next session.

## Why it needs Qloo (with vs without)
<compare screenshot + numbers: grounded items 100% vs 0%; genericness metric across personas>

## How the agent works
<mermaid diagram from docs/05; list of Qloo MCP tools used and why each fits>

### Redacted request → result example
<one real qloo_calls record: tool, args, status, 3 results → how it became a session item>

## Tech stack & architecture
<diagram from docs/04; stack table>

## Responsible by design
<no PII to Qloo, aggregate wording, avoid-list, not a medical device>

## Run it yourself
<prereqs, env vars, commands, harness install, `qloo setup`, deploy notes>

## Known limitations
<from docs/07 §5 + findings; include what the results do not establish: Qloo describes what groups tend
to like, not what this person remembers or will enjoy; no claim of clinical benefit>

## Business model & what's next
<families freemium, care homes per-resident; roadmap>

## Notes for Qloo
<issues/feedback filed on the hackathon kit>

## Author · License (MIT)
```

## 3. Devpost text template
- **Inspiration:** caregiver story (from interviews) + the generic-AI problem.
- **What it does:** 5 steps above, 1 line each.
- **How we built it:** agent stages, Qloo MCP tools, validators, stack.
- **Challenges:** e.g. era fit without decade filter (our LLM-proposes/Qloo-ranks approach).
- **Accomplishments:** 100% grounded items, learning loop, accessibility.
- **What we learned / What's next:** pilots with care homes, multilingual, coordinator dashboard.
- **Testing instructions:** "Open <URL> → Try a demo profile → open Session 2 to see adaptation →
  Compare tab. To test live agent: Create profile → add 2–3 favourites." Mention quota fallback.

## 4. Screenshots to capture (desktop + phone)
Screenshots show the app as a visitor sees it, including Qloo's item pictures as the app displays them
(like the item names and captions); no raw Qloo responses, URLs or image files are committed.
hero/landing · demo picker · wizard step 3 · confirm matches (needs_input) · agent stream ·
Life Taste Profile with evidence drawer open · session plan · player with reactions ·
session summary "What I changed" · compare view · how it works.
