# Qloo Findings (Phase 0 and later)

Fill one block per question. Never paste keys. Keep raw results short (3-5 notable items).
This file is in a PUBLIC repo: Qloo response data must not be stored here. Only request shapes (with
`<placeholders>`), statuses, counts, ratings and a few entity/tag NAMES. No IDs, scores, descriptions, payloads.

Phase 0 run: 2026-10-13, via the qloo MCP tools. About 41 live calls in total (7 earlier + about 34 in this run,
including one 429 rate-limit and three calls rejected locally before reaching Qloo). Bursts of 8 parallel calls
triggered a 429, so Stage 2 must throttle.

## Summary (update after Phase 0)
- Era strategy that works: Era comes from SEEDS plus the artist target type, then a CODE filter. There is no
  year filter anywhere. (1) Artist-to-artist `recommend` from confirmed artist IDs is strongly era-correct
  (about 9/10 results from the right decades for US country, Bollywood playback and Merseybeat/British Invasion).
  (2) `qloo_rank` on an LLM-proposed candidate list pulls modern names to the bottom with a clear score gap
  (Patsy Cline test: all era artists first, modern pop last). (3) Movie and TV targets skew modern (1 of 10
  pre-1970 for the Rafi + Mughal-e-Azam seed, 1 of 10 for the Patsy/Sound of Music/I Love Lucy seed), so use
  them only with a code-side `release_year` check against the persona's window (roughly 1945-1985 plus
  "set in the era" flagged as not era-made). (4) Tags do NOT fix this: era tags such as "1960s" match films SET
  in the 1960s but MADE in the 2000s; a "classic Bollywood" style tag as a movie filter returned 0 results.
- Region strategy that works: Local-language and local-culture seeds do the work (Rafi seeds returned Hindi
  cinema only; Cilla Black + Coronation Street returned British soaps only). `filter_location` with a coarse
  city name works for places (Blackpool returned seaside attractions). `signal_location` is required whenever
  `demographic` is used. `where_popular` works but returns only lat/long/geohash cells with no place names, so
  it is not usable as a user-facing region signal without reverse geocoding.
- Entity types available & useful: `artist` (best), `place` (good for named landmarks with a location filter),
  `tv_show` (OK for British soaps; metadata years are sometimes inconsistent), `movie` (works but modern-skewed),
  plus `book`, `brand`, `person`, `podcast`, `videogame` in the schema (not tested). There is NO `destination`
  or dish entity type; the recommend/rank target enum is only artist, book, brand, movie, person, place,
  podcast, tv_show, videogame. Dishes exist only as tags (cuisine, popular_food_item, specialty_dish).
  `describe` additionally accepts locality, actor, album, author, director.
- Weak spots / coverage gaps: (a) no era/decade filter; (b) tag-only signals for food return junk (hotels,
  hostels, banquet halls, all with identical affinity); (c) demographic "55 and older" was reduced to a gender
  signal only (the age band was dropped) and made results worse, so do not use demographics; (d) movie results
  can include avoid-list themes (a Beatles musical set amid 1960s anti-war protests, institution/trauma dramas)
  so the avoid-list validator needs description-level checks, not just title matching; (e) "Golden Temple" and
  bare "Blackpool" resolve wrongly or ambiguously; (f) recommend with a bare name is ambiguous across types
  (needs_input), IDs are required; (g) 429 on parallel bursts; (h) `release_year` is absent for artists and
  sometimes disagrees with `release_date` for TV; (i) entity_tags output is noisy (unrelated language and
  ethnicity tags), so do not treat entity tags as clean descriptors.
- Persona changes needed: Persona B place seed "Golden Temple" must be stored as "Sri Harmandir Sahib" and
  disambiguated to a specific candidate (five near-duplicate Amritsar entries). Persona C place seed should be
  "The Blackpool Tower" (or Blackpool Promenade), not "Blackpool". Persona A "Elvis Presley" resolves fine
  (seen as a recommendation). Food seeds (pot roast, sarson da saag, fish and chips) have no entity type; keep
  them as content from the LLM linked to a Qloo cuisine tag or to a named restaurant place, and label it honestly.
  Persona A needs a movie/TV validator because Qloo's movie suggestions skew modern.

