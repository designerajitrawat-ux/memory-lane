import { z } from "zod";
import {
  QlooToolNameSchema,
  type QlooCheck,
  type QlooEnvelope,
  type QlooToolName,
} from "@memory-lane/shared";
import {
  createMemoryBudgetStore,
  createRateLimiter,
  type BudgetStore,
  type RateLimiter,
} from "./budget";
import { cacheKey, createMemoryCacheStore, type CacheStore } from "./cache";
import { classify, isRetryable, localError, parseEnvelope, type EnvelopeKind } from "./envelope";
import { createMemoryEvidenceStore, type EvidenceStore } from "./evidence";
import type { QlooMcpClient } from "./mcpClient";
import { checkArgs, type RedactReason } from "./redact";
import { TOOL_ARG_SCHEMAS } from "./tools";

/**
 * The only way the agent talks to Qloo (CLAUDE.md rule 4). Every call goes:
 * allow-list → arg schema → PII guard → cache → limits → MCP (bounded retries) → envelope → evidence.
 * There is never a fallback to LLM-only content: failures come back as honest results.
 */
export interface QlooGateway {
  capabilities(): Promise<QlooCheck>;
  call(tool: string, args: unknown, ctx: CallContext): Promise<GatewayResult>;
}

export interface CallContext {
  /** Profile nickname, refused anywhere in the args. Required so no caller can forget it (null = none). */
  nickname: string | null;
  /** Used for the per-profile rate limit. */
  profileId?: string;
  /** Cache complete answers without expiry (demo personas). Server-side only, never from requests. */
  persistent?: boolean;
  /** Per-stage subset of the allow-list (docs/05 §5). */
  allowedTools?: readonly QlooToolName[];
  /** Daily budget units this call must leave untouched (kept for demo personas). Server-side only. */
  reserve?: number;
  /** Entity ids of confirmed seeds, read by the server: the only UUIDs the PII guard lets through. */
  trustedIds?: ReadonlySet<string>;
}

export type GatewayResult =
  | { kind: EnvelopeKind; envelope: QlooEnvelope; evidenceId: string; cached: boolean }
  | { kind: "rejected"; reason: "not_allowed" | "invalid_args" | RedactReason; field?: string }
  | { kind: "quota"; scope: "daily" | "profile"; message: string }
  | { kind: "unavailable"; message: string };

