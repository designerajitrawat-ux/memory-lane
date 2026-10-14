import { createHash } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import type { z } from "zod";
import { llmCalls } from "../db/schema";
import type { AppDb } from "../db/types";
import { checkArgs } from "../qloo/redact";

/**
 * The LLM behind Memory Lane's language steps (docs/05): the compare baseline, era-typical names for Qloo
 * to rank, and warmer session prompts. "The AI proposes, Qloo decides, code verifies": nothing the model
 * says reaches a screen without Qloo evidence or the same validators as everything else.
 *
 * Any OpenAI-compatible Chat Completions API works (OpenAI by default; Gemini and Groq expose the same
 * shape). Calls are server-side only, pass the same privacy guard as Qloo calls (no nickname, contact,
 * address or health details), are cached by a hash of their input (the input itself is not stored),
 * and count toward a daily cap. Provider error text is never forwarded.
 */
export type LlmTask = "compare" | "propose" | "prompts";

export type LlmResult<T> =
  | { kind: "ok"; data: T; cached: boolean }
  /** No key configured: the step is switched off, honestly. */
  | { kind: "off" }
  /** Today's LLM budget is used up. */
  | { kind: "budget" }
  /** The input failed the privacy guard (never sent). */
  | { kind: "refused" }
  | { kind: "failed"; reason: "timeout" | "provider" | "invalid" };

export interface LlmRequest<T> {
  task: LlmTask;
  system: string;
  /** Public cultural names, years and town-level places only; checked before sending. */
  input: Record<string, unknown>;
  schema: z.ZodType<T>;
  /** Strict JSON Schema for the provider's structured output (mirrors `schema`). */
  jsonSchema: Record<string, unknown>;
  /** The person's nickname, so the guard can refuse it anywhere in the input. */
  nickname: string | null;
  maxTokens?: number;
}

export interface LlmClient {
  readonly configured: boolean;
  readonly model: string;
  json<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}

export interface LlmStore {
  get(task: LlmTask, hash: string, model: string): Promise<unknown | null>;
  put(row: {
    task: LlmTask;
    hash: string;
    model: string;
    output: unknown;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void>;
  /** Live (uncached) calls since the start of the UTC day. */
  countToday(): Promise<number>;
}

export interface LlmConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  reasoningEffort: "none" | "low" | "medium" | "high";
  dailyCalls: number;
  store: LlmStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: { warn(obj: object, msg: string): void };
}

const startOfUtcDay = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export function createLlmClient(config: LlmConfig): LlmClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const timeoutMs = config.timeoutMs ?? 45_000;

  async function post(body: unknown): Promise<Response | "timeout"> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return "timeout";
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    configured: !!config.apiKey,
    model: config.model,

    async json<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
      if (!config.apiKey) return { kind: "off" };
      if (!checkArgs(req.input, { nickname: req.nickname }).ok) return { kind: "refused" };

      const hash = createHash("sha256")
        .update(JSON.stringify([req.task, req.system, req.input, req.jsonSchema]))
        .digest("hex");
      const hit = await config.store.get(req.task, hash, config.model);
      if (hit !== null) {
        const parsed = req.schema.safeParse(hit);
        if (parsed.success) return { kind: "ok", data: parsed.data, cached: true };
      }
      if ((await config.store.countToday()) >= config.dailyCalls) return { kind: "budget" };

      const body = {
        model: config.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: JSON.stringify(req.input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: req.task, strict: true, schema: req.jsonSchema },
        },
        max_completion_tokens: req.maxTokens ?? 4000,
        ...(config.reasoningEffort === "none" ? {} : { reasoning_effort: config.reasoningEffort }),
      };

      // One retry for rate limits and provider hiccups; never for a bad request.
      let res = await post(body);
      if (res !== "timeout" && (res.status === 429 || res.status >= 500)) {
        await sleep(1500);
        res = await post(body);
      }
      if (res === "timeout") return { kind: "failed", reason: "timeout" };
      if (!res.ok) {
        config.log?.warn({ status: res.status, task: req.task }, "llm call failed");
        return { kind: "failed", reason: "provider" };
      }

      const payload = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: string | null; refusal?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      } | null;
      const content = payload?.choices?.[0]?.message?.content;
      let data: unknown = null;
      try {
        data = content ? JSON.parse(content) : null;
      } catch {
        data = null;
      }
      const parsed = req.schema.safeParse(data);
      if (!parsed.success) {
        config.log?.warn({ task: req.task }, "llm output did not match the schema");
        return { kind: "failed", reason: "invalid" };
      }
      await config.store.put({
        task: req.task,
        hash,
        model: config.model,
        output: parsed.data,
        inputTokens: payload?.usage?.prompt_tokens ?? 0,
        outputTokens: payload?.usage?.completion_tokens ?? 0,
      });
      return { kind: "ok", data: parsed.data, cached: false };
    },
  };
}

export function createPgLlmStore(db: AppDb): LlmStore {
  return {
    async get(task, hash, model) {
      const [row] = await db
        .select({ output: llmCalls.output })
        .from(llmCalls)
        .where(
          and(eq(llmCalls.task, task), eq(llmCalls.inputHash, hash), eq(llmCalls.model, model)),
        )
        .limit(1);
      return row?.output ?? null;
    },
    async put(row) {
      await db
        .insert(llmCalls)
        .values({
          task: row.task,
          inputHash: row.hash,
          model: row.model,
          output: row.output,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
        })
        .onConflictDoNothing();
    },
    async countToday() {
      const [row] = await db
        .select({ n: count() })
        .from(llmCalls)
        .where(gte(llmCalls.createdAt, startOfUtcDay()));
      return row?.n ?? 0;
    },
  };
}

export function createMemoryLlmStore(): LlmStore {
  const rows = new Map<string, { output: unknown; at: number }>();
  return {
    async get(task, hash, model) {
      return rows.get(`${task}:${hash}:${model}`)?.output ?? null;
    },
    async put(row) {
      rows.set(`${row.task}:${row.hash}:${row.model}`, { output: row.output, at: Date.now() });
    },
    async countToday() {
      const since = startOfUtcDay().getTime();
      return [...rows.values()].filter((r) => r.at >= since).length;
    },
  };
}

/** The switched-off client (no key): every step reports "off". */
export const NO_LLM: LlmClient = {
  configured: false,
  model: "none",
  json: async () => ({ kind: "off" }),
};
