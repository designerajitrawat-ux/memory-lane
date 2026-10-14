# 05 · Agent Design (the heart of the project)

## 1. Design principle
**"LLM proposes, Qloo decides, code verifies."**
- Claude (LLM) is good at language, empathy, structuring a session and proposing candidates.
- Qloo is the source of truth for *what culturally fits* (resolution, affinity, ranking, region).
- Deterministic code (validators) guarantees: every item has Qloo evidence, nothing violates the
  avoid-list, no personal data reaches Qloo.

This is a **hybrid orchestrator**: fixed stages (reliable, demo-safe) with an agentic tool-use
loop *inside* each stage (flexible, visibly agentic).

## 2. Stages
```mermaid
flowchart TD
  P[Profile + raw favourites] --> S1[Stage 1: Resolve seeds<br/>qloo_describe / qloo_find_tags]
  S1 -->|needs_input| H[Caregiver confirms candidates]
  H --> S2
  S1 -->|ok| S2[Stage 2: Build Life Taste Profile<br/>qloo_recommend cross-domain, qloo_find_tags era/genre,<br/>LLM-proposed candidates -> qloo_rank, qloo_where_popular]
  S2 --> S3[Stage 3: Compose session<br/>LLM structures 5-6 items + prompts]
  S3 --> V{Validators}
  V -->|fail| S3
  V -->|pass| R[Session player + reactions]
  R --> S4[Stage 4: Adapt<br/>liked -> new seeds -> qloo_recommend<br/>distressed -> avoid-list]
  S4 --> S3
```

### Stage 1 — Resolve seeds
- Input: raw favourites text + domain hints.
- Tools: `qloo_describe` for singers, films, TV and places (type from the wizard domain);
  `qloo_find_tags` for food and "something else" (dishes and interests are tags in Qloo, not entities).
- Output: per seed → `needs_input` with up to 5 stored candidates (each with an evidence id), or
  `unresolved` (nothing found, or refused by the PII guard). The caregiver then confirms **every** seed,
  single matches included: a single match is preselected, never auto-confirmed. "None of these" →
  `rejected`. No key / quota / outage → the seed stays `pending` and the UI says so; nothing is guessed.
  The run stops at the first failed lookup (the rest would most likely fail too and spend budget); that
  seed keeps the note `lookup_failed`. Stage 1 writes only touch seeds that are still `pending`.
- Rule: **never** use an unconfirmed seed downstream. UI shows candidates with name · type · year and
  Qloo's one-line description (what tells namesakes apart).
- Candidates (pinned against local recordings, 2026-10-13; `stage1/mapDescribe.ts`, `mapFindTags.ts`):
  describe returns a selected entity + "alternatives". Exact match → selected + same-name, same-type
  alternatives only (the rest is fuzzy noise, e.g. WALL·E for Mughal-e-Azam). Non-exact matches and
  **places** → all same-type alternatives (Phase 0: "Golden Temple" matched exactly to a temple in another
  city). find_tags → one candidate per distinct name; food keeps food tags only, preferring cuisine.
  The raw Qloo type URN is stored (`urn:entity:artist`, `urn:tag:cuisine:qloo`) so Stage 2 knows entity
  vs tag; labels ("film", "dish") are display only.

### Phase 0 findings that shape Stages 2–4 (details: docs/qloo-findings.md)
- Stage 2 calls Qloo with **confirmed entity IDs** (`signals`) and tag URNs (`signal_tags`), never names:
  bare names are ambiguous across types (needs_input).
- **No era filter exists** (decade tags match films *set* in an era; `demographic` age bands are dropped).
  Era comes from: artist→artist recommends (≈9/10 era-correct), a **code validator on `release_year`**
  against the person's window (≈ birth year + 5 … + 40) for films/TV, and `qloo_rank` of LLM-proposed
  candidates (era names rank first with a clear gap).
- Domain order by data quality: music (spine) → TV → film → places → food. Food items carry **tag
  evidence** (cuisine tags) and become conversation prompts, labelled honestly; tag-only place
  recommends are junk.
- Places: resolve named landmarks, then `filter_location` with a coarse city; `where_popular` returns only
  geohash cells, so it is not shown.
- Avoid-list validation must also read Qloo descriptions (some films touch war/trauma themes).
- The gateway runs ≤3 live calls at once (bursts of 8 hit a 429).

### Stage 2 — Life Taste Profile (built: `apps/agent/src/stage2/`)
A fixed, visible plan of up to 7 Qloo calls in parallel (≤3 at once), each domain asked with the
favourites that carry its taste (live check: a UK soap plus a UK singer bring British TV, while all
favourites together brought American dramas):
1. **Music** — `qloo_recommend` artist, signals = the confirmed singers (≤3; all seeds if there are none),
   `explain`. Singers whose Qloo description centres inside the reminiscence bump come first, unknown
   dates keep Qloo's order, mostly-later voices only fill in (`era.ts` `eraPlacement`).
