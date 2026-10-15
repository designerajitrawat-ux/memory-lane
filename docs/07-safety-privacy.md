# 07 · Safety, Privacy & Responsible Data Handling

Judges (and Qloo's kit) explicitly value responsible data handling. Treat this file as requirements.

## 1. What we collect
| Data | Collected? | Notes |
|---|---|---|
| Person's nickname | Yes (optional) | Stored in our DB only; **never** sent to Qloo or used in Qloo args |
| Birth year | Yes | Sent to Qloo only as a decade/age band signal if a tool supports it |
| Places lived | Coarse only (state/region + country + years) | No addresses. Sent to Qloo only as public regional signals |
| Favourites / avoid-list | Yes | Public cultural entities only |
| Health / diagnosis | **No** | Not asked, not stored, never sent anywhere |
| Caregiver identity | **No** | No login; a random owner token kept on the caregiver's device (localStorage), sent as a bearer header; the DB stores only its sha256 |
| Reactions & notes | Yes | Notes stay in our DB; never sent to Qloo or the LLM |

## 2. Rules (enforced in code)
1. `qloo/redact.ts` rejects Qloo args containing: the nickname, email/phone/URL patterns, street-address
   patterns, health terms list (dementia, alzheimer, diagnosis, medication, etc.). Unit-tested.
2. Qloo results are aggregate affinities → UI wording is aggregate (validator in agent).
3. No claims of medical benefit anywhere (validator + copy review).
4. Secrets: `QLOO_API_KEY`, `LLM_API_KEY`, `DATABASE_URL` only in hosting env vars. Never in
   repo, frontend, logs, screenshots, or prompts. `.env*` gitignored. Run `security-reviewer` subagent
   before every deploy.
5. Logs: pino with redaction paths for headers and args; no request bodies with notes.
6. Rate limits + daily budget to protect the shared quota.
7. Demo personas are fictional. State this on the demo picker.
8. Data deletion: "Delete this profile" button removes profile + sessions + reactions (cascade),
   including its seeds, Qloo candidates and the Qloo call records (`qloo_calls.profile_id`). The shared
   Qloo cache keeps the looked-up favourite text with Qloo's answer (no profile link) until it expires
   (7 days, +1 day until the purge). All user-triggered Qloo research (Stage 1 lookups, Stage 2 builds and
   Stage 4 learning when a session is planned) shares one allowance per device token and per client IP
   per day (`STAGE1_LOOKUPS_PER_*` env names are historical) and one run lock per profile, and part of the
   daily Qloo budget is kept for demo personas. Taste profiles keep their newest 3 versions; a profile
   keeps at most 50 sessions (planning again while the newest is untouched returns it, without Qloo
   calls); Qloo call records made for no profile are purged after 30 days.
   Retention: profiles nobody has opened for 90 days are deleted automatically (daily purge in the
   agent); expired Qloo cache rows too. "Forget profiles on this device" clears the owner token on shared
   devices. Limits: 20 profiles per device token, 200 new profiles per day overall, 10/hour per client
   (IPv6 counted per /64).
9. Profile text is checked with the same personal-data patterns as the Qloo guard
   (packages/shared/src/pii.ts): no health/medical details, contact details or street addresses, even in
   the private "why" of an avoid item. The "why" is only ever returned to the profile's owner. Session
   notes follow the same rules (refused with a gentle message; the label asks to leave out health
   details) and are blanked for anyone but the owner.
10. Demo personas never change through any request: every write checks ownership and `is_demo = false`;
   only the server-side seeder writes their sample reactions. Seeding is robust to restarts and
   overlapping deploys (complete-only listing, unique demo index, stale half-built personas rebuilt,
   older versions removed only after the new one is complete). "Try it yourself" makes a private copy
   (with copies of its Qloo call records, never the harness summary) under the same profile limits and
   rate bucket as creating a profile, one per device while untouched; a copy that can't be planned is
   removed again, so no unreachable profile is left behind.
10a. Item pictures: only Qloo's own image URLs (`https://images.qloo.com/i/…`, checked by one allow-list
   in the agent when reading Qloo's answer and again in the shared schemas and the UI). Vercel's image
   optimizer fetches and resizes them, so viewers' browsers never contact Qloo and no referrer reaches
   it; they are resized and cached by Vercel's image optimizer for up to 31 days and served from our site; only the URL is stored in our database; never committed. The optimizer is kept tight (one host, files directly under /i/, no query, few
   sizes, one format, no redirects), so it can't be fed other files. Variants of one picture (a fragment,
   user info) don't cost new work on Vercel: its optimizer cache ignores them (checked live, 2026-10-15:
   never-seen variants were cache hits); where Next serves images itself, a proxy
   (`apps/web/src/proxy.ts`) refuses any URL that isn't exactly one of Qloo's. Vercel's request logs record which public pictures were loaded,
   with the visitor's IP, as for any page.
