import type {
  ResolveProblem,
  TasteDomain,
  TasteEvent,
  TasteItem,
  TasteProfile,
} from "@memory-lane/shared";
import type { GatewayResult, QlooGateway } from "../qloo/gateway";
import { typeLabel } from "../stage1/labels";
import { normalise, short, str, yearOf } from "../stage1/mapDescribe";
import { avoidMatcher } from "./avoid";
import { bumpDistance, eraFor, eraPlacement, yearFits, type Era, type EraPlacement } from "./era";
import type { ConfirmedSeed, TasteStore } from "./store";
import { validateTasteItems } from "./validators";

export interface TasteInput {
  profileId: string;
  nickname: string | null;
}

export interface TasteDeps {
  gateway: Pick<QlooGateway, "call">;
  store: TasteStore;
  /** Per-device/per-client allowance, charged per Qloo call; false skips the call. */
  allowCall?: () => boolean;
  /** Daily budget units user research must leave for demo personas (gateway `reserve`). */
  budgetReserve?: number;
}

const PER_DOMAIN = 6;
const TOOLS = ["qloo_recommend", "qloo_find_tags"] as const;
const FAVOURITE_CAPTION = "A favourite you added; Qloo confirmed the match.";
const FOOD_TAGS = new Set(["cuisine", "popular_food_item", "specialty_dish"]);

const SEED_DOMAIN: Record<string, TasteDomain | undefined> = {
  music: "music",
  film: "film_tv",
  tv: "film_tv",
  food: "food",
  place: "places",
};
// Signals in order of how well they carry taste (Phase 0: artist signals are the strongest).
const SIGNAL_ORDER = ["music", "film", "tv", "place"];

const DOMAIN_NAMES: Record<TasteDomain, string> = {
  music: "Music",
  film_tv: "Films and TV",
  food: "Food",
  places: "Places",
};

const PLACEMENT_ORDER: Record<EraPlacement, number> = { fits: 0, unknown: 1, later: 2 };

// Places worth reminiscing about are the lasting ones: landmarks, markets, parks, the seaside. Most of
// what Qloo returns near a town is new (live check, Amritsar: hotels, banquet halls, bars, a spa), and
// a 1950s childhood didn't happen there. Qloo descriptions open with the kind of place (a hotel, a
// museum, a garden…), so the name and the opening words decide.
const NOT_A_MEMORY_PLACE =
  /\b(hotels?|resorts?|spas?|wellness|banquets?|event venues?|wedding venues?|hostels?|guest ?houses?|lodges?|motels?|inns?|bnb|b&b|bed and breakfast|homestays?|farmstays?|niwas|dharamshala|sarai|accommodation|gyms?|fitness|salons?|hospitals?|clinics?|apartments?|residenc(?:y|es)|offices?|coworking|bars?|pubs?|nightclubs?|microbrewer(?:y|ies)|malls?|multiplex|water parks?|go-karts?)\b/i;
const MEMORY_PLACE =
  /\b(temples?|gurdwaras?|shrines?|mosques?|churche?s?|cathedrals?|forts?|palaces?|museums?|markets?|bazaars?|gardens?|parks?|lakes?|rivers?|beach(?:es)?|piers?|promenades?|towers?|cinemas?|theat(?:re|er)s?|stadiums?|zoos?|monuments?|heritage|historic|landmarks?|squares?|ghats?|old city|ballrooms?|dance halls?|seaside|amusement|fairground|bridges?|harbou?rs?|stations?)\b/i;
const lead = (f: { name: string; description: string | null }) =>
  `${f.name} ${(f.description ?? "").split(/\s+/).slice(0, 7).join(" ")}`;
// A reminiscence session is gentle, whatever the avoid-list says: Qloo suggestions about atrocities or
// suicide are left out (live check: "Sophie's Choice" came back for a 1946 US persona)…
const HEAVY =
  /\b(massacres?|genocides?|holocaust|auschwitz|concentration camps?|death camps?|war crimes?|atrocit(?:y|ies)|suicides?|rapes?|abuse|abusive|torture)\b/i;
// …and so are sites of grief.
const HEAVY_PLACE =
  /\b(war memorials?|memorials? to the victims|cemeter(?:y|ies)|graveyards?|prisons?)\b/i;