2. **Films and TV** — `qloo_recommend` movie (film + TV favourites, plus the first singer) and tv_show
   (TV + film favourites, plus the first singer), limit 20: only `release_year` within birth +5 … +45,
   closest to the bump (birth +10 … +30) first; nothing set around illness or fear (medical/hospital
   dramas, horror).
3. **Places** — two `qloo_recommend` place calls with `filter_location` = the earliest life-stage region:
   one from their tastes (singers, films, TV — live check: a Liverpool band's fans found its famous
   venues and museum), one from the places they love; interleaved. Kept: lasting places
   (landmarks, markets, parks, the seaside, statues, venues Qloo describes by their decade), not hotels,
   bars, farm shops, festivals or "modern" venues, in the same country as most results, not sites of
   grief (read from the opening words). The town from Qloo's geocode makes map links specific.
4. **Food** — favourites (cuisine tags) + `qloo_find_tags` "<town> food" and "<region> food". Named
   dishes first (specialty dish, popular item, then cuisine); restaurant styles (bar, pub, café,
   diner, market food) and labels that only name the place or its people ("Punjabi", "British Food") are
   left out; variants of one dish count once (kulcha = naan; "X with Y" = X); at most 3 found dishes.
Every Qloo item is checked against the avoid-list first (name + Qloo's full description, with related
words for well-known painful topics: "Partition" also keeps out Wagah/1947/refugees) and a gentle filter
(atrocities, suicide, abuse), then the validators (grounding, avoid, language) before saving.
Captions use Qloo's own explanation: "People who enjoy X and Y often also enjoy Z." Up to 6 items per
domain; favourites first. Every step message is also saved with the version (`steps`) and shown as
"How Memory Lane built this".
**With the Claude key (next):** `propose_candidates` adds era-typical names per domain, which only
survive through `qloo_rank` / `qloo_describe` with evidence (Phase 0: rank pushes modern names down).

### Stage 3 — Compose session (built: `apps/agent/src/stage3/`)
- Code fills the template from the newest taste profile (`compose.ts`): favourites open, items from the
  last session rotate out, an empty domain becomes another song; Stage 4 weights (reactions) and the
  best-landing domain ("your choice") plug in here. Prompts come from gentle templates (`prompts.ts`),
  links from `links.ts`. With the Claude key the LLM writes warmer, item-specific prompts — still only
  for taste-profile items, and through the same validators.
- Validators (`validate.ts`): the item must be a taste-profile item carrying that item's evidence (an
  invented or re-badged entity is dropped), avoid-list (name + Qloo descriptions), language policy on
  `why`, links only to YouTube/Spotify/Google Maps search pages; memory-test prompts are replaced.
- Original plan (LLM-led): mostly LLM (structured JSON output, zod-validated) using ONLY items from the
  taste profile (plus learned seeds). It may NOT introduce new entities — if it wants one, it must go
  back through Qloo (tool call) to get evidence.
- Session template (20–30 min): opener song → film/TV memory → food & senses → place/journey →
  "your choice" (best-reacted domain) → closing song.
- Per item: `why` (1 sentence, aggregate wording, referencing evidence), 2–3 prompts (open,
  gentle, never quiz-like), `link_url` (YouTube/Spotify search URL built in code, not by LLM).

### Stage 4 — Adapt (built: `apps/agent/src/stage4/adapt.ts`, runs when the next session is planned)
- Weights: sang +2, engaged +1, neutral −0.5, distressed → never again (composer drops ≤ −1). The domain
  that landed best leads "your choice".
- For sang/engaged **entities** of the last session, ≤2 `qloo_recommend` calls (artists from songs, the
  same screen type from films/TV) with those exact ids as signals (server-vouched for the PII guard),
  then the Stage 2 filters (era, avoid incl. learned, gentle) and validators. Survivors join a new taste
  profile version as `source: "learned"` (+1).
- **Qloo decides the order:** ≤2 `qloo_rank` calls rank what is still to play in music and in that screen
  type (items not in the last session, plus the learned ones; ≤10 options) against what landed well.
  Qloo's top pick gets +1.5, the last 0, so the next session opens with what Qloo ranks highest; each
  ranked item also carries the rank call as evidence (the drawer shows both calls).
