import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  HEALTH,
  normalizeText,
  personalDetailProblem,
  type CompareItem,
  type ComparePlan,
  type CompareResponse,
  type SessionItem,
} from "@memory-lane/shared";
import { avoidItems } from "../db/schema";
import type { AppDb } from "../db/types";
import type { LlmClient } from "../llm/client";
import { DATA_NOT_INSTRUCTIONS, llmSafeTopics } from "../llm/topics";
import type { ProfileStore } from "../profiles/store";
import { normalise } from "../stage1/mapDescribe";
import { avoidMatcher } from "../stage2/avoid";
import { eraFor, yearFits } from "../stage2/era";
import { captionAllowed } from "../stage2/language";
import type { TasteStore } from "../stage2/store";
import type { SessionStore } from "../stage3/store";

export interface CompareDeps {
  profiles: ProfileStore;
  taste: TasteStore;
  sessions: SessionStore;
  llm: LlmClient;
  db: AppDb;
}

const GenericItemSchema = z.object({
  kind: z.enum(["song", "film", "tv", "food", "place"]),
  name: z.string().trim().min(1).max(120),
  year: z.number().int().nullable(),
  why: z.string().trim().max(400),
});
const GenericPlanSchema = z.object({ items: z.array(GenericItemSchema).min(3).max(8) });
type GenericPlan = z.infer<typeof GenericPlanSchema>;

const GENERIC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "name", "year", "why"],
        properties: {
          kind: { type: "string", enum: ["song", "film", "tv", "food", "place"] },
          name: { type: "string" },
          year: { type: ["integer", "null"] },
          why: { type: "string" },
        },
      },
    },
  },
};

// docs/05 §4.3: the same model, no tools, the same facts and the same task as Memory Lane's first
// session — a favourite or two, then new things they're likely to enjoy (judge review: a prompt that
// never asks for anything new can only hand the favourites back).
const GENERIC_SYSTEM = `You plan reminiscence sessions for older adults. Plan one 20 to 30 minute session of 6 items, in this order: an opening song, a film or TV show, a food, a place, one more item of your choice, and a closing song. Use their favourites as clues: you may include one or two of them, but most items should be new things they are likely to enjoy, from the years and places they grew up in. For each item give its kind (song, film, tv, food or place), its name (for songs, the singer or band), its year for films, TV shows and songs (otherwise null), and one short sentence on why it suits this person. Respect the things to avoid.
${DATA_NOT_INSTRUCTIONS}`;

/** What a generic assistant would be told: the same public facts the caregiver typed, nothing else. */
async function genericInput(profileId: string, deps: CompareDeps) {
  const ctx = await deps.taste.context(profileId);
  if (!ctx) return null;
  // The caregiver's own avoid-list (not what sessions learned later); anything personal stays out.
  const avoid = llmSafeTopics(
    (
      await deps.db
        .select({ text: avoidItems.text })
        .from(avoidItems)
        .where(and(eq(avoidItems.profileId, profileId), eq(avoidItems.source, "caregiver")))
        .orderBy(asc(avoidItems.position))
    ).map((a) => a.text),
  );
  return {
    ctx,
    avoid,
    input: {
      bornIn: ctx.birthYear,
      livedIn: ctx.regions,
      languages: ctx.languages,
      favourites: ctx.seeds.map((s) => s.name),
      thingsToAvoid: avoid,
    },
  };
}

async function genericPlan(
  profileId: string,
  nickname: string | null,
  deps: CompareDeps,
  opts: { cacheOnly?: boolean; seeding?: boolean; allow?: () => boolean } = {},
) {
  const facts = await genericInput(profileId, deps);
  if (!facts) return null;
  const result = await deps.llm.json<GenericPlan>({
    task: "compare",
    system: GENERIC_SYSTEM,
    input: facts.input,
    schema: GenericPlanSchema,
    jsonSchema: GENERIC_JSON_SCHEMA,
    nickname,
    ...(opts.cacheOnly ? { cacheOnly: true } : {}),
    ...(opts.seeding ? { seeding: true } : {}),
    ...(opts.allow ? { allow: opts.allow } : {}),
  });
  return { facts, result };
}

