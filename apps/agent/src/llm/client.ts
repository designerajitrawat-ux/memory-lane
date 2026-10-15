import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { z } from "zod";
import { budget, llmCalls } from "../db/schema";
import type { AppDb } from "../db/types";
import { checkArgs } from "../qloo/redact";

/**
 * The LLM behind Memory Lane's language steps (docs/05): the compare view's generic plan, era-typical
 * names for Qloo to rank, and warmer session prompts. "The AI proposes, Qloo decides, code verifies":
 * names count only with Qloo evidence, and every prompt or reason shown passes the same checks as
 * everything else.
 *
 * Any OpenAI-compatible Chat Completions API works (OpenAI by default; Gemini and Groq expose the same
 * shape). Calls are server-side only, pass the same privacy guard as Qloo calls (no nickname, contact,
 * address or health details), are cached by a hash of their input (the input itself is not stored),
 * share one in-flight call per input, and count toward a daily cap before they are made (failures
 * cost money too); part of the cap is kept for the demos. Provider error text is never forwarded.
 */
export type LlmTask = "compare" | "propose" | "prompts";

export type LlmResult<T> =
  | { kind: "ok"; data: T; cached: boolean }
  /** No key configured: the step is switched off, honestly. */
  | { kind: "off" }
  /** Today's LLM budget is used up. */
  | { kind: "budget" }
  /** This device or network has asked for a lot today (cache hits stay free). */
  | { kind: "limit" }
  /** `cacheOnly` and nothing cached. */
  | { kind: "miss" }
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
  /** Per-device/per-client allowance, asked only when a live call is needed. */
  allow?: () => boolean;
  /** Answer from the cache or not at all (e.g. other profiles' plans on someone's compare page). */
  cacheOnly?: boolean;
  /** Server-side work for the demos (seeding): may use the reserved part of the daily cap. */
  seeding?: boolean;
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
  /** Atomically takes one of today's live calls, leaving `keep` of `cap` unused; false when full. */
  reserve(cap: number, keep: number): Promise<boolean>;
}

export interface LlmConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  reasoningEffort: "none" | "low" | "medium" | "high";
  dailyCalls: number;
  /** Live calls a day that only seeding may use (the demos must always be buildable). */
  reserve?: number;
  store: LlmStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: { warn(obj: object, msg: string): void };
}

const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

export function createLlmClient(config: LlmConfig): LlmClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const timeoutMs = config.timeoutMs ?? 45_000;
  const keep = Math.min(config.reserve ?? 0, config.dailyCalls);
  // One live call per input at a time; concurrent identical requests share it (review W2).
  const inFlight = new Map<string, Promise<LlmResult<unknown>>>();

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
        redirect: "error",
      });
    } catch {
      return "timeout";
    } finally {
      clearTimeout(timer);
    }
  }

  async function live<T>(req: LlmRequest<T>, hash: string): Promise<LlmResult<T>> {
    if (req.allow && !req.allow()) return { kind: "limit" };
    // Counted before the call: a timeout or a provider error is billed too.
    const take = async () => config.store.reserve(config.dailyCalls, req.seeding ? 0 : keep);
    if (!(await take())) return { kind: "budget" };

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
      await res.body?.cancel().catch(() => {});
      if (!(await take())) return { kind: "budget" };
      await sleep(1500);
      res = await post(body);
    }
    if (res === "timeout") return { kind: "failed", reason: "timeout" };
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      config.log?.warn({ status: res.status, task: req.task }, "llm call failed");
      return { kind: "failed", reason: "provider" };
    }

    const payload = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null } }[];
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
      if (req.cacheOnly) return { kind: "miss" };

      // Seeding never shares a visitor's call: it would inherit their "limit" (security review S3).
      const slot = `${hash}:${req.seeding ? "seed" : "visit"}`;
      const running = inFlight.get(slot);
      if (running) return (await running) as LlmResult<T>;
      const call = live(req, hash).finally(() => inFlight.delete(slot));
      inFlight.set(slot, call as Promise<LlmResult<unknown>>);
      return call;
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
      // A row that no longer matched the schema is replaced, not kept (review W3).
      const values = {
        output: row.output,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        createdAt: new Date(),
      };
      await db
        .insert(llmCalls)
        .values({ task: row.task, inputHash: row.hash, model: row.model, ...values })
        .onConflictDoUpdate({
          target: [llmCalls.task, llmCalls.inputHash, llmCalls.model],
          set: values,
        });
    },
    async reserve(cap, keep) {
      const counted = await db
        .insert(budget)
        .values({ day: utcDay(), llmCalls: 1 })
        .onConflictDoUpdate({
          target: budget.day,
          set: { llmCalls: sql`${budget.llmCalls} + 1` },
          setWhere: lt(budget.llmCalls, cap - keep),
        })
        .returning({ n: budget.llmCalls });
      return counted.length > 0 && cap - keep > 0;
    },
  };
}

export function createMemoryLlmStore(): LlmStore {
  const rows = new Map<string, unknown>();
  const used = new Map<string, number>();
  return {
    async get(task, hash, model) {
      return rows.get(`${task}:${hash}:${model}`) ?? null;
    },
    async put(row) {
      rows.set(`${row.task}:${row.hash}:${row.model}`, row.output);
    },
    async reserve(cap, keep) {
      const day = utcDay();
      const n = used.get(day) ?? 0;
      if (n >= cap - keep) return false;
      used.set(day, n + 1);
      return true;
    },
  };
}

/** The switched-off client (no key): every step reports "off". */
export const NO_LLM: LlmClient = {
  configured: false,
  model: "none",
  json: async () => ({ kind: "off" }),
};