export interface GatewayDeps {
  mcp: QlooMcpClient;
  cache?: CacheStore;
  evidence?: EvidenceStore;
  budget?: BudgetStore;
  dailyBudget?: number;
  profileLimiter?: RateLimiter;
  cacheTtlMs?: number;
  log?: { warn(obj: object, msg: string): void };
  /** Live calls in flight at once (Phase 0: bursts of 8 parallel calls hit Qloo's 429). */
  maxConcurrent?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

// qloo_capabilities answers locally (no Qloo API call, no quota). `adapter.ready` is false until
// the harness has a Qloo credential.
const CapabilitiesSchema = z.object({
  adapter: z.object({ ready: z.boolean() }),
});

const CAPABILITIES_TIMEOUT_MS = 20_000; // first call also starts `qloo mcp` (~10 s cold)
const CALL_TIMEOUT_MS = 30_000;
const RETRY_BACKOFF_MS = [500, 1500]; // at most 2 retries, only when error.retryable
const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_TTL_MS = DAY_MS; // partial/degraded/empty answers are retried sooner, even for demos
const CACHEABLE: ReadonlySet<EnvelopeKind> = new Set(["usable", "empty", "needs_input"]);
const EVIDENCE_UNAVAILABLE = "Couldn't save the research record. Please try again.";

export function createQlooGateway(deps: GatewayDeps): QlooGateway {
  const {
    mcp,
    cache = createMemoryCacheStore(),
    evidence = createMemoryEvidenceStore(),
    budget = createMemoryBudgetStore(),
    dailyBudget = 500,
    profileLimiter = createRateLimiter({ max: 60, windowMs: 60 * 60 * 1000 }),
    cacheTtlMs = 7 * DAY_MS,
    log,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
    maxConcurrent = 3,
  } = deps;
  const slot = createSemaphore(maxConcurrent);

  // Store failures are logged by error code only (driver messages can carry SQL parameters).
  function storeError(tool: string, err: unknown) {
    log?.warn({ tool, code: errorCode(err) }, "qloo store error");
  }

  // The caller already paid for the first attempt; each retry takes another unit of the daily budget.
  async function liveCall(tool: QlooToolName, args: unknown, limit: number): Promise<QlooEnvelope> {
    let envelope: QlooEnvelope;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await slot(() =>
          mcp.callTool(tool, args as Record<string, unknown>, CALL_TIMEOUT_MS),
        );
        envelope = parseEnvelope(res.structuredContent, tool);
      } catch (err) {
        // A timed-out request may already have reached Qloo, so only a crashed transport is retried.
        envelope = isTimeout(err)
          ? localError(tool, "MCP_TIMEOUT", "The Qloo tools took too long to answer.", {
              retryable: false,
              recovery: "Try again in a minute.",
            })
          : localError(tool, "MCP_UNAVAILABLE", "Couldn't reach the Qloo tools.", {
              retryable: true,
              recovery: "Try again in a moment.",
            });
      }
      const backoff = RETRY_BACKOFF_MS[attempt];
      if (!isRetryable(envelope) || backoff === undefined) return envelope;
      if (!(await budget.tryConsume(limit).catch(() => false))) return envelope;
      await sleep(backoff);
    }
  }

  return {
    async capabilities() {
      let res;
      try {
        res = await mcp.callTool("qloo_capabilities", {}, CAPABILITIES_TIMEOUT_MS);
      } catch {
        return unavailable("Couldn't start or reach the Qloo tools.");
      }
      const parsed = CapabilitiesSchema.safeParse(res.structuredContent);
      if (res.isError || !parsed.success) {
        return unavailable("The Qloo tools sent an unexpected readiness answer.");
      }
      if (!parsed.data.adapter.ready) {
        return {
          ok: false,
          state: "no_credential",
          message: "Qloo tools are running but have no API key yet.",
        };
      }
      if ((await budget.usedToday().catch(() => 0)) >= dailyBudget) {
        return {
          ok: false,
          state: "quota_exhausted",
          message: "Today's Qloo research limit is reached. Saved results still work.",
        };
      }
      return { ok: true, state: "ok", message: "Qloo is connected and ready." };
    },

    async call(tool, rawArgs, ctx) {
      const name = QlooToolNameSchema.safeParse(tool);
      if (!name.success || (ctx.allowedTools && !ctx.allowedTools.includes(name.data))) {
        // The tool name may come from model output: log it only if it looks like a tool name.
        const logged = /^[a-z_]{1,40}$/.test(tool) ? tool : "(invalid)";
        log?.warn({ tool: logged, reason: "not_allowed" }, "qloo call rejected");
        return { kind: "rejected", reason: "not_allowed" };
      }
      const parsedArgs = TOOL_ARG_SCHEMAS[name.data].safeParse(rawArgs);
      if (!parsedArgs.success) {
        const field = parsedArgs.error.issues[0]?.path.join(".") || undefined;
        log?.warn({ tool, reason: "invalid_args", field }, "qloo call rejected");
        return { kind: "rejected", reason: "invalid_args", ...(field ? { field } : {}) };
      }
      const args = parsedArgs.data;
      const pii = checkArgs(args, {
        nickname: ctx.nickname,
        ...(ctx.trustedIds ? { trustedIds: ctx.trustedIds } : {}),
      });
      if (!pii.ok) {
        // Reason and field only — never the value.
        log?.warn({ tool, reason: pii.reason, field: pii.field }, "qloo call rejected");
        return { kind: "rejected", reason: pii.reason, field: pii.field };
      }

      const key = cacheKey(name.data, args);
      const hit = await cache.get(key).catch((err: unknown) => {
        storeError(name.data, err); // treat as a miss
        return null;
      });
      if (hit) {
        try {
          const evidenceId = await evidence.record({
            profileId: ctx.profileId,
            tool: name.data,
            args,
            envelope: hit,
            cached: true,
            latencyMs: 0,
          });
          return { kind: classify(hit), envelope: hit, evidenceId, cached: true };
        } catch (err) {
          storeError(name.data, err);
          return { kind: "unavailable", message: EVIDENCE_UNAVAILABLE };
        }
      }

      if (ctx.profileId && !profileLimiter.tryTake(ctx.profileId)) {
        return {
          kind: "quota",
          scope: "profile",
          message: "This profile has done a lot of research this hour. Try again later.",
        };
      }
      const limit = Math.max(0, dailyBudget - (ctx.reserve ?? 0));
      let allowed: boolean;
      try {
        allowed = await budget.tryConsume(limit);
      } catch (err) {
        storeError(name.data, err);
        return {
          kind: "unavailable",
          message: "Research is paused for a moment. Please try again shortly.",
        };
      }
      if (!allowed) {
        return {
          kind: "quota",
          scope: "daily",
          message: "We've hit today's research limit. Demo profiles still work.",
        };
      }

      const started = now();
      const envelope = await liveCall(name.data, args, limit);
      const kind = classify(envelope);
      if (CACHEABLE.has(kind)) {
        // Demo personas keep complete answers forever; incomplete ones are retried after a day.
        const complete = envelope.status === "ok" || envelope.status === "needs_input";
        const ttl = complete ? cacheTtlMs : Math.min(cacheTtlMs, SHORT_TTL_MS);
        const expiresAt = ctx.persistent && envelope.status === "ok" ? null : new Date(now() + ttl);
        await cache
          .set({ key, tool: name.data, args, envelope, expiresAt })
          .catch((err: unknown) => storeError(name.data, err));
      }
      try {
        const evidenceId = await evidence.record({
          profileId: ctx.profileId,
          tool: name.data,
          args,
          envelope,
          cached: false,
          latencyMs: now() - started,
        });
        return { kind, envelope, evidenceId, cached: false };
      } catch (err) {
        // Without evidence the result can't be used (rule 2); it is cached, so a retry costs nothing.
        storeError(name.data, err);
        return { kind: "unavailable", message: EVIDENCE_UNAVAILABLE };
      }
    },
  };
}

/** Runs at most `max` tasks at once; the rest wait in order. */
export function createSemaphore(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    // A finished task hands its slot straight to the next waiter, so a newcomer can't slip in
    // between and exceed the limit (security review S3).
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

function isTimeout(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === -32001 || (typeof e?.message === "string" && /timed? ?out/i.test(e.message));
}

function errorCode(err: unknown): string {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" || typeof code === "number" ? String(code) : "unknown";
}

function unavailable(message: string): QlooCheck {
  return { ok: false, state: "unavailable", message };
}
