import {
  SEED_NOTE_MESSAGES,
  type Domain,
  type ResolveEvent,
  type ResolveProblem,
  type SeedNote,
  type SeedResolution,
} from "@memory-lane/shared";
import type { QlooGateway } from "../qloo/gateway";
import { describeTypeFor, mapDescribe, type MappedCandidate } from "./mapDescribe";
import { mapFindTags } from "./mapFindTags";
import type { ResolutionStore } from "./store";

export interface ResolveInput {
  profileId: string;
  nickname: string | null;
}

export interface ResolveDeps {
  gateway: Pick<QlooGateway, "call">;
  store: ResolutionStore;
  /** Per-device/per-client lookup allowance; false stops the run before the next lookup. */
  allowLookup?: () => boolean;
  /** Daily budget units Stage 1 must leave for demo personas (gateway `reserve`). */
  budgetReserve?: number;
  /** Demo personas: Qloo answers are cached without expiry. Server-side only. */
  persistent?: boolean;
}

type StopReason =
  "not_connected" | "daily_quota" | "profile_quota" | "device_quota" | "unavailable";

// Fixed user text per outcome: harness summary/recovery text never reaches the browser.
const STOPS: Record<StopReason, { problem: ResolveProblem; message: string }> = {
  not_connected: {
    problem: "qloo_not_connected",
    message: "Qloo isn't connected yet, so nothing was looked up. Nothing was guessed.",
  },
  daily_quota: {
    problem: "quota",
    message:
      "We've hit today's research limit, so the rest wasn't looked up. Please try again tomorrow.",
  },
  profile_quota: {
    problem: "quota",
    message:
      "This profile has done a lot of research this hour, so the rest wasn't looked up. Please try again later.",
  },
  device_quota: {
    problem: "quota",
    message:
      "Lots of favourites were checked from here today, so the rest wasn't looked up. Please try again tomorrow.",
  },
  unavailable: {
    problem: "unavailable",
    message: "Qloo couldn't be reached just now, so the rest wasn't looked up. Please try again.",
  },
};

// One log line per favourite saying what happened (docs/06 screen 4).
const OUTCOME_LINES: Record<SeedNote, (text: string) => string> = {
  not_found: (t) => `Qloo couldn't find “${t}”.`,
  no_clear_match: (t) => `Qloo found no clear match for “${t}”.`,
  personal_info: (t) => `“${t}” wasn't sent to Qloo: it looks like personal information.`,
  invalid: (t) => `“${t}” couldn't be looked up.`,
  lookup_failed: (t) => `Qloo couldn't answer for “${t}” just now.`,
};

/**
 * Stage 1 (docs/05): looks each pending favourite up in Qloo — singers, films, TV and places with
 * qloo_describe, dishes and other interests with qloo_find_tags (they are tags in Qloo, not entities) —
 * and stores the candidates for
 * the caregiver to confirm. Nothing is confirmed here: a person always picks (US3). Stops early, with
 * an honest reason, when Qloo isn't connected or the budget is used up.
 */
export async function resolveSeeds(
  input: ResolveInput,
  deps: ResolveDeps,
  emit: (event: ResolveEvent) => void,
  isAborted: () => boolean = () => false,
): Promise<void> {
  const pending = await deps.store.pendingSeeds(input.profileId);
  if (pending.length === 0) {
    emit({ type: "step", message: "Every favourite has already been checked." });
  }

  for (const seed of pending) {
    if (isAborted()) return;
    if (deps.allowLookup && !deps.allowLookup()) {
      emit({ type: "error", ...STOPS.device_quota });
      break;
    }
    emit({ type: "step", message: `Looking up “${seed.rawText}” in Qloo…` });

    const domain = seed.domain as Domain;
    const asTag = domain === "food" || domain === "other";
    const type = describeTypeFor(domain);
    const ctx = {
      nickname: input.nickname,
      profileId: input.profileId,
      allowedTools: ["qloo_describe", "qloo_find_tags"] as const,
      reserve: deps.budgetReserve ?? 0,
      persistent: deps.persistent ?? false,
    };
    const result = asTag
      ? await deps.gateway.call("qloo_find_tags", { query: seed.rawText, limit: 10 }, ctx)
      : await deps.gateway.call(
          "qloo_describe",
          type ? { entity: seed.rawText, type } : { entity: seed.rawText },
          ctx,
        );
    const toCandidates = (envelope: Parameters<typeof mapDescribe>[0]): MappedCandidate[] =>
      asTag ? mapFindTags(envelope, domain, seed.rawText) : mapDescribe(envelope);

    let stop: StopReason | null = null;
    let note: SeedNote | null = null;
    let found = 0;

    switch (result.kind) {
      case "usable":
      case "needs_input": {
        const candidates = toCandidates(result.envelope);
        if (candidates.length > 0) {
          await deps.store.saveCandidates(seed.id, candidates, result.evidenceId);
          found = candidates.length;
        } else {
          note = "no_clear_match";
          await deps.store.markUnresolved(seed.id, note);
        }
        break;
      }
      case "empty":
        note = "not_found";
        await deps.store.markUnresolved(seed.id, note);
        break;
      case "rejected":
        // Only the PII guard's reasons mean "personal"; a refused tool or bad args can't be looked up.
        note =
          result.reason === "invalid_args" || result.reason === "not_allowed"
            ? "invalid"
            : "personal_info";
        await deps.store.markUnresolved(seed.id, note);
        break;
      case "error":
        if (result.envelope.error?.code === "QLOO_AUTH") stop = "not_connected";
        else {
          // Stop at the first failure: the rest would most likely fail too and spend budget (retries).
          note = "lookup_failed";
          stop = "unavailable";
          await deps.store.markLookupFailed(seed.id);
        }
        break;
      case "quota":
        stop = result.scope === "profile" ? "profile_quota" : "daily_quota";
        break;
      case "unavailable":
        stop = "unavailable";
        break;
    }

    if (stop && !note) {
      emit({ type: "error", ...STOPS[stop] });
      break;
    }
    const resolution: SeedResolution = {
      seedId: seed.id,
      rawText: seed.rawText,
      status: note === null ? "needs_input" : note === "lookup_failed" ? "pending" : "unresolved",
      candidates: [],
      note,
      message: note ? SEED_NOTE_MESSAGES[note] : null,
    };
    emit({
      type: "result",
      message: note
        ? OUTCOME_LINES[note](seed.rawText)
        : `Found ${found} possible match${found === 1 ? "" : "es"} for “${seed.rawText}”.`,
      data: resolution,
    });
    if (stop) {
      emit({ type: "error", ...STOPS[stop] });
      break;
    }
  }

  const resolutions = await deps.store.resolutions(input.profileId);
  const toChoose = resolutions.filter((r) => r.status === "needs_input").length;
  emit({
    type: "done",
    message:
      toChoose > 0
        ? `Done. ${toChoose} favourite${toChoose === 1 ? " needs" : "s need"} your choice.`
        : "Done.",
    data: resolutions,
  });
}
