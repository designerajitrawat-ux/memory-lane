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
  /** Demo personas: Qloo answers are cached without expiry. Server-side only. */
  persistent?: boolean;
}

const PER_DOMAIN = 6;
/** Dishes Qloo finds for where they grew up, on top of the favourites: food is the lightest domain. */
const MAX_FOUND_DISHES = 3;
const TOOLS = ["qloo_recommend", "qloo_find_tags"] as const;
const FAVOURITE_CAPTION = "Added as a favourite; Qloo confirmed the match.";
// Qloo's food tag kinds, most dish-like first: a popular dish ("Buckeye") beats a restaurant's menu
// specialty ("The Ohio Burger"), which beats a cuisine label.
const FOOD_TAGS = ["popular_food_item", "specialty_dish", "cuisine"];

const SEED_DOMAIN: Record<string, TasteDomain | undefined> = {
  music: "music",
  film: "film_tv",
  tv: "film_tv",
  food: "food",
  place: "places",
};
// Signals in order of how well they carry taste (Phase 0: artist signals are the strongest).
const SIGNAL_ORDER = ["music", "film", "tv", "place"];

// As they read mid-sentence ("across music, films and TV, food and places").
const DOMAIN_NAMES: Record<TasteDomain, string> = {
  music: "music",
  film_tv: "films and TV",
  food: "food",
  places: "places",
};

export const PLACEMENT_ORDER: Record<EraPlacement, number> = { fits: 0, unknown: 1, later: 2 };

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
// Venues that are mostly new or passing, even when the name sounds like a landmark (live check,
// near a UK town: a farm shop, an air show, a modern entertainment venue, a guided bus tour).
const NOT_A_LASTING_PLACE =
  /\b(modern|farm shops?|garden cent(?:re|er)s?|air shows?|festivals?|guided tours?|bus tours?)\b/i;
// Lasting places whose description doesn't name a kind of building: a statue, or a venue Qloo
// describes by the decade it belongs to ("steeped in 1960s memorabilia").
const LASTING_PLACE = /\b(statues?|sculptures?|memorabilia|19[0-8]0s)\b/i;
// A reminiscence session is gentle, whatever the avoid-list says: Qloo suggestions about atrocities or
// suicide are left out (live check: a Holocaust drama came back for a 1946 US persona)…
export const HEAVY =
  /\b(massacres?|genocides?|holocaust|auschwitz|concentration camps?|death camps?|war crimes?|atrocit(?:y|ies)|suicides?|rapes?|abuse|abusive|torture)\b/i;
// …and so are sites of grief (read from the opening words: a cathedral "set amid quiet cemetery
// grounds" is still a cathedral)…
const HEAVY_PLACE =
  /\b(war memorials?|memorials? to the victims|cemeter(?:y|ies)|graveyards?|prisons?|slave(?:ry| trade))\b/i;
// …and films and TV set around illness or fear: hospital dramas came back for a UK persona (live
// check), and horror is never a gentle choice.
export const HEAVY_SCREEN =
  /\b(medical (?:drama|procedural)|hospital drama|horror|slasher|serial killers?|psychiatric)\b/i;
// Qloo's food tags include restaurant styles, not dishes (live check: bar food, pub food, market bars,
// roadside dhabas).
const NOT_A_DISH =
  /\b(bars?|pubs?|gastropubs?|street food|snack bars?|cafeterias?|canteens?|caf[eé]s?|diners?|restaurants?|bistros?|eater(?:y|ies)|delis?|groceries|grocery|kitchens?|markets?|dhabas?|buffets?|takeaways?|takeout|fast food|food trucks?|modern|fusion|brunch)\b|\bstyle$/i;

type Rec = Record<string, unknown>;

/** One thing Qloo returned, with the favourites Qloo says led to it. */
export interface Found {
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
  /** Places: the town from Qloo's geocode. */
  city?: string | null;
  /** The favourites sent in the call that found it, for captions when Qloo names none. */
  sent?: string[];
}

type FailCause = "device" | "profile" | "daily" | "outage" | "rejected";