/** Builds the generic plan for a demo persona ahead of time (seeding), so judges never wait. */
export async function warmGenericPlan(
  profileId: string,
  nickname: string | null,
  deps: CompareDeps,
) {
  await genericPlan(profileId, nickname, deps, { seeding: true });
}

const key = (kind: string, name: string) => {
  const k = kind === "tv" ? "film" : kind; // a film and a TV show compare as "screen"
  return `${k}:${normalise(name)}`;
};

/**
 * A reason Memory Lane would never show (security review W4): claims about the person, memory words,
 * medical or personal details. It is counted, and replaced with fixed text on the page.
 */
export const reasonBlocked = (why: string) =>
  !captionAllowed(why) ||
  /\b(remember|recall|forget|forgot|forgotten|memory|memories)\b/i.test(why) ||
  HEALTH.test(normalizeText(why)) ||
  personalDetailProblem(why) !== null;

/**
 * Screen 9: the same model with no tools, given the same facts and the same task, next to Memory
 * Lane's first session for this profile (made from the same facts, before any reactions), with the
 * differences counted in code — what each found beyond the favourites, Qloo evidence, items dated
 * outside their years, items touching the avoid-list, items shared with the other demo people's plans
 * ("greatest hits"), and reasons whose wording Memory Lane's checks block.
 */
