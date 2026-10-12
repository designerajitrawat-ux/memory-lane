# START HERE — Memory Lane kit (aapke liye guide)

Ye folder aapke project ka "dimaag" hai. Isme sab likha hai: kya banana hai, kyun, kaise, kis
tech se, aur Claude Code ko kya bolna hai. Saari docs English mein hain kyunki Claude Code aur
hackathon submission dono English mein best kaam karte hain.

## Folder mein kya hai
| File | Kya hai |
|---|---|
| `CLAUDE.md` | Claude Code ka master rulebook — har session mein ye apne aap padhta hai |
| `docs/00-hackathon-brief.md` | Hackathon ke rules, judging, deadlines, Qloo ka purpose |
| `docs/01-product-spec.md` | Product kya hai, features (MVP vs stretch), user stories, business model |
| `docs/02-research-evidence.md` | Dementia research ke sources + honest claims (kya bol sakte, kya nahi) |
| `docs/03-qloo-integration.md` | Qloo harness setup, MCP tools, error handling, Phase-0 test questions |
| `docs/04-architecture.md` | System diagram, tech stack, folder structure, DB tables, APIs |
| `docs/05-agent-design.md` | Agent kaise sochega: 4 stages, prompts, validators |
| `docs/06-ui-ux.md` | Screens, design style, colors, fonts, states |
| `docs/07-safety-privacy.md` | Privacy aur safety rules |
| `docs/08-build-plan.md` | Phase 0 se 9 tak plan, har phase ka "done" criteria |
| `docs/09-claude-code-playbook.md` | VS Code + Claude Code setup + har phase ka copy-paste prompt |
| `docs/10-submission-kit.md` | Final checklist, README template, Devpost text |
| `docs/11-demo-personas.md` | 3 fictional demo profiles (US, India, UK) |
| `docs/research/caregiver-interview-guide.md` | Caregivers se baat karne ke sawaal |
| `docs/progress.md` | Live progress log — Claude har phase ke baad update karega |
| `docs/qloo-findings.md` | Qloo data test results yahan likhe jaayenge |
| `.claude/agents/` | 4 expert subagents: data scout, security, UX, judge |
| `.mcp.json` | Claude Code ko Qloo se jodta hai (isme koi key nahi hai) |
| `.env.example`, `.gitignore`, `LICENSE` | Repo ke zaroori files |

## Steps (is order mein)
1. GitHub par public repo `memory-lane` banao, clone karo, is kit ki **saari files** root mein copy karo.
   (`.claude`, `.mcp.json`, `.gitignore` hidden files hain — inhe bhi copy karna.)
2. `LICENSE` mein `<TEAM NAME>` ki jagah apna naam likho.
3. Devpost register + Qloo key form + `npm i -g @qloo/qloo-harness` + `qloo setup --qloo`.
4. VS Code mein folder kholo → Claude Code panel → folder trust karo → `qloo` MCP server approve karo.
5. Pehla prompt:
   `Read CLAUDE.md, START_HERE.md and docs/progress.md, then summarise the project and tell me what Phase 0 needs.`
6. Phir `docs/09-claude-code-playbook.md` se Phase 0 ka prompt chalao, phir Phase 1, aur aage.

## Golden rules
- Kabhi bhi API key chat mein mat daalna.
- Har phase plan mode se shuru karo, gate pass hone par hi aage badho.
- Har phase ke baad commit + deploy + `progress.md` update + `/clear`.
- Agar Claude docs se alag kuch kare, use bolo docs dobara padhe.