export type Outcome =
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
 * fixed and visible, and each domain is asked with the favourites that carry its taste: singers from
 * the singers they love (Phase 0: artist → artist is the most era-faithful), films and TV from their
 * films and shows (kept to their era by `release_year` in code), places in and around where they grew
 * up from their tastes and from a place they love, dishes from Qloo's food tags for the town and its
 * region. Code then validates every item (evidence, avoid-list, wording) before anything is saved or
 * shown, and the steps are kept as the build's own log.
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

  // Every step is shown live and kept with the profile ("How Memory Lane built this").
  const steps: string[] = [];
  const step = (message: string) => {
    steps.push(message);
    emit({ type: "step", message });
  };

  const era = eraFor(ctx.birthYear);
  const isAvoided = avoidMatcher(ctx.avoid);
  // A favourite that is also on the avoid-list never steers the research (rule 9; review W3b).
  const entitySeeds = ctx.seeds
    .filter((s) => s.entityType?.startsWith("urn:entity:"))
    .filter((s) => !isAvoided(s.name, s.description))
    .sort((a, b) => order(a.domain) - order(b.domain));
  const trustedIds = new Set(entitySeeds.map((s) => s.entityId.toLowerCase()));
  const ofDomain = (...domains: string[]) =>
    domains.flatMap((d) => entitySeeds.filter((s) => s.domain === d));
  const allSignals = entitySeeds.slice(0, 5);
  // Each domain from its own favourites (live check: a UK soap plus a UK singer bring British TV,
  // where every favourite together brought American dramas); everything when a domain has none.
  const own = (seeds: ConfirmedSeed[], extra?: ConfirmedSeed) =>
    seeds.length === 0
      ? allSignals
      : extra && seeds.length < 4 && !seeds.includes(extra)
        ? [...seeds, extra]
        : seeds;
  const singers = ofDomain("music");
  const plan = {
    artist: own(singers.slice(0, 3)),
    movie: own(ofDomain("film", "tv").slice(0, 3), singers[0]),
    tv: own(ofDomain("tv", "film").slice(0, 3), singers[0]),
    // Places from what they love (live check: a Liverpool band's fans found its famous venues)…
    placeByTaste: ofDomain("music", "film", "tv").slice(0, 4),
    // …and from a place they love (people who visit it also visit…).
    placeByFavourite: ofDomain("place").slice(0, 3),
  };
  const hasSignals = entitySeeds.length > 0;
  const youth = ctx.regions[0] ?? null;
  const youthParts = (youth ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const youthLabel = youthParts[0] ?? null;
  // The state or country around the town ("Ohio", "Punjab"): its dishes when the town has few.
  const regionLabel = youthParts[1] && youthParts[1] !== youthLabel ? youthParts[1] : null;
  const names = (seeds: readonly ConfirmedSeed[]) => seeds.map((s) => s.name);

  step(
    `Starting from ${count(ctx.seeds.length, "confirmed favourite")}. Films and TV will be kept to ${era.from}–${era.to}, the years they were young and busy.`,
  );

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
      persistent: deps.persistent ?? false,
    });
  };
  const recommend = (target: string, seeds: readonly ConfirmedSeed[], extra: Rec = {}) =>
    seeds.length
      ? call("qloo_recommend", {
          target_type: target,
          signals: seeds.map((s) => s.entityId),
          limit: 20,
          explain: true,
          ...extra,
        })
      : Promise.resolve(null);

  const placeSeeds = youth ? [...plan.placeByTaste, ...plan.placeByFavourite] : [];
  if (hasSignals) {
    step(`Asking Qloo for singers enjoyed by people who love ${join(names(plan.artist))}…`);
    step(
      `Asking Qloo for films and TV enjoyed by people who love ${join(names(unique([...plan.tv, ...plan.movie])))}…`,
    );
  }
  if (youthLabel && placeSeeds.length) {
    step(
      `Asking Qloo for places in and around ${youthLabel} that people who love ${join(names(unique(placeSeeds)).slice(0, 3))} enjoy…`,
    );
  }
  if (youthLabel) {
    step(
      `Looking up Qloo's food tags for ${youthLabel}${regionLabel ? ` and ${regionLabel}` : ""}…`,
    );
  }

  const [artists, movies, shows, placesByTaste, placesByFavourite, townDishes, regionDishes] =
    await Promise.all([
      recommend("artist", plan.artist),
      recommend("movie", plan.movie),
      recommend("tv_show", plan.tv),
      youth
        ? recommend("place", plan.placeByTaste, { filter_location: youth })
        : Promise.resolve(null),
      youth
        ? recommend("place", plan.placeByFavourite, { filter_location: youth })
        : Promise.resolve(null),
      youthLabel
        ? call("qloo_find_tags", { query: `${youthLabel} food`, limit: 12 })
        : Promise.resolve(null),
      regionLabel
        ? call("qloo_find_tags", { query: `${regionLabel} food`, limit: 12 })
        : Promise.resolve(null),
    ]);
  if (isAborted()) return null;

  const outcomes = {
    artists: read(artists, readRecommend),
    movies: read(movies, readRecommend),
    shows: read(shows, readRecommend),
    placesByTaste: read(placesByTaste, readRecommend),
    placesByFavourite: read(placesByFavourite, readRecommend),
    townDishes: read(townDishes, readTags),
    regionDishes: read(regionDishes, readTags),
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

  // What Qloo returned, with the favourites sent for it (captions fall back to them).
  const via = (o: Outcome, seeds: readonly ConfirmedSeed[], city: string | null = null) =>
    found(o).map((f) => ({ ...f, sent: names(seeds).slice(0, 2), city: f.city ?? city }));
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

  // Music: favourites, then Qloo's singers, those it describes as active in their era first.
  const music = favourites("music");
  const artistAll = via(outcomes.artists, plan.artist);
  const artistFound = artistAll.filter(keep).filter(fresh(music));
  // Stable sort: within each group Qloo's own order (affinity) stays. Mostly-later voices only fill in
  // when fewer than two others are left.
  const placed = artistFound
    .map((f) => ({ f, place: PLACEMENT_ORDER[eraPlacement(f.description, era)] }))
    .sort((a, b) => a.place - b.place);
  const notLater = placed.filter((p) => p.place < PLACEMENT_ORDER.later);
  const pool = notLater.length >= 2 ? notLater : placed;
  const singersKept = pool.slice(0, PER_DOMAIN - music.length);
  music.push(...singersKept.map((s) => fromFound(s.f, "music")));
  if (outcomes.artists.kind === "found") {
    step(
      `Qloo suggested ${count(artistAll.length, "singer")}; kept ${singersKept.length}, the ones it describes as active in their era first.`,
    );
  }

  // Films and TV: only what was made in their era, nothing set around illness or fear, closest to the
  // reminiscence bump first.
  const filmTv = favourites("film_tv");
  const gentleScreen = (f: Found) => {
    if (!HEAVY_SCREEN.test(`${f.name} ${f.text}`)) return true;
    heavyCount.n++;
    return false;
  };
  const inYears = (o: Outcome, seeds: readonly ConfirmedSeed[]) => {
    const all = via(o, seeds);
    const fitting = all
      .filter((f) => yearFits(f.year, era))
      .filter(keep)
      .filter(gentleScreen)
      .filter(fresh(filmTv))
      .sort((a, b) => bumpDistance(a.year ?? 0, era) - bumpDistance(b.year ?? 0, era));
    return { all: all.length, fitting };
  };
  const filmPick = inYears(outcomes.movies, plan.movie);
  const tvPick = inYears(outcomes.shows, plan.tv);
  const room = PER_DOMAIN - filmTv.length;
  const films = filmPick.fitting.slice(0, Math.max(room - Math.min(2, tvPick.fitting.length), 0));
  const tv = tvPick.fitting
    .filter((f) => !films.some((m) => m.entityId === f.entityId))
    .slice(0, room - films.length);
  filmTv.push(
    ...films.map((f) => fromFound(f, "film_tv")),
    ...tv.map((f) => fromFound(f, "film_tv")),
  );
  if (outcomes.movies.kind === "found" || outcomes.shows.kind === "found") {
    const suggested = filmPick.all + tvPick.all;
    const kept = films.length + tv.length;
    step(
      `Qloo suggested ${count(suggested, "film or TV show", "films and TV shows")}; kept ${kept} from ${era.from}–${era.to}.`,
    );
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

  // Places in and around where they grew up: somewhere lasting to talk about, not a hotel, a bar or a
  // new venue; not a site of grief; and in the same country as the rest (Qloo's location filter
  // crossed a border once — live check). The avoid-list reads first, so it also names what it kept out.
  const placeItems = favourites("places");
  const placeAll = interleave(
    via(outcomes.placesByTaste, plan.placeByTaste),
    via(outcomes.placesByFavourite, plan.placeByFavourite),
  );
  const localCountry = mostCommon(placeAll.map((f) => f.countryCode));
  const placeFound = placeAll
    .filter(keep)
    .filter((f) => !NOT_A_MEMORY_PLACE.test(lead(f)) && !NOT_A_LASTING_PLACE.test(lead(f)))
    .filter((f) => MEMORY_PLACE.test(lead(f)) || LASTING_PLACE.test(lead(f)))
    .filter((f) => !HEAVY_PLACE.test(lead(f)))
    .filter((f) => !localCountry || !f.countryCode || f.countryCode === localCountry)
    .filter(fresh(placeItems));
  const placesKept = placeFound.slice(0, PER_DOMAIN - placeItems.length);
  placeItems.push(...placesKept.map((f) => fromFound(f, "places", f.city ?? youthLabel)));

  // Dishes: favourites (Qloo food tags), then named dishes from Qloo's food tags for the town, then its
  // region. Restaurant styles ("… Bar Food") and labels that only name the place or its people are
  // left out, and variants of one dish count once.
  const food = favourites("food");
  const placeWords = dishWords(youth ?? "");
  const dishAll = [
    ...byTier(via(outcomes.townDishes, [], youthLabel)),
    ...byTier(via(outcomes.regionDishes, [], regionLabel)),
  ];
  let dishesKept = 0;
  for (const f of dishAll.filter(keep).filter(fresh(food))) {
    if (dishesKept >= MAX_FOUND_DISHES) break;
    if (NOT_A_DISH.test(f.name) || onlyPlaceWords(f.name, placeWords)) continue;
    // "Amritsar Kulcha" after "Amritsari Naan": the same dish.
    if (food.some((i) => similarNames(i.name, f.name))) continue;
    food.push(fromFound(f, "food", f.city ?? youthLabel));
    dishesKept++;
  }
  if (dishAll.length > 0 && dishesKept === 0) {
    notes.push(
      `Qloo's food tags for ${youthLabel ?? "where they grew up"} were restaurant styles rather than dishes, so only the favourite dishes are used.`,
    );
  }
  if (youthLabel && (placeAll.length > 0 || dishAll.length > 0)) {
    step(
      `Qloo suggested ${count(placeAll.length, "place")} near ${youthLabel}; kept ${placesKept.length} lasting ones (hotels, bars and newer venues were left out), and ${count(dishesKept, "dish", "dishes")} from its food tags.`,
    );
  }

  for (const [label, o] of [
    ["Music", outcomes.artists],
    ["Films", outcomes.movies],
    ["TV", outcomes.shows],
    ["Places", outcomes.placesByTaste],
    ["Places", outcomes.placesByFavourite],
    ["Dishes", outcomes.townDishes],
    ["Dishes", outcomes.regionDishes],
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
  step(`Checked every item against Qloo's records and the things to avoid: ${kept.length} kept.`);
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
  const domains = [...new Set(kept.map((i) => i.domain))].map((d) => DOMAIN_NAMES[d]);
  const ready = `Life Taste Profile ready: ${count(kept.length, "item")} across ${join(domains)}.`;
  const profile = await deps.store.save(input.profileId, {
    era: { from: era.from, to: era.to },
    partial,
    items: kept,
    notes: [...new Set(notes)],
    steps: [...steps, ready],
  });
  emit({ type: "done", message: ready, data: profile });
  return profile;

  function fromFound(f: Found, domain: TasteDomain, where: string | null = null): TasteItem {
    const because = f.becauseOf.length ? f.becauseOf : (f.sent ?? []);
    const caption =
      domain === "food"
        ? `Found in Qloo's food tags for ${where ?? "where they grew up"}.`
        : because.length
          ? `People who enjoy ${join(because)} often also enjoy ${f.name}${domain === "places" && where ? `, in ${where}` : ""}.`
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
      becauseOf: because,
      evidenceIds: [f.evidenceId],
      ...(domain === "places" && where ? { locality: where } : {}),
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
export function read(
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

export const found = (o: Outcome) => (o.kind === "found" ? o.found : []);

/** recommend results: entity, year, description, and the favourites Qloo says contributed most. */
export function readRecommend(envelope: Rec, evidenceId: string): Found[] {
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
        city: str(obj(props.geocode)?.city) ?? null,
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
    if (!id || !name || !FOOD_TAGS.includes(category) || seen.has(normalise(name))) return [];
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

/** Items from two lists in turn (a1, b1, a2, b2…), each entity once. */
function interleave(a: readonly Found[], b: readonly Found[]): Found[] {
  const out: Found[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const f of [a[i], b[i]]) {
      if (f && !seen.has(f.entityId)) {
        seen.add(f.entityId);
        out.push(f);
      }
    }
  }
  return out;
}

/** Food tags with named dishes first (specialty dish, popular item), then cuisines; stable. */
function byTier(found: Found[]): Found[] {
  const tier = (f: Found) => {
    const i = FOOD_TAGS.indexOf(f.entityType?.split(":")[2] ?? "");
    return i === -1 ? FOOD_TAGS.length : i;
  };
  return [...found].sort((a, b) => tier(a) - tier(b));
}

const unique = <T>(xs: readonly T[]) => [...new Set(xs)];

// Words that say nothing about which dish it is.
const DISH_FILLER = new Set([
  "and",
  "with",
  "the",
  "food",
  "foods",
  "fare",
  "cuisine",
  "cooking",
  "dish",
  "dishes",
  "style",
  "traditional",
  "authentic",
  "local",
  "classic",
  "home",
  "homestyle",
  "comfort",
  "regional",
  "vegetarian",
  "vegan",
  "american",
  "european",
  "asian",
  "continental",
  "southern",
  "northern",
  "western",
  "eastern",
  "midwestern",
]);
// One dish under several names (Qloo's Amritsar tags: kulcha, naan; chole, cholle, chaane).
const DISH_SYNONYMS: Record<string, string> = {
  nan: "naan",
  kulcha: "naan",
  kulche: "naan",
  cholle: "chole",
  chhole: "chole",
  cholley: "chole",
  chaane: "chole",
  chana: "chole",
  channa: "chole",
  british: "english",
};

/** The words that tell dishes apart, lightly stemmed ("Amritsari" = "Amritsar"). */
function dishWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !DISH_FILLER.has(w))
    .map((w) => {
      const stem = w.length > 5 ? w.replace(/(?:i|s)$/, "") : w;
      return DISH_SYNONYMS[stem] ?? stem;
    });
}

/** Two dish names are the same dish when most of their words are shared (Jaccard ≥ 0.6). */
export function similarNames(a: string, b: string): boolean {
  const wa = new Set(dishWords(a));
  const wb = new Set(dishWords(b));
  if (wa.size === 0 || wb.size === 0) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  // One name is the other plus a word ("Diner" / "American Diner Food"), or the other with more on
  // the side ("Amritsari Naan" / "Amritsari Kulcha Naan With Chole And Raita").
  if (shared === small.size && (large.size <= small.size + 1 || small.size >= 2)) return true;
  return shared / (wa.size + wb.size - shared) >= 0.6;
}

// "British", "Scottish", "Lancashire", "Chinese": the people or county a cuisine is named after.
const PLACE_ADJECTIVE = /(?:ish|ese|shire)$/;

/**
 * A food tag that only names the place or its people ("Punjabi", "Ohio Comfort Food", "British
 * Food"): a cuisine label, not a dish anyone can picture. `placeWords` are the town and region words.
 */
export function onlyPlaceWords(name: string, placeWords: readonly string[]): boolean {
  const words = dishWords(name);
  return (
    words.length > 0 &&
    words.every((w) => PLACE_ADJECTIVE.test(w) || placeWords.some((p) => nearWord(w, p)))
  );
}

/** Same word, or one letter apart for longer words ("panjab" / "punjab", "indian" / "india"). */
function nearWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return (prev[b.length] ?? 0) <= 1;
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
