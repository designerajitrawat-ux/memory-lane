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
import type { ProfileStore } from "../profiles/store";
import { normalise } from "../stage1/mapDescribe";
import { avoidMatcher } from "../stage2/avoid";
import { eraFor, yearFits } from "../stage2/era";
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

// docs/05 §4.3: the same model, no tools, asked for the same session from the same facts.
const GENERIC_SYSTEM = `You plan reminiscence sessions for older adults. Plan one 20 to 30 minute session of 6 items, in this order: an opening song, a film or TV show, a food, a place, one more item of your choice, and a closing song. For each item give its kind (song, film, tv, food or place), its name (for songs, the singer or band), its year for films, TV shows and songs (otherwise null), and one short sentence on why it suits this person. Respect the things to avoid.`;

/** What a generic assistant would be told: the same public facts the caregiver typed, nothing else. */
async function genericInput(profileId: string, deps: CompareDeps) {
  const ctx = await deps.taste.context(profileId);
  if (!ctx) return null;
  // The caregiver's own avoid-list (not what sessions learned later); anything personal stays out.
  const avoid = (
    await deps.db
      .select({ text: avoidItems.text })
      .from(avoidItems)
      .where(and(eq(avoidItems.profileId, profileId), eq(avoidItems.source, "caregiver")))
      .orderBy(asc(avoidItems.position))
  )
    .map((a) => a.text)
    .filter((t) => !HEALTH.test(normalizeText(t)) && !personalDetailProblem(t));
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

async function genericPlan(profileId: string, nickname: string | null, deps: CompareDeps) {
  const facts = await genericInput(profileId, deps);
  if (!facts) return null;
  const result = await deps.llm.json<GenericPlan>({
    task: "compare",
    system: GENERIC_SYSTEM,
    input: facts.input,
    schema: GenericPlanSchema,
    jsonSchema: GENERIC_JSON_SCHEMA,
    nickname,
  });
  return { facts, result };
}

/** Builds the generic plan for a demo persona ahead of time (seeding), so judges never wait. */
export async function warmGenericPlan(
  profileId: string,
  nickname: string | null,
  deps: CompareDeps,
) {
  await genericPlan(profileId, nickname, deps);
}

const key = (kind: string, name: string) => {
  const k = kind === "tv" ? "film" : kind; // a film and a TV show compare as "screen"
  return `${k}:${normalise(name)}`;
};

/**
 * Screen 9: the same model with no tools next to Memory Lane's newest session for this profile, with
 * the differences counted in code — Qloo evidence, items dated outside their years, items touching the
 * avoid-list, and items the plan shares with the other demo people's plans ("greatest hits").
 */
export async function buildCompare(
  profileId: string,
  nickname: string | null,
  /** The caller's owner hash (null for a visitor on a demo), to read this profile's own session. */
  ownerHash: string | null,
  deps: CompareDeps,
): Promise<CompareResponse | null> {
  const mine = await genericPlan(profileId, nickname, deps);
  if (!mine) return null;
  const { facts, result } = mine;
  const era = eraFor(facts.ctx.birthYear);
  const isAvoided = avoidMatcher(facts.avoid);
  // What the caregiver typed: their confirmed favourites and the places they lived. An item that is
  // one of these was handed back, not found ("“Crazy” — Patsy Cline" counts as Patsy Cline).
  const typed = [
    ...facts.ctx.seeds.map((s) => s.name),
    ...facts.ctx.regions.map((r) => r.split(",")[0] ?? r),
    ...facts.ctx.regions,
  ]
    .map((t) => normalise(t).replace(/^the /, ""))
    .filter((t) => t.length >= 3);
  const fromFavourites = (name: string) => {
    const n = normalise(name).replace(/^the /, "");
    return typed.some((t) => n === t || n.includes(t) || (n.length >= 5 && t.includes(n)));
  };

  // The other demo people, for the "shared" counts.
  const others = (await deps.profiles.listDemos()).filter((d) => d.id !== profileId);
  const otherGeneric = new Map<string, Set<string>>();
  const otherSessions = new Map<string, Set<string>>();
  for (const d of others) {
    const name = d.nickname ?? "a demo person";
    const plan = await genericPlan(d.id, d.nickname, deps);
    if (plan?.result.kind === "ok") {
      otherGeneric.set(name, new Set(plan.result.data.items.map((i) => key(i.kind, i.name))));
    }
    if (d.latestSessionId) {
      const s = await deps.sessions.get(d.latestSessionId, null);
      if (s) otherSessions.set(name, new Set(s.session.items.map((i) => key(i.kind, i.name))));
    }
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
  });

  const generic =
    result.kind === "ok"
      ? plan(
          result.data.items.map((i) => ({
            kind: i.kind,
            name: i.name,
            year: i.year,
            why: i.why,
            evidence: 0,
            outsideYears: dated(i.kind, i.year),
            avoided: isAvoided(i.name, i.why),
            sharedWith: sharedIn(otherGeneric, i.kind, i.name),
            fromFavourites: fromFavourites(i.name),
          })),
        )
      : null;

  const sessions = await deps.sessions.list(profileId);
  const newest = sessions[0];
  const session = newest ? await deps.sessions.get(newest.id, ownerHash) : null;
  const items: SessionItem[] = session?.session.items ?? [];
  const memoryLane = items.length
    ? plan(
        items.map((i) => ({
          kind: i.kind,
          name: i.name,
          year: i.year,
          why: i.why,
          evidence: i.evidenceIds.length,
          outsideYears: dated(i.kind, i.year),
          avoided: isAvoided(i.name, i.why),
          sharedWith: sharedIn(otherSessions, i.kind, i.name),
          fromFavourites: fromFavourites(i.name),
        })),
      )
    : null;

  return {
    state: result.kind === "ok" ? "ready" : result.kind === "refused" ? "failed" : result.kind,
    model: deps.llm.configured ? deps.llm.model : null,
    era: { from: era.from, to: era.to },
    generic,
    memoryLane,
    sessionId: newest?.id ?? null,
    comparedWith: others.map((d) => d.nickname ?? "a demo person"),
  };
}