type Rec = Record<string, unknown>;

/** One thing Qloo returned, with the favourites Qloo says led to it. */
interface Found {
  entityId: string;
  name: string;
  entityType: string | null;
  year: number | null;
  description: string | null;
  /** Qloo's full description: what the avoid-list and the gentle filter read (display is shortened). */
  text: string;
  becauseOf: string[];
  evidenceId: string;
  /** Places: ISO country code from Qloo's geocode. */
  countryCode: string | null;
}

type FailCause = "device" | "profile" | "daily" | "outage" | "rejected";

type Outcome =
  | { kind: "found"; found: Found[] }
  | { kind: "stop"; problem: ResolveProblem }
  | { kind: "failed"; cause: FailCause; reason: string }
  | { kind: "skipped" };

// When every research step failed: nothing is saved and the person keeps the version they had.
const ALL_FAILED: Record<FailCause, string> = {
  device:
    "Lots of research was done from here today, so nothing new was built. Your current version stays; please try again tomorrow.",
  profile:
    "This profile has done a lot of research this hour, so nothing new was built. Your current version stays; please try again later.",
  daily:
    "We've hit today's research limit, so nothing new was built. Your current version stays; please try again tomorrow.",
  outage:
    "Qloo couldn't be reached just now, so nothing new was built. Your current version stays; please try again.",
  rejected: "The research couldn't be sent, so nothing new was built. Your current version stays.",
};

/**
 * Stage 2 (docs/05): turns the confirmed favourites into a Life Taste Profile with Qloo. The plan is
 * fixed and visible, each step grounded: singers via artist → artist recommends (Phase 0: the most
 * era-faithful), films and TV via recommends kept to the person's era by `release_year` in code,
 * places via recommends near where they grew up, dishes via Qloo's food tags. Code then validates
 * every item (evidence, avoid-list, wording) before anything is saved or shown.
 */
