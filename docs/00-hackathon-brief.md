# 00 · Hackathon Brief: Qloo Agentic Hackathon

> The single source of truth for the competition's rules. If anything here conflicts with
> https://qloo.devpost.com/rules, the official rules win. Re-check the Devpost "Updates" tab weekly.

## 1. Key facts

| Item | Value |
|---|---|
| Name | Qloo Agentic Hackathon, tagline "Agents, but with taste." |
| Organiser | Qloo (New York); administered by Devpost |
| Format | Online, public, teams allowed |
| Submission deadline | **Oct 30, 2026, 11:45 pm EDT**, which is **Oct 31, 9:15 am IST** |
| Judging period | Nov 2 – Nov 16, 2026 |
| Winners announced | On or around Nov 23, 2026 |
| Prizes | 1st $15,000 · 2nd $6,000 · 3rd $4,000. Separately, Jason Calacanis may personally invest $25,000 in his favourite entry. |
| Language | All submission materials in English |
| Official pages | Overview: https://qloo.devpost.com/ · Rules: https://qloo.devpost.com/rules · Resources: https://qloo.devpost.com/resources |
| Starter kit | https://github.com/qloo/qloo-hackathon-kit |
| API key form | Linked from the Resources page. Each team member needs their **own** key. |
| Support | Qloo Discord: https://discord.gg/rF9PKsD5Q7 |

## 2. What must be built (official requirement)

A **working software application that integrates the Qloo API** and meets at least one of these:
- (a) it functions as an agentic tool, or
- (b) it is built using an agent framework, or
- (c) it wires Qloo into an existing agent.

Qloo's own guidance:
- Cultural intelligence must be the differentiator.
- The agent must outperform generic LLM-only approaches.
- "If your submission would work the same without Qloo, you're building the wrong thing."
- They are not interested in demos of what LLMs can already do.

Their lateral-thinking examples were lighting for electricians' customers, dining for seniors with health
constraints, and rare-disease journeys. These signal that they want **unexpected domains with real
constraints**.

## 3. Mandatory submission items

1. **Link to a functional demo application.** It must be live, hosted externally (website, web app, hosted APK
   or TestFlight), and usable end to end. Local-only or private-access projects do not qualify. If login is
   needed, provide test credentials.
2. **Public code repository URL** (GitHub, GitLab, or Bitbucket) with all source, assets, and run
   instructions.
3. **Open-source licence file** that GitHub detects and shows in the repo's About section.
4. **Text description** of features, functionality, and what makes it Qloo-powered.
5. A demo video is **not required**. Screenshots and images are still valuable, because judges may score from
   text and images alone.

The project must stay available **free and unrestricted** for judges until the judging period ends
(Nov 16).

## 4. Judging

- **Stage 1 (pass/fail):** does the project reasonably fit the theme and reasonably apply the Qloo API?
- **Stage 2:** four **equally weighted** criteria:
  1. **Technological Implementation.** How thoroughly and skilfully is Qloo used? Is the implementation
     non-trivial and working?
  2. **Design.** Is it a complete, coherent product experience rather than a proof of concept?
  3. **Potential Impact.** Is there a credible, specific case for a real problem and a real audience, and
     does the demo actually address it?
  4. **Quality of the Idea.** Is this a creative, non-obvious use of Qloo, with genuine understanding of the
     problem space?
- **Tie-break order:** Technological Implementation, then Design, then Impact, then Idea.
- Judging may use expert panels, peer review, or **automated AI-driven analysis**. The README and Devpost
  text must therefore be clear, structured, and complete on their own.
- **Judges:** Jason Calacanis (investor), Mike Diolosa (CTO, Qloo), Nicole Seligman (OpenAI board),
  Todd Boehly (Eldridge), Cedric the Entertainer, and Michael Abrams (Live Nation).

## 5. Other rules that affect us

- Existing projects are allowed only if they are significantly updated during the submission period. Memory
  Lane is new, so this is not an issue.
- Third-party APIs, SDKs, and data must be used within their licences. This applies to the Claude API, music
  links, and similar.
- Submissions must be original work owned by the team and must not infringe IP. Do not embed copyrighted
  songs, film clips, lyrics, or posters.
- Multiple submissions are allowed only if they are substantially different. We are making one.
- Each project can win at most one prize.
- Winners must complete identity and tax forms (W-8BEN for non-US residents).
- Ineligible: residents of comprehensively sanctioned countries, Brazil, and Quebec. India is eligible.

## 6. Qloo kit rules (from the starter repo)

- Supported surfaces: `qloo explore`, `qloo exec`, `qloo api`, and `qloo mcp` from the npm package
  `@qloo/qloo-harness` (version ≥ 0.1.26, Node ≥ 22.19.0). All share one credential and one quota.
- The harness's `integrate`, `plan`, and `build` modes are **not** part of the hackathon. Do not use them.
- Never put the credential in a repo, browser bundle, client MCP config, chat, issue, or demo.
- Use the smallest request that answers the question, cache only what you need, keep retries bounded, and do
  no bulk scraping.
- Qloo results are **aggregate affinities**. Do not present them as facts about an individual, and do not
  use them to infer identity, health, or other sensitive traits.
- Their submission guide also values: a problem statement, which Qloo workflows or tools were used and why,
  a redacted request-to-result explanation, reproducible setup steps, known limitations, provenance, user
  clarity, and responsible data handling.

## 7. Why Qloo is running this (our reading)

These are inferences from public information. Use them to shape the pitch, not as facts to state in the
submission.

1. **To prove their core thesis.** Qloo argues that generative AI on its own drifts toward generic answers
   and that Qloo's taste data fixes this. The tagline is that thesis. Every strong entry becomes evidence for
   it, so **show the "with vs without Qloo" difference explicitly**.
2. **To get developers using their new harness and MCP server.** The package is very new (v0.1.x). Deep,
   correct use of the MCP tools, plus constructive feedback filed as issues on their kit repo, will be
   noticed by their CTO.
3. **To find new markets.** Their existing customers are large brands. They want verticals they have not
   thought of, which is why we chose eldercare.
4. **To show their investors a growing ecosystem.** Several judges are Qloo investors, and the Calacanis
   bonus points to startup scouting. **Pitch Memory Lane as a startup**: who pays, how it grows, why now.