export async function buildCompare(
  profile: { id: string; nickname: string | null; isDemo: boolean },
  /** The caller's owner hash (null for a visitor on a demo), to read this profile's own session. */
  ownerHash: string | null,
  deps: CompareDeps,
  /** Per-device/per-client allowance for the one live call this page may make. */
  allow?: () => boolean,
): Promise<CompareResponse | null> {
  const profileId = profile.id;
  const mine = await genericPlan(profileId, profile.nickname, deps, allow ? { allow } : {});
  if (!mine) return null;
  const { facts, result } = mine;
  const era = eraFor(facts.ctx.birthYear);
  const isAvoided = avoidMatcher(facts.avoid);

  // "One of their favourites" (judge review): Memory Lane's items by Qloo id, exactly; the generic
  // plan's by a favourite's name inside the item's name ("“Crazy” — Patsy Cline" is Patsy Cline), or a
  // place they lived, word for word.
  const seedIds = new Set(facts.ctx.seeds.map((s) => s.entityId.toLowerCase()));
  const bare = (s: string) => normalise(s).replace(/^the /, "");
  const favourites = facts.ctx.seeds
    .map((s) => ({ name: s.name, bare: bare(s.name) }))
    .filter((f) => f.bare.length >= 3);
  const placesLived = new Set(
    facts.ctx.regions.flatMap((r) => [normalise(r), normalise(r.split(",")[0] ?? r)]),
  );
  const genericMatch = (kind: string, name: string): string | null => {
    const n = bare(name);
    if (kind === "place" && placesLived.has(normalise(name))) return "Where they lived";
    if (favourites.some((f) => f.bare === n)) return "One of their favourites";
    if (kind === "place") return null;
    const within = favourites.find((f) => n.includes(f.bare));
    if (!within) return null;
    // A song named with its singer: a favourite singer handed back with a song of theirs.
    return kind === "song"
      ? `By ${within.name}, one of their favourites`
      : "One of their favourites";
  };

  // How each of Memory Lane's items got into the profile (an AI suggestion is said plainly).
  const sourceOf = new Map(
    ((await deps.taste.latest(profileId))?.items ?? []).map((i) => [
      i.entityId.toLowerCase(),
      i.source,
    ]),
  );

  // "Greatest hits": what the demo people's plans share, counted only among the demos themselves
  // (a private copy of a demo would otherwise be compared with its own original; ux review C2), from
  // cached plans and first sessions only (a visitor's page never makes live calls for other
  // profiles), and only for people whose plans exist on both sides (ux review W6).
  const others = profile.isDemo
    ? (await deps.profiles.listDemos()).filter((d) => d.id !== profileId)
    : [];
  const otherGeneric = new Map<string, Set<string>>();
  const otherSessions = new Map<string, Set<string>>();
  for (const d of others) {
    const name = d.nickname ?? "a demo person";
    const plan = await genericPlan(d.id, d.nickname, deps, { cacheOnly: true });
    const firstOfTheirs = (await deps.sessions.list(d.id)).at(-1);
    const s = firstOfTheirs ? await deps.sessions.get(firstOfTheirs.id, null) : null;
    if (plan?.result.kind !== "ok" || !s) continue;
    otherGeneric.set(name, new Set(plan.result.data.items.map((i) => key(i.kind, i.name))));
    otherSessions.set(name, new Set(s.session.items.map((i) => key(i.kind, i.name))));
  }
  const sharedIn = (pool: Map<string, Set<string>>, kind: string, name: string) =>
    [...pool.entries()].filter(([, keys]) => keys.has(key(kind, name))).map(([who]) => who);

  const dated = (kind: string, year: number | null) =>
    (kind === "film" || kind === "tv" || kind === "song") && year !== null && !yearFits(year, era);

  const plan = (items: CompareItem[]): ComparePlan => ({
    items,
    withEvidence: items.filter((i) => i.evidence > 0).length,
    outsideYears: items.filter((i) => i.outsideYears).length,
    avoided: items.filter((i) => i.avoided).length,
    shared: items.filter((i) => i.sharedWith.length > 0).length,
    beyondFavourites: items.filter((i) => !i.fromFavourites).length,
    wordingBlocked: items.filter((i) => i.wordingBlocked).length,
  });

  const generic =
    result.kind === "ok"
      ? plan(
          result.data.items.map((i) => {
            const blocked = reasonBlocked(i.why);
            const matched = genericMatch(i.kind, i.name);
            return {
              kind: i.kind,
              name: i.name,
              year: i.year,
              // Only wording that passes Memory Lane's own checks is shown.
              why: blocked ? "" : i.why,
              evidence: 0,
              outsideYears: dated(i.kind, i.year),
              avoided: isAvoided(i.name, i.why),
              sharedWith: sharedIn(otherGeneric, i.kind, i.name),
              fromFavourites: matched !== null,
              matched,
              source: null,
              wordingBlocked: blocked,
            };
          }),
        )
      : null;

  // Memory Lane's first session still kept (sessions are listed newest first).
  const first = (await deps.sessions.list(profileId)).at(-1);
  const session = first ? await deps.sessions.get(first.id, ownerHash) : null;
  const items: SessionItem[] = session?.session.items ?? [];
  const memoryLane = items.length
    ? plan(
        items.map((i) => {
          const favourite = seedIds.has(i.entityId.toLowerCase());
          return {
            kind: i.kind,
            name: i.name,
            year: i.year,
            why: i.why,
            evidence: i.evidenceIds.length,
            outsideYears: dated(i.kind, i.year),
            avoided: isAvoided(i.name, i.why),
            sharedWith: sharedIn(otherSessions, i.kind, i.name),
            fromFavourites: favourite,
            matched: favourite ? "One of their favourites" : null,
            source: sourceOf.get(i.entityId.toLowerCase()) ?? null,
            wordingBlocked: false,
          };
        }),
      )
    : null;

  return {
    state:
      result.kind === "ok"
        ? "ready"
        : result.kind === "off" ||
            result.kind === "budget" ||
            result.kind === "limit" ||
            result.kind === "refused"
          ? result.kind
          : "failed",
    model: deps.llm.configured ? deps.llm.model : null,
    era: { from: era.from, to: era.to },
    generic,
    memoryLane,
    sessionId: first?.id ?? null,
    sessionNumber: first?.number ?? null,
    nickname: profile.nickname,
    demo: profile.isDemo,
    comparedWith: [...otherGeneric.keys()],
  };
}