export async function buildTasteProfile(
  input: TasteInput,
  deps: TasteDeps,
  emit: (event: TasteEvent) => void,
  isAborted: () => boolean = () => false,
): Promise<TasteProfile | null> {
  const ctx = await deps.store.context(input.profileId);
  if (!ctx || ctx.seeds.length === 0) {
    emit({
      type: "error",
      problem: "unavailable",
      message: "Confirm at least one favourite with Qloo first.",
    });
    emit({ type: "done", message: "Nothing was built.", data: null });
    return null;
  }

  const era = eraFor(ctx.birthYear);
  const isAvoided = avoidMatcher(ctx.avoid);
  // A favourite that is also on the avoid-list never steers the research (rule 9; review W3b).
  const entitySeeds = ctx.seeds
    .filter((s) => s.entityType?.startsWith("urn:entity:"))
    .filter((s) => !isAvoided(s.name, s.description))
    .sort((a, b) => order(a.domain) - order(b.domain));
  const signals = entitySeeds.slice(0, 5).map((s) => s.entityId);
  const trustedIds = new Set(entitySeeds.map((s) => s.entityId.toLowerCase()));
  const placeSeeds = entitySeeds.filter((s) => s.domain === "place").slice(0, 3);
  const placeSignals = placeSeeds.map((s) => s.entityId);
  const because = entitySeeds.slice(0, 2).map((s) => s.name);
  // Captions only ever name favourites that were actually sent for that call (review W9).
  const placeBecause = placeSeeds.length ? placeSeeds.slice(0, 2).map((s) => s.name) : because;
  const youth = ctx.regions[0] ?? null;
  const youthLabel = youth?.split(",")[0]?.trim() || null;

  emit({
    type: "step",
    message: `Starting from ${count(ctx.seeds.length, "confirmed favourite")}. Films and TV will be kept to ${era.from}–${era.to}, the years they were young and busy.`,
  });

  const call = async (
    tool: (typeof TOOLS)[number],
    args: Rec,
  ): Promise<GatewayResult | "refused" | null> => {
    if (isAborted()) return null;
    // A used-up allowance is a failure to report, never a silent skip (review W4/C3).
    if (deps.allowCall && !deps.allowCall()) return "refused";
    return deps.gateway.call(tool, args, {
      nickname: input.nickname,
      profileId: input.profileId,
      allowedTools: TOOLS,
      reserve: deps.budgetReserve ?? 0,
      trustedIds,
    });
  };

  const hasSignals = signals.length > 0;
  if (hasSignals) {
    emit({
      type: "step",
      message: `Asking Qloo what people who enjoy ${join(because)} also listen to and watch…`,
    });
  }
  if (youthLabel) {
    emit({
      type: "step",
      message: `Asking Qloo about places and dishes linked with ${youthLabel}…`,
    });
  }

  const recommend = (target: string, extra: Rec = {}, limit = 20) =>
    hasSignals
      ? call("qloo_recommend", { target_type: target, signals, limit, explain: true, ...extra })
      : Promise.resolve(null);
  const [artists, movies, shows, places, dishes] = await Promise.all([
    recommend("artist"),
    recommend("movie"),
    recommend("tv_show"),
    // A confirmed place is the best signal for other places (people who like it also visit…).
    youth
      ? recommend(
          "place",
          { filter_location: youth, ...(placeSignals.length ? { signals: placeSignals } : {}) },
          20,
        )
      : Promise.resolve(null),
    youthLabel
      ? call("qloo_find_tags", { query: `${youthLabel} food`, limit: 12 })
      : Promise.resolve(null),
  ]);
  if (isAborted()) return null;

  const outcomes = {
    artists: read(artists, readRecommend),
    movies: read(movies, readRecommend),
    shows: read(shows, readRecommend),
    places: read(places, readRecommend),
    dishes: read(dishes, readTags),
  };
  const stop = Object.values(outcomes).find((o) => o.kind === "stop");
  if (stop?.kind === "stop") {
    emit({ type: "error", problem: stop.problem, message: STOP_MESSAGES[stop.problem] });
    emit({ type: "done", message: "Nothing was built.", data: null });
    return null;
  }
  // Every research step failed: keep the version they have rather than save a weaker one (review W2).
  const attempted = Object.values(outcomes).filter((o) => o.kind !== "skipped");
  if (attempted.length > 0 && attempted.every((o) => o.kind === "failed")) {
    const causes = new Set(attempted.map((o) => (o.kind === "failed" ? o.cause : "outage")));
    const cause = (["device", "profile", "daily", "outage", "rejected"] as const).find((c) =>
      causes.has(c),
    );
    const message = ALL_FAILED[cause ?? "outage"];
    emit({
      type: "error",
      problem: cause === "outage" || cause === "rejected" ? "unavailable" : "quota",
      message,
    });
    emit({ type: "done", message: "Nothing new was saved.", data: null });
    return null;
  }

  const notes: string[] = [];
  const favourites = (domain: TasteDomain) =>
    ctx.seeds.filter((s) => SEED_DOMAIN[s.domain] === domain).map(fromSeed);
  const avoidedCount = { n: 0 };
  const heavyCount = { n: 0 };
  const keep = (f: Found) => {
    if (isAvoided(f.name, f.text)) {
      avoidedCount.n++;
      return false;
    }
    if (HEAVY.test(`${f.name} ${f.text}`)) {
      heavyCount.n++;
      return false;
    }
    return true;
  };
  const fresh = (have: TasteItem[]) => (f: Found) =>
    !have.some((i) => i.entityId === f.entityId || normalise(i.name) === normalise(f.name));

  // Music: favourites, then Qloo's artists, those it describes as active in their era first.
  const music = favourites("music");
  const artistFound = found(outcomes.artists).filter(keep).filter(fresh(music));
  // Stable sort: within each group Qloo's own order (affinity) stays. Mostly-later voices only fill in
  // when fewer than two others are left.
  const placed = artistFound
    .map((f) => ({ f, place: PLACEMENT_ORDER[eraPlacement(f.description, era)] }))
    .sort((a, b) => a.place - b.place);
  const notLater = placed.filter((p) => p.place < PLACEMENT_ORDER.later);
  const pool = notLater.length >= 2 ? notLater : placed;
  music.push(...pool.slice(0, PER_DOMAIN - music.length).map((s) => fromFound(s.f, "music")));
  if (hasSignals && outcomes.artists.kind === "found") {
    emit({
      type: "step",
      message: `Found ${count(Math.max(0, music.length - favourites("music").length), "singer")} for music; the ones Qloo describes as active in their era come first.`,
    });
  }

  // Films and TV: only what was made in their era, closest to the reminiscence bump first.
  const filmTv = favourites("film_tv");
  const inYears = (o: Outcome) => {
    const all = found(o);
    const fitting = all
      .filter((f) => yearFits(f.year, era))
      .filter(keep)
      .filter(fresh(filmTv))
      .sort((a, b) => bumpDistance(a.year ?? 0, era) - bumpDistance(b.year ?? 0, era));
    return { all: all.length, fitting };
  };
  const filmPick = inYears(outcomes.movies);
  const tvPick = inYears(outcomes.shows);
  const room = PER_DOMAIN - filmTv.length;
  const films = filmPick.fitting.slice(0, Math.max(room - Math.min(2, tvPick.fitting.length), 0));
  const tv = tvPick.fitting.slice(0, room - films.length);
  filmTv.push(
    ...films.map((f) => fromFound(f, "film_tv")),
    ...tv.map((f) => fromFound(f, "film_tv")),
  );
  if (hasSignals && (outcomes.movies.kind === "found" || outcomes.shows.kind === "found")) {
    const suggested = filmPick.all + tvPick.all;
    const kept = films.length + tv.length;
    emit({
      type: "step",
      message: `Qloo suggested ${count(suggested, "film or TV show", "films and TV shows")}; kept ${kept} from ${era.from}–${era.to}.`,
    });
    if (suggested > 0 && kept === 0) {
      notes.push(
        `Qloo's film and TV suggestions for these favourites were all from other years, so none were added.`,
      );
    } else if (suggested > kept) {
      notes.push(
        `Films and TV were kept to ${era.from}–${era.to}; Qloo's other suggestions were from later years.`,
      );
    }
  }

  // Places near where they grew up: somewhere to talk about, not a hotel or a spa; in the same country
  // as the rest (Qloo's location filter crossed a border to Wagah, Pakistan — live check); and not a
  // site of tragedy.
  const placeItems = favourites("places");
  const localCountry = mostCommon(found(outcomes.places).map((f) => f.countryCode));
  const placeFound = found(outcomes.places)
    .filter((f) => !NOT_A_MEMORY_PLACE.test(lead(f)) && MEMORY_PLACE.test(lead(f)))
    .filter((f) => !HEAVY_PLACE.test(`${f.name} ${f.text}`))
    .filter((f) => !localCountry || !f.countryCode || f.countryCode === localCountry)
    .filter(keep)
    .filter(fresh(placeItems));
  placeItems.push(
    ...placeFound
      .slice(0, PER_DOMAIN - placeItems.length)
      .map((f) => fromFound(f, "places", youthLabel)),
  );

  // Dishes: favourites (Qloo food tags), then the dishes Qloo links with where they grew up.
  const food = favourites("food");
  const dishFound = found(outcomes.dishes).filter(keep).filter(fresh(food));
  for (const f of dishFound) {
    if (food.length >= 5) break;
    // "Chur Chur Naan With Amritsari Chole" after "Amritsari Chur Chur Naan And Cholle": the same dish.
    if (food.some((i) => similarNames(i.name, f.name))) continue;
    food.push(fromFound(f, "food", youthLabel));
  }
  if (youthLabel && outcomes.places.kind === "found") {
    emit({
      type: "step",
      message: `Found ${count(placeItems.length, "place")} and ${count(food.length, "dish", "dishes")} for ${youthLabel}.`,
    });
  }

  for (const [label, o] of [
    ["Music", outcomes.artists],
    ["Films", outcomes.movies],
    ["TV", outcomes.shows],
    ["Places", outcomes.places],
    ["Dishes", outcomes.dishes],
  ] as const) {
    if (o.kind === "failed") notes.push(`${label} couldn't be researched just now (${o.reason}).`);
  }
  if (!hasSignals) {
    notes.push("Add a singer, film, TV show or place they love to fill in music, film and places.");
  }
  if (avoidedCount.n > 0) {
    notes.push(
      `${count(avoidedCount.n, "suggestion")} touched the things to avoid and ${avoidedCount.n === 1 ? "was" : "were"} left out.`,
    );
  }
  if (heavyCount.n > 0) {
    notes.push(
      `${count(heavyCount.n, "suggestion")} about painful subjects ${heavyCount.n === 1 ? "was" : "were"} left out to keep sessions gentle.`,
    );
  }

  // Validate everything against what is stored (evidence, avoid-list, wording) before saving.
  const candidates = [...music, ...filmTv, ...food, ...placeItems];
  const evidence = await deps.store.evidence(input.profileId, [
    ...new Set(candidates.flatMap((i) => i.evidenceIds)),
  ]);
  const { kept } = validateTasteItems(candidates, evidence, isAvoided);
  emit({
    type: "step",
    message: `Checked every item against Qloo's records and the things to avoid: ${kept.length} kept.`,
  });
  if (kept.length === 0) {
    emit({
      type: "error",
      problem: "unavailable",
      message: "Qloo didn't return anything that could be used this time. Please try again later.",
    });
    emit({ type: "done", message: "Nothing was built.", data: null });
    return null;
  }

  const partial = Object.values(outcomes).some((o) => o.kind === "failed");
  const profile = await deps.store.save(input.profileId, {
    era: { from: era.from, to: era.to },
    partial,
    items: kept,
    notes,
  });
  const domains = [...new Set(kept.map((i) => i.domain))].map((d) => DOMAIN_NAMES[d].toLowerCase());
  emit({
    type: "done",
    message: `Life Taste Profile ready: ${count(kept.length, "item")} across ${join(domains)}.`,
    data: profile,
  });
  return profile;

  function fromFound(f: Found, domain: TasteDomain, where: string | null = null): TasteItem {
    const fallback = domain === "food" ? [] : domain === "places" ? placeBecause : because;
    const names = f.becauseOf.length ? f.becauseOf : fallback;
    const caption =
      domain === "food"
        ? `Found in Qloo's food tags for ${where ?? "where they grew up"}.`
        : names.length
          ? `People who enjoy ${join(names)} often also enjoy ${f.name}${domain === "places" && where ? `, in ${where}` : ""}.`
          : "Often enjoyed by people with similar tastes.";
    return {
      entityId: f.entityId,
      domain,
      entityType: f.entityType,
      typeLabel: typeLabel(f.entityType),
      name: f.name,
      year: f.year,
      description: f.description,
      caption,
      source: "qloo",
      becauseOf: names,
      evidenceIds: [f.evidenceId],
    };
  }
}

