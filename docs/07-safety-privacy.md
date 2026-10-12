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
| Caregiver identity | **No** | No login; random owner token cookie |
| Reactions & notes | Yes | Notes stay in our DB; never sent to Qloo; sent to Claude only as needed for adaptation |

## 2. Rules (enforced in code)
1. `qloo/redact.ts` rejects Qloo args containing: the nickname, email/phone/URL patterns, street-address
   patterns, health terms list (dementia, alzheimer, diagnosis, medication, etc.). Unit-tested.
2. Qloo results are aggregate affinities → UI wording is aggregate (validator in agent).
3. No claims of medical benefit anywhere (validator + copy review).
4. Secrets: `QLOO_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL` only in hosting env vars. Never in
   repo, frontend, logs, screenshots, or prompts. `.env*` gitignored. Run `security-reviewer` subagent
   before every deploy.
5. Logs: pino with redaction paths for headers and args; no request bodies with notes.
6. Rate limits + daily budget to protect the shared quota.
7. Demo personas are fictional. State this on the demo picker.
8. Data deletion: "Delete this profile" button removes profile + sessions + reactions.

## 3. Content safety
- Avoid-list is absolute (validator).
- Prompts are gentle and open, never memory tests.
- Sensitive history (wars, partition, migration trauma) is avoided unless the caregiver explicitly
  includes it; the wizard suggests adding such topics to the avoid-list.
- External links only to search pages on mainstream platforms (YouTube, Spotify); we don't host media.

## 4. Prompt-injection hygiene
- Treat Qloo results, user free text, and model output as untrusted data.
- User free-text fields are length-limited and passed to Claude inside clearly delimited data blocks.
- The agent has no tools that write anything except via validated app tools.

## 5. Limitations to state publicly (README "Known limitations")
- Qloo signals are aggregate; they suggest what people with similar backgrounds enjoyed, not what
  this person remembers.
- Coverage of older or regional content may vary by region (document from findings).
- Not a medical device; benefits of reminiscence/music approaches are modest and vary (cite research).
- Era fit is approximated via seeds/tags/ranking (no explicit decade filter in documented tools).
