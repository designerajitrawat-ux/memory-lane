import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlmClient, createMemoryLlmStore, type LlmRequest } from "./client";

const Schema = z.object({ names: z.array(z.string()) });
const req = (input: Record<string, unknown>): LlmRequest<z.infer<typeof Schema>> => ({
  task: "propose",
  system: "Suggest names.",
  input,
  schema: Schema,
  jsonSchema: { type: "object" },
  nickname: "Bimla",
});

/** A fake OpenAI-compatible endpoint (SYNTHETIC answers). */
function fakeFetch(answers: { status: number; content?: string }[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)] ?? { status: 500 };
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: a.content ?? null } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: a.status },
    );
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const client = (
  fetchImpl: typeof fetch,
  extra: Partial<Parameters<typeof createLlmClient>[0]> = {},
) =>
  createLlmClient({
    apiKey: "test-key",
    baseUrl: "https://llm.example/v1",
    model: "test-model",
    reasoningEffort: "low",
    dailyCalls: 10,
    store: createMemoryLlmStore(),
    fetchImpl,
    sleep: async () => {},
    ...extra,
  });

describe("LLM client", () => {
  it("is off without a key, and never sends the nickname or health details", async () => {
    const f = fakeFetch([{ status: 200, content: '{"names":[]}' }]);
    expect(await client(f.impl, { apiKey: undefined }).json(req({ a: 1 }))).toEqual({
      kind: "off",
    });
    const llm = client(f.impl);
    expect((await llm.json(req({ favourites: ["Songs for Bimla"] }))).kind).toBe("refused");
    expect((await llm.json(req({ avoid: ["her dementia"] }))).kind).toBe("refused");
    expect(f.calls).toHaveLength(0);
  });

  it("asks for structured output, caches by input, and respects the daily cap", async () => {
    const f = fakeFetch([{ status: 200, content: '{"names":["Example Show"]}' }]);
    const llm = client(f.impl, { dailyCalls: 1 });
    const first = await llm.json(req({ bornIn: 1950 }));
    expect(first).toEqual({ kind: "ok", data: { names: ["Example Show"] }, cached: false });
    expect(f.calls[0]?.url).toBe("https://llm.example/v1/chat/completions");
    expect(f.calls[0]?.body).toMatchObject({
      model: "test-model",
      reasoning_effort: "low",
      response_format: { type: "json_schema", json_schema: { name: "propose", strict: true } },
    });
    // Same input: cached, no new call. New input: today's cap (1) is used up.
    expect(await llm.json(req({ bornIn: 1950 }))).toMatchObject({ kind: "ok", cached: true });
    expect(await llm.json(req({ bornIn: 1960 }))).toEqual({ kind: "budget" });
    expect(f.calls).toHaveLength(1);
  });

  it("retries once on a rate limit, and refuses output that doesn't match the schema", async () => {
    const retry = fakeFetch([{ status: 429 }, { status: 200, content: '{"names":["A"]}' }]);
    expect((await client(retry.impl).json(req({ x: 1 }))).kind).toBe("ok");
    expect(retry.calls).toHaveLength(2);
    const bad = fakeFetch([{ status: 200, content: '{"wrong":true}' }]);
    expect(await client(bad.impl).json(req({ x: 2 }))).toEqual({
      kind: "failed",
      reason: "invalid",
    });
    const down = fakeFetch([{ status: 401 }]);
    expect(await client(down.impl).json(req({ x: 3 }))).toEqual({
      kind: "failed",
      reason: "provider",
    });
  });
});
