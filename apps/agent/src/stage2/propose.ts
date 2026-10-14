import { z } from "zod";
import type { LlmClient } from "../llm/client";

const ProposalSchema = z.object({
  tvShows: z.array(z.string().trim().min(1).max(100)).max(10),
  singers: z.array(z.string().trim().min(1).max(100)).max(10),
});
export type Proposal = z.infer<typeof ProposalSchema>;

const PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tvShows", "singers"],
  properties: {
    tvShows: { type: "array", items: { type: "string" } },
    singers: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `You know popular culture across countries and decades. Suggest well-known names that many people who grew up where and when described here watched or listened to. Only real, widely known names, written as they are commonly titled (original-language titles are fine). TV shows: first shown within the given years, in that country. Singers or bands: popular there in those years. Give up to 8 for each list that is asked for, and an empty list for anything not asked. Leave out anything already listed under alreadyHave. No explanations.`;

/**
 * Stage 2 gap filling (docs/05: "propose_candidates"): when Qloo's recommendations leave a gap (no TV
 * from their years, few era singers), the LLM proposes era-typical names. They count for nothing until
 * Qloo matches and ranks them (`qloo_rank` with named options) and code checks their years.
 */
export async function proposeNames(
  facts: {
    birthYear: number;
    grewUpIn: string | null;
    languages: string[];
    years: { from: number; to: number };
    favourites: string[];
    alreadyHave: string[];
    need: { tvShows: boolean; singers: boolean };
  },
  llm: LlmClient,
  nickname: string | null,
): Promise<Proposal | null> {
  const result = await llm.json<Proposal>({
    task: "propose",
    system: SYSTEM,
    input: {
      bornIn: facts.birthYear,
      grewUpIn: facts.grewUpIn,
      languages: facts.languages,
      years: facts.years,
      favourites: facts.favourites,
      alreadyHave: facts.alreadyHave,
      asked: [facts.need.tvShows ? "tvShows" : null, facts.need.singers ? "singers" : null].filter(
        Boolean,
      ),
    },
    schema: ProposalSchema,
    jsonSchema: PROPOSAL_JSON_SCHEMA,
    nickname,
    maxTokens: 2000,
  });
  if (result.kind !== "ok") return null;
  const clean = (names: string[], wanted: boolean) =>
    wanted ? [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 10) : [];
  return {
    tvShows: clean(result.data.tvShows, facts.need.tvShows),
    singers: clean(result.data.singers, facts.need.singers),
  };
}