function fromSeed(s: ConfirmedSeed): TasteItem {
  return {
    entityId: s.entityId,
    domain: SEED_DOMAIN[s.domain] ?? "music",
    entityType: s.entityType,
    typeLabel: typeLabel(s.entityType),
    name: s.name,
    year: s.year,
    description: s.description,
    caption: FAVOURITE_CAPTION,
    source: "favourite",
    becauseOf: [],
    evidenceIds: [s.evidenceId],
  };
}

const STOP_MESSAGES: Record<ResolveProblem, string> = {
  qloo_not_connected: "Qloo isn't connected yet, so nothing was looked up. Nothing was guessed.",
  quota:
    "We've hit today's research limit, so the profile wasn't built. Please try again tomorrow.",
  unavailable: "Qloo couldn't be reached just now, so the profile wasn't built. Please try again.",
};

/** Maps one gateway answer to an outcome; only "not connected" stops the whole build. */
function read(
  result: GatewayResult | "refused" | null,
  parse: (envelope: Rec, evidenceId: string) => Found[],
): Outcome {
  if (!result) return { kind: "skipped" };
  if (result === "refused") {
    return {
      kind: "failed",
      cause: "device",
      reason: "today's research for this device is used up",
    };
  }
  switch (result.kind) {
    case "usable":
    case "needs_input":
    case "empty":
      return { kind: "found", found: parse(result.envelope as Rec, result.evidenceId) };
    case "error":
      return result.envelope.error?.code === "QLOO_AUTH"
        ? { kind: "stop", problem: "qloo_not_connected" }
        : { kind: "failed", cause: "outage", reason: "Qloo didn't answer" };
    case "quota":
      return result.scope === "profile"
        ? {
            kind: "failed",
            cause: "profile",
            reason: "this profile's research for the hour is used up",
          }
        : { kind: "failed", cause: "daily", reason: "today's research limit was reached" };
    case "unavailable":
      return { kind: "failed", cause: "outage", reason: "Qloo couldn't be reached" };
    case "rejected":
      return { kind: "failed", cause: "rejected", reason: "the request couldn't be sent" };
  }
}

