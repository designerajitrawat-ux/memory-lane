import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest } from "../llm/client";
import { avoidMatcher } from "../stage2/avoid";
import type { ComposedItem } from "./compose";
import { warmPrompts } from "./warmPrompts";

const item = (name: string): ComposedItem => ({
  position: 0,
  kind: "song",
  domain: "music",
  entityId: "00000000-0000-4000-8000-000000000001",
  entityType: "urn:entity:artist",
  name,
  year: null,
  description: "A singer popular in the 1960s.",
  why: "People who enjoy one of their favourites often enjoy this too.",
  prompts: ["Template prompt one?", "Template prompt two?"],
  minutes: 4,
  link: { label: "Listen on YouTube", url: "https://www.youtube.com/results?search_query=x" },
  altLink: null,
  evidenceIds: ["e1"],
});

/** A fake LLM returning the given prompts for every item (SYNTHETIC output). */
function fakeLlm(prompts: string[]) {
  const sent: LlmRequest<unknown>[] = [];
  const llm: LlmClient = {
    configured: true,
    model: "test-model",
    async json<T>(req: LlmRequest<T>) {
      sent.push(req as LlmRequest<unknown>);
      const items = (req.input.items as { n: number }[]).map((i) => ({ n: i.n, prompts }));
      return { kind: "ok" as const, data: req.schema.parse({ items }), cached: false };
    },
  };
  return { llm, sent };
}

const context = (avoid: string[]) => ({
  era: { from: 1951, to: 1991 },
  regions: ["Leeds, UK"],
  avoid,
});

describe("warmer prompts from the LLM", () => {
  it("drops prompts that touch the avoid-list or a painful subject (security review C1)", async () => {
    const avoid = ["Brass bands"];
    const { llm } = fakeLlm([
      "Would you like to hum along with us, or just listen?",
      "Tell me about the brass bands in the park back then.",
      "Tell me about the songs people sang after the massacre.",
      "Who would you share a cup of tea with while this plays?",
    ]);
    const out = await warmPrompts(
      [item("Example Singer")],
      context(avoid),
      null,
      llm,
      avoidMatcher(avoid),
    );
    expect(out.items[0]?.prompts).toEqual([
      "Would you like to hum along with us, or just listen?",
      "Who would you share a cup of tea with while this plays?",
    ]);
  });

  it("keeps the templates unless two prompts pass: memory words, essay questions and third person are refused", async () => {
    const { llm } = fakeLlm([
      "What memories does this bring back?",
      "What might a visit to a place of pilgrimage mean to people?",
      "What might live music feel like in a brick-vaulted cellar?",
      "Would you like to sing along?",
    ]);
    const out = await warmPrompts([item("Example Singer")], context([]), null, llm, () => false);
    expect(out.written).toBe(0);
    expect(out.items[0]?.prompts).toEqual(["Template prompt one?", "Template prompt two?"]);
  });

  it("keeps prompts item-specific: a line two items share, or a repeated opening, is dropped", async () => {
    const sent: LlmRequest<unknown>[] = [];
    const llm: LlmClient = {
      configured: true,
      model: "test-model",
      async json<T>(req: LlmRequest<T>) {
        sent.push(req as LlmRequest<unknown>);
        const items = (req.input.items as { n: number; name: string }[]).map((i) => ({
          n: i.n,
          prompts: [
            `Tell me what ${i.name} brings to mind for you.`,
            "Would you rather sing along, tap your foot, or just listen?",
            `Would you rather sing along with ${i.name} or listen?`,
          ],
        }));
        return { kind: "ok" as const, data: req.schema.parse({ items }), cached: false };
      },
    };
    const out = await warmPrompts(
      [item("Singer One"), item("Singer Two")],
      context([]),
      null,
      llm,
      () => false,
    );
    expect(out.items.map((i) => i.prompts)).toEqual([
      [
        "Tell me what Singer One brings to mind for you.",
        "Would you rather sing along with Singer One or listen?",
      ],
      // Its "Would you rather sing along with…" opens like Singer One's, so only one prompt is
      // left: it keeps the templates.
      ["Template prompt one?", "Template prompt two?"],
    ]);
  });

  it("sends the topics to avoid (never health ones or the nickname), decades instead of a birth year, and no nickname", async () => {
    const { llm, sent } = fakeLlm(["Would you like to sing along?", "Tell me about Saturdays."]);
    await warmPrompts(
      [item("Example Singer")],
      context(["Brass bands", "Medication times", "Bimla's wedding songs"]),
      "Bimla",
      llm,
      () => false,
      { seeding: true },
    );
    const input = sent[0]?.input ?? {};
    expect(input.thingsToAvoid).toEqual(["Brass bands"]);
    expect(input.youngIn).toEqual(["1950s", "1960s"]);
    expect(JSON.stringify(input)).not.toMatch(/Bimla|1946|Medication/);
    expect(sent[0]?.seeding).toBe(true);
  });
});
