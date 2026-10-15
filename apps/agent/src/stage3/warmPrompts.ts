import { z } from "zod";
import { HEALTH, normalizeText } from "@memory-lane/shared";
import type { LlmClient } from "../llm/client";
import { DATA_NOT_INSTRUCTIONS, llmSafeTopics } from "../llm/topics";
import { HEAVY, HEAVY_SCREEN } from "../stage2/build";
import { captionAllowed, promptAllowed } from "../stage2/language";
import type { ComposedItem } from "./compose";

const PromptsSchema = z.object({
  items: z.array(
    z.object({
      n: z.number().int().min(0),
      prompts: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
    }),
  ),
});
type Prompts = z.infer<typeof PromptsSchema>;

const PROMPTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "prompts"],
        properties: {
          n: { type: "integer" },
          prompts: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

// docs/05 §4.2: warmth and dignity; invitations, never memory tests; nothing about the person.
const SYSTEM = `You write conversation prompts for a reminiscence session with an older adult living with memory loss. A family member or carer reads them aloud while the item plays or is shown. For each item, write three short, open invitations (under 20 words each) built on what is known about the item: its kind, its year and the one line about it. Speak to the person directly (you, we, us). Ask about one concrete thing: a sound, a smell, a person, a place, or something to do. Prefer easy choices and "Tell me about…". Invite feelings, the senses, people and places, and stories; put no pressure on memory. You may set a prompt "back then", in the decades and town given (youngIn, grewUpIn). Use everyday words a carer would say; don't reuse descriptive or technical words from the line about the item. Never ask what something means to people in general. Never use the words memory, memories, remember, recall or forget. Never ask for names, dates or facts, and never quiz. Don't assume they saw, heard or ate this exact item. Never say what the person likes, felt or will feel. Never mention health, illness or treatment. Stay well away from every topic in thingsToAvoid, and from war, violence, loss and grief. At most one prompt per item may start with "What might". Use the item's name at most once. Do not invent facts about the item. Plain, warm English.
Good, one per kind: song "What does this tune make you want to do: sing, dance, or just listen?" / film "Who would you have gone to the pictures with back then?" / tv "Which evening of the week was the television on in your home?" / food "What does the smell of fresh naan bring to mind for you?" / place "Tell me about the busiest street in town back then."
Not like this: "What memories do you have of this film?" / "Do you remember who sang it?" / "Which year did it come out?" / "What might a visit to a place of pilgrimage mean to people?" / "What might live music feel like in a brick-vaulted cellar?" / "What do close harmonies bring to mind for you?"
${DATA_NOT_INSTRUCTIONS}`;

/**
 * Warmer, item-specific prompts written by the LLM (docs/05 Stage 3), for items that are already in the
 * session (it can't add any). Each prompt passes the same checks as the templates and more: no memory
 * words, the avoid-list (caregiver's and learned) and the painful-topic filters (security review C1);
 * an item keeps its template prompts unless at least two pass. Without a key, nothing changes.
 */
export async function warmPrompts(
  items: readonly ComposedItem[],
  context: {
    era: { from: number; to: number };
    regions: string[];
    /** The things to avoid, as the caregiver typed them plus what sessions learned. */
    avoid: string[];
  },
  nickname: string | null,
  llm: LlmClient,
  isAvoided: (...fields: (string | null)[]) => boolean,
  opts: { allow?: () => boolean; seeding?: boolean } = {},
): Promise<{ items: ComposedItem[]; written: number }> {
  if (!llm.configured || items.length === 0) return { items: [...items], written: 0 };
  const usable = (prompt: string) =>
    prompt.length <= 160 &&
    promptAllowed(prompt) &&
    captionAllowed(prompt) &&
    // Stricter than the templates: no memory words at all from the model.
    !/\b(remember|recall|forget|forgot|forgotten|memory|memories)\b/i.test(prompt) &&
    // Spoken to the person, about one concrete thing; not an essay question (ux review W11).
    /\b(you|your|we|us|let['’]s|tell me)\b/i.test(prompt) &&
    !/\bmeans? to\b|\b(to|for) people\b/i.test(prompt) &&
    !/\bmight\b.*\bfeel like\b/i.test(prompt) &&
    !HEALTH.test(normalizeText(prompt)) &&
    !isAvoided(prompt) &&
    !HEAVY.test(prompt) &&
    !HEAVY_SCREEN.test(prompt);
  // Decades rather than a birth year: the model needs the era, not the person (review S7).
  const decade = (y: number) => `${Math.floor(y / 10) * 10}s`;
  const youngIn = [...new Set([decade(context.era.from + 5), decade(context.era.from + 15)])];
  const result = await llm.json<Prompts>({
    task: "prompts",
    system: SYSTEM,
    input: {
      youngIn,
      grewUpIn: context.regions[0]?.split(",")[0]?.trim() ?? null,
      thingsToAvoid: llmSafeTopics(context.avoid, nickname),
      items: items.map((i, n) => ({
        n,
        kind: i.kind,
        name: i.name,
        year: i.year,
        about: i.description,
      })),
    },
    schema: PromptsSchema,
    jsonSchema: PROMPTS_JSON_SCHEMA,
    nickname,
    ...(opts.allow ? { allow: opts.allow } : {}),
    ...(opts.seeding ? { seeding: true } : {}),
  });
  if (result.kind !== "ok") return { items: [...items], written: 0 };
  let written = 0;
  const out = items.map((item, n) => {
    const passed = [
      ...new Set(result.data.items.find((x) => x.n === n)?.prompts.filter(usable) ?? []),
    ];
    // Hypotheticals read as abstract when stacked: one "What might…" per item at most.
    let hypotheticals = 0;
    const fresh = passed.filter((p) => !/^what might/i.test(p) || hypotheticals++ === 0);
    if (fresh.length < 2) return item;
    written++;
    return { ...item, prompts: fresh.slice(0, 3) };
  });
  return { items: out, written };
}