const found = (o: Outcome) => (o.kind === "found" ? o.found : []);

/** recommend results: entity, year, description, and the favourites Qloo says contributed most. */
function readRecommend(envelope: Rec, evidenceId: string): Found[] {
  const names = new Map<string, string>();
  for (const s of list(obj(envelope.interpretation)?.signals)) {
    const id = str(s.entityId);
    const name = str(s.name);
    if (id && name) names.set(id, name);
  }
  return list(envelope.results).flatMap((r) => {
    const entityId = str(r.entity_id ?? r.id);
    const name = str(r.name);
    if (!entityId || !name) return [];
    const props = obj(r.properties) ?? {};
    const contributions = list(obj(r.explainability)?.["signal.interests.entities"])
      .map((c) => ({ id: str(c.entity_id), score: typeof c.score === "number" ? c.score : 0 }))
      .filter((c): c is { id: string; score: number } => !!c.id && names.has(c.id))
      .sort((a, b) => b.score - a.score);
    return [
      {
        entityId,
        name,
        entityType: str(r.subtype ?? r.type) ?? null,
        year: yearOf(props.release_year ?? props.release_date),
        description: short(str(props.short_description ?? props.description)),
        text: fullText(props),
        becauseOf: contributions.slice(0, 2).map((c) => names.get(c.id) as string),
        evidenceId,
        countryCode: str(obj(props.geocode)?.country_code)?.toUpperCase() ?? null,
      },
    ];
  });
}