11. Map searches carry the place's town (Qloo's geocode, or the town-level region the caregiver typed),
   never the nickname or notes. Links are built in code and checked against https search paths per host (YouTube `/results`,
   Spotify `/search/`, Google Maps `/maps/search/`), so allowed hosts' redirect pages can't be used.
12. The LLM (server-side only, `llm/client.ts`) receives public facts only: birth year (the compare
   view's generic plan; the other steps get era years or decades instead), town-level regions,
   languages, confirmed favourites' names, the caregiver's avoid topics (without reasons; learned topics
   too for prompts) and Qloo's one-line descriptions of items. Never the nickname, notes, reasons or
   anything personal: the same guard as for Qloo refuses the call otherwise, and avoid entries with
   health or personal words are left out. Inputs are not stored (only a hash, for the cache); outputs
   are cultural names, short reasons and prompt text, which may restate those public facts (e.g. a
   town). Cached outputs are deleted after the profile retention period. OpenAI's API doesn't train on
   API data by default; a free-tier provider may, which is why only public facts are sent.
13. LLM spend is capped: a daily cap counted atomically before each live call (failures count too),
   part of it reserved for building the demos; per-device and per-network daily allowances for live
   calls (cache hits are free); one in-flight call per input; other profiles' plans on a compare page
   are read from the cache only. Every reason or prompt it writes passes the language policy, the
   memory-word filter, the health filter, the avoid-list and the painful-topic filters before it is
   shown; a generic-plan reason that fails is replaced with fixed text and counted.

## 3. Content safety
- Avoid-list is absolute (validator).
- Prompts are gentle and open, never memory tests.
- Sensitive history (wars, partition, migration trauma) is avoided unless the caregiver explicitly
  includes it; the wizard suggests adding such topics to the avoid-list. Stage 2 also reads Qloo's full
  descriptions: avoid-list words plus related words for well-known painful topics, and a gentle filter
  (atrocities, suicide, abuse; sites of grief for places) on everything Qloo suggests.
- External links only to search pages on mainstream platforms (YouTube, Spotify); we don't host media.

## 4. Prompt-injection hygiene
- Treat Qloo results, user free text, and model output as untrusted data.
- What reaches the LLM is a JSON data block (the user message), never mixed into the instructions; its
  output is parsed against a strict schema and then checked like everything else (Qloo evidence for
  any name, the language policy for any prompt). It can't add items or call tools.
- The agent has no tools that write anything except via validated app tools.

## 5. Limitations to state publicly (README "Known limitations")
- Qloo signals are aggregate; they suggest what people with similar backgrounds enjoyed, not what
  this person remembers.
- Coverage of older or regional content may vary by region (document from findings).
- Not a medical device; benefits of reminiscence/music approaches are modest and vary (cite research).
- Era fit is approximated via seeds/tags/ranking (no explicit decade filter in documented tools).
