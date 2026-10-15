import { z } from "zod";
import { HEALTH, normalizeText } from "@memory-lane/shared";
import type { LlmClient } from "../llm/client";
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
const SYSTEM = `You write conversation prompts for a reminiscence session with an older adult living with memory loss. A family member or carer reads them aloud while the item plays or is shown. For each item, write three short, open invitations (under 20 words each) built on what is known about the item: its kind, its year and the one line about it. Invite feelings, the senses, people and places, and stories; put no pressure on memory. Never use the words memory, memories, remember, recall or forget. Never ask for names, dates or facts, and never quiz. Don't assume they saw, heard or ate it before. Never say what the person likes, felt or will feel. Never mention health, illness or treatment. Use the item's name at most once. Do not invent facts about the item. Plain, warm English.
Good: "What does this tune make you want to do: sing, dance, or just listen?" / "Who would you have gone to see a film like this with?" / "What does the smell of fresh naan bring to mind?" / "Tell me about the busiest street in town back then."
Not like this: "What memories do you have of this film?" / "Do you remember who sang it?" / "Which year did it come out?"`;

/** A prompt the session may show: a gentle invitation that makes no claim about the person. */
function usable(prompt: string): boolean {
  return (
    prompt.length <= 160 &&
    promptAllowed(prompt) &&
    captionAllowed(prompt) &&
    // Stricter than the templates: no memory words at all from the model.
    !/\b(remember|recall|forget|forgot|forgotten|memory|memories)\b/i.test(prompt) &&
    !HEALTH.test(normalizeText(prompt))
  );
}

/**
 * Warmer, item-specific prompts written by the LLM (docs/05 Stage 3), for items that are already in the
 * session (it can't add any): each prompt passes the same checks as the templates, and an item keeps
 * its template prompts unless at least two of the LLM's pass. Without a key, nothing changes.
 */
export async function warmPrompts(
  items: readonly ComposedItem[],
  context: { birthYear: number; regions: string[] },
  nickname: string | null,
  llm: LlmClient,
): Promise<{ items: ComposedItem[]; written: number }> {
  if (!llm.configured || items.length === 0) return { items: [...items], written: 0 };
  const result = await llm.json<Prompts>({
    task: "prompts",
    system: SYSTEM,
    input: {
      bornIn: context.birthYear,
      grewUpIn: context.regions[0] ?? null,
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
  });
  if (result.kind !== "ok") return { items: [...items], written: 0 };
  let written = 0;
  const out = items.map((item, n) => {
    const fresh = [
      ...new Set(result.data.items.find((x) => x.n === n)?.prompts.filter(usable) ?? []),
    ];
    if (fresh.length < 2) return item;
    written++;
    return { ...item, prompts: fresh.slice(0, 3) };
  });
  return { items: out, written };
}