/** find_tags results: food tags only, one per dish name. */
function readTags(envelope: Rec, evidenceId: string): Found[] {
  const seen = new Set<string>();
  return list(envelope.results).flatMap((r) => {
    const id = str(r.id);
    const name = str(r.name);
    const type = str(r.type) ?? null;
    const category = type?.split(":")[2] ?? "";
    if (!id || !name || !FOOD_TAGS.has(category) || seen.has(normalise(name))) return [];
    seen.add(normalise(name));
    return [
      {
        entityId: id,
        name,
        entityType: type,
        year: null,
        description: null,
        text: "",
        becauseOf: [],
        evidenceId,
        countryCode: null,
      },
    ];
  });
}

/** Both Qloo descriptions, whole (capped), for the checks that must see everything. */
function fullText(props: Rec): string {
  const parts = [props.description, props.short_description].filter(
    (v): v is string => typeof v === "string",
  );
  return [...new Set(parts)].join(" ").slice(0, 4000);
}

/** The value most items share (ties: the first seen), ignoring blanks. */
function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [v, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = v;
  return best;
}

const DISH_FILLER = new Set([
  "and",
  "with",
  "the",
  "food",
  "fare",
  "cuisine",
  "dish",
  "dishes",
  "style",
]);

/** Two dish names are the same dish when most of their words are shared (Jaccard ≥ 0.6). */
export function similarNames(a: string, b: string): boolean {
  // A light stem, so "Amritsari" and "Amritsar" count as the same word; generic words don't count
  // ("Diner Food" = "Diner Fare" = "Diner"), and British = English ("British Pub Food").
  const stem = (w: string) => {
    const s = w.length > 5 ? w.replace(/(?:i|s)$/, "") : w;
    return s === "british" ? "english" : s;
  };
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !DISH_FILLER.has(w))
        .map(stem),
    );
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  // Or one name is the other plus a single word ("Diner" / "American Diner Food").
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (shared === small.size && large.size <= small.size + 1) return true;
  return shared / (wa.size + wb.size - shared) >= 0.6;
}

const obj = (v: unknown): Rec | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : undefined;
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter((x): x is Rec => !!obj(x)) : []);
const order = (domain: string) => {
  const i = SIGNAL_ORDER.indexOf(domain);
  return i === -1 ? SIGNAL_ORDER.length : i;
};

export const join = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type { Era };