Persona gate (Phase 0): Persona C (UK) rich and sensible for music, TV and places; Persona A (US) rich and
sensible for music, weaker for film (needs filtering); Persona B (India) rich and sensible for music, film
suggestions are culturally right but mostly post-2000. Verdict: PASS (3 of 3 usable for music and places; 2 of 3
strong overall: A and C; B needs the release_year filter and place disambiguation).

---
## Q1 — Argument shapes for recommend / rank / where_popular / entity_tags / audience_demographics
- Surface: mcp (`qloo_capabilities`, free, no quota)
- Tool + args (redacted): `qloo_capabilities {}`; then live calls below for behavior
- Status / result_count: `ok` / n/a (schema only), plus live confirmation in Q2-Q6
- Notable results:
  - `qloo_recommend`: `{target_type, signals[] (<=10 names or entity UUIDs), signal_tags[] (+ signal_tags_operator),
    signal_location, demographic, filter_location, include_tags[] / exclude_tags[] (+ operators), explain, limit (1-20)}`.
  - Signals accept entity UUIDs (confirmed: `match: identifier`, mixed types in one call work, e.g. artist + movie
    + tv_show as signals for a movie target) and tag URNs go in `signal_tags` / `include_tags`.
  - target_type enum: artist, book, brand, movie, person, place, podcast, tv_show, videogame. No destination, no dish.
  - `limit` max 20, 10 returned when asked for 10. Movies/TV return description, release_year, release_date,
    content_rating, duration; artists return only a short description (no year); places return description,
    address, geocode, rating.
  - `include_tags` / `exclude_tags` alone are not enough: at least one signal (entity, tag, location, or
    demographic) is required (call returned needs_input with 0 live latency).
  - `demographic` accepts only phrases it can map to Qloo age or gender signals; "people 75 and older" was
    rejected locally; "women 55 and older" was accepted but only the gender part was applied, and it requires
    `signal_location`.
  - `qloo_rank`: `{options[] (<=10 names or UUIDs), option_type, signals[], signal_location, demographic,
    include_tags[], exclude_tags[]}`. Named options are resolved internally (exact match used).
  - `qloo_where_popular`: `{entity, entity_type, within, limit}`.
  - `qloo_entity_tags`: `{entities[], entity_type, limit}`; `qloo_audience_demographics`: `{entity, entity_type, limit}`
    (not called, to save quota).
- Quality (1-5): 4 (clear schemas; demographic mapping is the weak part)
- Implication for product: Stage 2 should always send resolved UUIDs in `signals`, never bare names. Do not use
  `demographic` for age. Treat `limit` 10-20 as the normal range.

## Q2 — Cross-domain from confirmed seeds, per persona
- Surface: mcp
- Tool + args (redacted), all with `explain:false` unless noted:
  1. `qloo_describe {entity:"<seed name>", type:"artist|movie|tv_show"}` for Patsy Cline, Cilla Black, The Beatles,
     The Sound of Music, I Love Lucy, Coronation Street, Mohammed Rafi, Mughal-e-Azam (8 calls, 1 rate-limited then retried)
  2. `qloo_recommend {target_type:"movie", signals:["<artist id>","<movie id>"], explain:true, limit:10}` (B)
  3. `qloo_recommend {target_type:"movie", signals:["<artist id>","<movie id>","<tv_show id>"], limit:10}` (A)
  4. `qloo_recommend {target_type:"artist", signals:["<artist id>"], limit:10}` (A and B, 2 calls)
  5. `qloo_recommend {target_type:"tv_show", signals:["<artist id>","<tv_show id>"], limit:10}` (C)
  6. `qloo_recommend {target_type:"artist", signals:["<artist id>","<artist id>"], limit:10}` (C)