- Distressed items join the avoid-list (`source: "learned"`, owner-only reason). `what_changed`: 2–6 plain
  sentences ("X landed well, so Qloo was asked for more like that: …", "Qloo ranked the music still to
  play against what landed well; … lead.").
- Planning again while the newest session is still untouched returns that plan (no Qloo calls); a
  profile keeps at most 50 sessions.

Original plan:
- Inputs: reactions of the last session(s).
- `sang`/`engaged` items → become `learned` seeds → `qloo_recommend` for neighbours.
- `distressed` → avoid-list (entity + related tags), explained to caregiver.
- `neutral` → de-prioritise that sub-genre/domain.
- Output: `what_changed` (3 bullet sentences shown to caregiver) + next session.

## 3. Validators (code, run before anything is shown)
1. **Grounding:** every item has ≥1 `evidence_id` whose envelope status ∈ {ok, partial, degraded}
   and whose results contain that entity. Else reject → regenerate (max 2) → drop item.
2. **Avoid-list:** no item matches avoid entity IDs, avoid tags, or avoid keywords (case-insensitive).
3. **Language policy:** `why` text must use aggregate phrasing; block patterns like
   "she loved", "he will enjoy", "this will help his dementia", "treat", "cure", "therapy for".
4. **Prompt safety:** prompts must not ask test-like recall questions ("Do you remember…?" is
   discouraged → prefer "What was it like when…", "Tell me about…"). Lint with regex list.
5. **PII guard (pre-Qloo):** args contain no nickname, no exact addresses/emails/phones, no
   health terms. Implemented in `qloo/redact.ts`, unit-tested.

## 4. Prompts (starting drafts — keep in `apps/agent/src/agent/prompts.ts`)

### 4.1 System prompt — taste-profile stage
```
You are Memory Lane's cultural research agent. You help caregivers prepare personalised
reminiscence sessions for an older adult. You MUST ground every cultural item in Qloo tool results.

Rules:
- Use only public cultural signals with Qloo tools: confirmed seed entities, genre/era tags, coarse
  regions, decades, target entity types. Never send the person's nickname or any health detail.
- You may propose candidate entities from your own knowledge ONLY via the propose_candidates tool;
  candidates are worthless until resolved (qloo_describe) and ranked (qloo_rank) or found via
  qloo_recommend.
- If a tool returns needs_input, stop and return the candidates for the caregiver.
- If a tool returns empty, refine once; then move on. Never fill gaps with unverified items.
- Respect the avoid-list absolutely.
- Aim for 4 domains (music, film_tv, food, places) x 4-6 items. Stop when done or budget is hit.
- Final answer: JSON matching TasteProfileSchema with evidence_ids for every item.
```

### 4.2 System prompt — compose stage
```
You are Memory Lane's session designer. Build one 20-30 minute reminiscence session from the
provided Taste Profile items only. You cannot add new entities.

Write with warmth and dignity. Prompts are open, gentle invitations ("Tell me about...", "What was it
like when..."), never memory tests. Captions use aggregate language ("People who grew up with X often
enjoyed Y"), never claims about this person. Never mention treatment, therapy outcomes, or dementia
severity. Follow the session template. Output JSON matching SessionPlanSchema.
```

### 4.3 Baseline prompt (for "Without Qloo" compare — same model, NO tools)
```
Plan a 20-30 minute reminiscence session (5-6 items: songs, films, food, places) for an older adult
born in {birth_year}, who lived in {regions}, speaks {languages}, and liked {seed names}.
Return JSON matching SessionPlanSchema (no evidence fields).
```
Compare view shows: items side by side, **grounded count** (baseline = 0 evidence), and an
"overlap with other personas" metric (genericness) computed in code.

## 5. Tool definitions (our own app tools exposed to Claude)
| Tool | Input | Output |
|---|---|---|
| `propose_candidates` | `{domain, rationale, names: string[] (≤10)}` | echo list with ids `cand_*` (no data) — forces next step to resolve |
| `get_profile_context` | `{}` | birth decade, coarse regions, languages, confirmed seeds, avoid-list (no nickname) |
| `get_reaction_history` | `{last_n_sessions}` | items + reactions |

Qloo tools are passed through from `listTools()` but **filtered** by the gateway allow-list per stage.

## 6. Budgets & reliability
- Per stage: max tool calls (Stage 2: 12, Stage 4: 6), max LLM tokens, wall clock 60 s.
- On budget hit → return best partial result + note "partial" (never crash).
- Use Claude **prompt caching** for system prompts + tool definitions.
- Record/replay: in tests, a fake MCP client (`qloo/fixtureMcp.ts`) feeds the real gateway synthetic
  envelopes from `apps/agent/test/fixtures/synthetic/` (committed). Real recordings live only locally in gitignored `apps/agent/test/fixtures/recorded/`, because
  Qloo's guide forbids storing Qloo response data in a public repository.

## 7. What judges should notice (call out in README)
1. Real tool chain (resolve → confirm → recommend/rank → compose → validate → adapt).
2. Human-in-the-loop on ambiguity (`needs_input`).
3. Evidence on every item + compare view.
4. Learning loop across sessions.
5. Responsible data handling (no PII to Qloo, aggregate language).