- Status / result_count: all `ok`, 10 results each; all seeds resolved `exact` with a type
- Notable results:
  - Resolve: Patsy Cline, Cilla Black, The Beatles, Mohammed Rafi (artist), The Sound of Music (1965 movie),
    I Love Lucy (1951 tv_show), Coronation Street (1960 tv_show), Mughal-e-Azam (1960 movie) all exact. Alternatives are
    fuzzy noise (tribute bands, other "Black"/"Cline" artists), so check `match: exact` and name equality.
  - A artist-to-artist: Tammy Wynette, Roger Miller, Loretta Lynn, Conway Twitty, George Jones, Jim Reeves
    (about 10/10 era-appropriate). Rating 5.
  - C artist-to-artist (Beatles + Cilla Black): Roy Orbison, The Hollies, The Searchers, Gerry & The Pacemakers,
    Elvis Presley (about 10/10 era-appropriate, includes Merseybeat acts). Rating 5.
  - B artist-to-artist (Rafi): Lata Mangeshkar, Kishore Kumar, Asha Bhosle, Manna Dey, Hemant Kumar
    (about 7/10 classic era; others are later playback singers). Rating 4.
  - C artist-to-tv_show (Cilla Black + Coronation Street): EastEnders, The Bill, Emmerdale Farm, Neighbours, Holby City
    (British/Australian soaps; culturally right, but most are 1980s+ and several are crime/medical dramas). Rating 3.
  - B artist+movie-to-movie: Guide (1965) is the only pre-1970 film; the rest are 2001-2019 Bollywood
    (Masaan, Bajirao Mastani, Jodhaa Akbar, Raazi). Culturally right, era skewed modern. Rating 3. Raazi's premise
    is a war setting, so an avoid-list check is needed for this kind of item.
  - A mixed-seed-to-movie: Breakfast at Tiffany's (1961) is the only pre-1970 title; others are 1980s-2000s dramas
    and musicals (Rent, Moulin Rouge!, Sophie's Choice). Some are dark/heavy. Rating 2.
  - `explain:true` adds a per-result `explainability` block naming which seed signals contributed (usable as
    `evidence`, e.g. "because you like X and Y").
- Quality (1-5): music 5, TV 3, film 2-3
- Implication for product: Music is the strongest, most era-faithful domain, so make it the demo spine. Film/TV
  suggestions need a code-side `release_year` window plus an avoid-list description check. Use `explain:true`
  once per final candidate set to get seed attribution for the caregiver-facing "why".

## Q3 — Era strategy: tags and demographic
- Surface: mcp
- Tool + args (redacted):
  1. `qloo_find_tags {query:"1960s", limit:8}`
  2. `qloo_find_tags {query:"classic Bollywood golden age", limit:8}`
  3. `qloo_recommend {target_type:"movie", signals:[<seed ids>], include_tags:["<classic bollywood style tag urn>"]}`
  4. `qloo_recommend {target_type:"movie", signals:[<seed ids>], signal_tags:["<1960s keyword tag urn>"]}`
  5. `qloo_recommend {..., demographic:"people 75 and older"}` and `{..., demographic:"women 55 and older", signal_location:"United States"}`
  6. `qloo_rank {options:["<6 artist names, 4 era + 2 modern>"], option_type:"artist", signals:["<artist id>"]}`
  7. `qloo_entity_tags {entities:["<movie id>"], limit:15}`
- Status / result_count: find_tags `ok`/8 each; tag filter `ok`/0; signal tag `ok`/10; demographic 75+ `needs_input`
  (not mapped); demographic 55+ `ok`/10; rank `ok`/6; entity_tags `ok`/15
- Notable results:
  - Era tags exist: "1960s" (keyword:qloo, keyword:media), "60s" (genre, subgenre), "1960s Culture", "1960s America";
    "Classic Bollywood" (style, subgenre, interests), "Nostalgic Bollywood", "Classic Hindi Cinema". Rating 4 for coverage.
  - Using the classic-Bollywood style tag as `include_tags` on a movie target returned 0 results (tag type not
    attached to movies as a filter). Using "1960s" as `signal_tags` returned movies SET in the 1960s but made
    1999-2010 (Across the Universe, An Education, Taking Woodstock, Nowhere Boy). Tags describe setting, not
    release era. Rating 2 for era control. Also note the operator defaults to intersection.
  - Demographic: 75+ unsupported; "55 and older" dropped the age and kept gender; results became all 2018-2021
    films. Rating 1. Do not use. It also pushes a personal attribute (gender/age) at Qloo, which conflicts with
    the privacy rule in spirit.
  - `qloo_rank`: ranked the three era country artists and Loretta Lynn at the top with high affinity and the two
    modern pop acts at the bottom with a clearly lower score (gap about 0.15-0.2). A modern country act ranked in
    the middle. Rating 5 for filtering anachronisms, as long as scores are compared only within one call.
  - entity_tags for a classic film returned some noisy unrelated tags (language and ethnicity); descriptive tags
    were historical drama, regal, sumptuous, tragic love story. Rating 3.
- Quality (1-5): 3 overall (tags exist but do not control era; rank does)
- Implication for product: Stage 2 era handling = seeds + artist-first + LLM proposes era-plausible candidates +
  `qloo_rank` to confirm + code `release_year` window for movie/TV. Do not rely on decade tags or demographics.

## Q4 — Food: can tags drive anything useful? Is there a dish entity type?
- Surface: mcp
- Tool + args (redacted): `qloo_recommend {target_type:"place", signal_tags:["Punjabi cuisine"], filter_location:"Delhi"}` then
  `qloo_recommend {target_type:"place", signal_tags:["<cuisine tag urn>"], filter_location:"Delhi", limit:8}`;
  plus `qloo_recommend {target_type:"place", include_tags:["<cuisine tag urn>"], filter_location:"Delhi"}`.
  Earlier findings (not repeated): "butter chicken" has cuisine, popular_food_item, specialty_dish tags; as an entity
  it resolves to a restaurant.
- Status / result_count: name-based tag `needs_input` (ambiguous: interests-tag vs cuisine-tag); URN-based `ok`/8;
  include_tags-only `needs_input` (no signal)
- Notable results:
  - A cuisine tag as the only signal returned unrelated places (budget hotels, a hostel, a park, banquet hall,
    a cafe); every result had the same affinity value, i.e. no real ranking. Rating 1.
  - Bare tag names must be disambiguated to a URN, or Qloo asks for a choice.
  - No dish entity type exists in the target enum.
  - Not yet tested (budget): cuisine tag plus a restaurant seed entity, or tag as `include_tags` alongside a
    location-only signal. It may work better, but unconfirmed.
- Quality (1-5): 1 for tag-only food-to-place; 2 for food overall
- Implication for product: Treat food as a LABEL, not a Qloo-recommended item. Proposed approach: LLM picks a
  dish name from the seed's cuisine; Stage 2 resolves a cuisine/food tag URN via `find_tags` and records it as
  evidence of grounding; optional "where to eat it" uses a named restaurant place seed plus `filter_location`.
  The UI must say the dish is a conversation prompt tied to a cuisine tag, not a Qloo dish recommendation. Update
  docs/05 so food items require a tag evidence id, not an entity evidence id.

## Q5 — Region: where_popular for one seed within a coarse region
- Surface: mcp
- Tool + args (redacted): `qloo_where_popular {entity:"<artist id>", entity_type:"artist", within:"India", limit:10}`
- Status / result_count: `ok` / 10
- Notable results: 10 heatmap cells, each with latitude, longitude and geohash plus affinity and popularity; no place
  or city names. Cells were spread across north India (Uttar Pradesh, Gujarat, Jammu area), consistent with the seed,
  but one top cell sat in a remote high-altitude area, and the output is cell-level, not city-level.
- Quality (1-5): 2
- Implication for product: Not usable directly in the UI. If wanted, add a reverse-geocode step in the agent backend
  (not Qloo) and only show coarse region ("northern India"). For Phase 1, skip it and rely on seed language/culture
  plus `filter_location` for places.

## Q6 — Places: Golden Temple, Blackpool
- Surface: mcp
- Tool + args (redacted): `qloo_describe {entity:"Golden Temple", type:"place"}`; `qloo_describe {entity:"Blackpool", type:"locality"}`;
  `qloo_describe {entity:"Harmandir Sahib Amritsar", type:"place"}`; `qloo_describe {entity:"Blackpool Tower", type:"place"}`;
  `qloo_recommend {target_type:"place", signals:["<place id>"], filter_location:"Blackpool", limit:8}`
- Status / result_count: Golden Temple `ok`/1 but WRONG entity (a Buddhist temple in another Indian city);
  Blackpool locality `needs_input` (3 same-name localities); Harmandir Sahib `needs_input` (5 near-duplicate
  "Sri Harmandir Sahib" entries); Blackpool Tower `needs_input` (5 candidates; the first is the correct one);
  place recommend `ok`/8
- Notable results: `type:"place"` is correct for landmarks; `locality` is a distinct type and was ambiguous. A false
  `ok` exact match on "Golden Temple" is the biggest risk: match=exact does not guarantee the intended entity.
  Place recommend from the Blackpool Tower returned Blackpool Pleasure Beach, Blackpool Promenade, SEA LIFE Blackpool,
  Winter Gardens, Madame Tussauds (all in Blackpool; touristy and modern, not specifically era-specific). Rating 4
  for relevance, 3 for "old seaside" feel.
- Quality (1-5): resolution 2, recommend 4
- Implication for product: Stage 1 confirm-matches UI (already built) must show country/address and let the
  caregiver pick between candidates for places, and the LLM-extracted seed should use the official name
  ("Sri Harmandir Sahib") plus city. Validator: place country_code must match the persona region.

---
## Recommendations for Stage 2 (call sequence and arg shapes)
Throttle to at most 2-3 concurrent Qloo calls; retry a 429 once after a short wait. Always carry resolved UUIDs.

1. Resolve (per seed, once, cached): `qloo_describe {entity:"<official name>", type:"artist|movie|tv_show|place"}`.
   Accept only `status: ok` with `match: exact`; on `needs_input` surface candidates to the caregiver (Stage 1 UI).
   For places show address/country and reject country mismatches.
2. Music (lead domain): `qloo_recommend {target_type:"artist", signals:[<=3 confirmed artist ids>], limit:20, explain:true}`.
   Optionally widen with LLM-proposed era artists, then `qloo_rank {options:[<=10 names>], option_type:"artist",
   signals:[<artist ids>]}` and drop the bottom of the ranking. Song titles are LLM-proposed and only accepted if the
   artist is Qloo-evidenced; link to YouTube/Spotify search URLs.
3. Film/TV: `qloo_recommend {target_type:"movie"|"tv_show", signals:[<artist/movie/tv ids>], limit:20}`. In code:
   keep items with `release_year` inside the persona window (about birth year + 10 to birth year + 40; also accept
   long-running TV launched before the window), flag items whose descriptions match avoid-list themes (war, trauma,
   addiction, institutions), then fall back to `qloo_rank` over LLM-proposed classics (confirm via `describe`
   with type, then rank with the seed signals). Prefer seeding from the persona's own film/TV favourites
   to anchor the era.
4. Food: no Qloo dish entities. `qloo_find_tags {query:"<cuisine>"}` then use the `cuisine` tag URN as evidence;
   the dish name is an LLM conversation prompt labelled as such. If "where to eat" is wanted: `qloo_recommend
   {target_type:"place", signals:["<known restaurant place id>"], filter_location:"<coarse city>"}` (works for
   place seeds; tag-only signals do not).
5. Places: `qloo_recommend {target_type:"place", signals:["<landmark place id>"], filter_location:"<coarse city>",
   limit:10}`. Treat as nostalgia/visit-from-home ideas; filter by `geocode.country_code`.
6. Do NOT use: `demographic` (age band dropped, results worse), decade tags as era control, `where_popular` for UI
   (geohash only), `entity_tags` as clean descriptors.

Changes for docs/05-agent-design.md: (a) Stage 2 takes confirmed UUIDs, never names; (b) add a code
`release_year` window validator and an avoid-list description check for movie/TV; (c) reorder domains
music > TV > film > places > food, with food as tag-evidenced prompts; (d) use rank as the "Qloo decides" gate on
LLM-proposed candidates; (e) throttle and 429-retry in `qloo/gateway.ts`; (f) record that decade tags and
demographics were tested and rejected.
