"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Clapperboard,
  Heart,
  MapPin,
  Music,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type {
  EvidenceView,
  ResolveProblem,
  SessionSummary,
  TasteDomain,
  TasteItem,
  TasteProfile,
} from "@memory-lane/shared";
import { AgentLog, ProblemBanner } from "@/components/agent-run";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, type ApiFailureKind } from "@/lib/api";

const DOMAINS: { key: TasteDomain; title: string; icon: LucideIcon }[] = [
  { key: "music", title: "Music", icon: Music },
  { key: "film_tv", title: "Films and TV", icon: Clapperboard },
  { key: "food", title: "Food", icon: UtensilsCrossed },
  { key: "places", title: "Places", icon: MapPin },
];

// Long labels wrap instead of overflowing small phones or large text (WCAG 1.4.10).
const actionButton = "h-auto min-h-12 w-full whitespace-normal px-6 py-3 text-base sm:w-auto";

const STOPPED =
  "The build stopped before it finished, so it may not have been saved. We've checked what's there; you can try again.";
const BUSY =
  "Memory Lane is already researching this profile, maybe in another tab. Please wait a minute and try again.";

type Problem = { kind: ResolveProblem | "stopped"; message: string };

/** What the profile page knows about the favourites, to say why there's nothing to build yet. */
type SeedState = { confirmed: number; toChoose: number; toCheck: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Screen 5 (docs/06): the Life Taste Profile, built by the agent with Qloo, evidence on every item. */
export function TasteProfileView() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<TasteProfile | null | undefined>(undefined);
  const [seeds, setSeeds] = useState<SeedState | null>(null);
  const [loadError, setLoadError] = useState<{ kind: ApiFailureKind; message: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [finishedRuns, setFinishedRuns] = useState(0);
  const problemRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<HTMLHeadingElement>(null);
  const runRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.getTasteProfile(id), api.getProfile(id)]).then(([t, p]) => {
      if (!active) return;
      if (!t.ok) {
        setLoadError({ kind: t.kind, message: t.message });
        return;
      }
      setProfile(t.data.tasteProfile);
      if (p.ok) {
        const s = p.data.profile.seeds;
        setSeeds({
          confirmed: s.filter((x) => x.status === "confirmed").length,
          toChoose: s.filter((x) => x.status === "needs_input").length,
          toCheck: s.filter((x) => x.status === "pending").length,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setProfile(undefined);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!loadError) return;
    window.addEventListener("online", retryLoad);
    return () => window.removeEventListener("online", retryLoad);
  }, [loadError, retryLoad]);

  // Leaving the page ends a run, so the agent stops spending the shared Qloo quota.
  useEffect(() => () => runRef.current?.abort(), []);

  useEffect(() => {
    if (problem) problemRef.current?.focus();
  }, [problem]);

  useEffect(() => {
    if (finishedRuns > 0) readyRef.current?.focus();
  }, [finishedRuns]);

  async function build() {
    const controller = new AbortController();
    runRef.current = controller;
    const before = profile?.version ?? 0;
    setRunning(true);
    setProblem(null);
    setLog([]);
    const run: { built: boolean; problem: Problem | null } = { built: false, problem: null };
    const result = await api.buildTasteProfile(
      id,
      (event) => {
        if (event.type === "error") {
          run.problem = { kind: event.problem, message: event.message };
          return;
        }
        // After a stop the banner explains it; a closing line would read like success.
        if (event.type !== "done" || !run.problem) setLog((l) => [...l, event.message]);
        if (event.type === "done" && event.data) {
          run.built = true;
          setProfile(event.data);
        }
      },
      controller.signal,
    );
    if (controller.signal.aborted) return;
    runRef.current = null;
    if (!result.ok) {
      run.problem = {
        kind: "stopped",
        message:
          result.code === "nothing_confirmed"
            ? "Confirm at least one favourite with Qloo first."
            : result.code === "already_checking"
              ? BUSY
              : result.message,
      };
    } else if (!run.built && !run.problem) {
      // The stream was cut: the build may have been saved anyway, so look (ux review W7).
      const fresh = await api.getTasteProfile(id);
      if (fresh.ok && (fresh.data.tasteProfile?.version ?? 0) > before) {
        setProfile(fresh.data.tasteProfile);
        run.built = true;
      } else {
        run.problem = { kind: "stopped", message: STOPPED };
      }
    }
    setRunning(false);
    if (run.problem) setProblem(run.problem);
    else setFinishedRuns((n) => n + 1);
  }

  if (loadError) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {loadError.message}
        </p>
        {loadError.kind === "not_found" && (
          <p className="text-base text-muted-foreground">
            Profiles are remembered on the device that created them. If you made it on another phone
            or browser, open it there.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {loadError.kind !== "not_found" && (
            <Button className="h-12 px-5 text-base" onClick={retryLoad}>
              Try again
            </Button>
          )}
          <BackLink id={id} />
        </div>
      </div>
    );
  }
  if (profile === undefined) {
    return (
      <p role="status" className="text-lg text-muted-foreground">
        Loading the profile…
      </p>
    );
  }

  // Building can't help while Qloo can't answer: the button steps back (as on screen 4).
  const buildIsSecondary = problem?.kind === "qloo_not_connected" || problem?.kind === "quota";
  const progress = (
    <>
      {(running || log.length > 0) && (
        <AgentLog
          lines={log}
          label={running ? "What Memory Lane is doing" : "How this version was built"}
        />
      )}
      {problem && <ProblemBanner ref={problemRef} message={problem.message} />}
    </>
  );

  if (!profile) {
    const nothingConfirmed = seeds !== null && seeds.confirmed === 0;
    return (
      <div className="space-y-8">
        <section aria-labelledby="build-heading" className="space-y-4">
          <h2 id="build-heading" className="text-xl font-bold">
            {nothingConfirmed
              ? "First, confirm the favourites"
              : "Build it from the confirmed favourites"}
          </h2>
          {nothingConfirmed ? (
            <>
              <p className="text-base text-muted-foreground">
                {seeds.toChoose > 0
                  ? `Qloo found possible matches for ${plural(seeds.toChoose, "favourite")}. Choose the right ones, then come back here.`
                  : "Memory Lane builds the profile from favourites confirmed with Qloo. Check them first."}
              </p>
              <Link
                href={`/profiles/${id}/confirm`}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-center text-base font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
              >
                {seeds.toChoose > 0 ? "Choose matches" : "Check favourites with Qloo"}
              </Link>
            </>
          ) : (
            <>
              <p className="text-base text-muted-foreground">
                Memory Lane asks Qloo what people with the same favourites also enjoyed: music,
                films and TV, food and places. Films and TV are kept to the years they grew up in,
                anything on the avoid-list is left out, and every item shows Qloo&apos;s evidence.
                Nothing is made up.
              </p>
              <Button
                variant={buildIsSecondary ? "outline" : "default"}
                className={actionButton}
                disabled={running}
                focusableWhenDisabled
                onClick={build}
              >
                {running ? "Building…" : "Build the profile"}
              </Button>
            </>
          )}
          {progress}
        </section>
        <BackLink id={id} />
      </div>
    );
  }

  const favourites = profile.items.filter((i) => i.source === "favourite").length;
  const found = profile.items.length - favourites;
  const built = new Date(profile.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" });
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h2
          ref={readyRef}
          tabIndex={-1}
          className="font-heading text-2xl leading-snug outline-none"
        >
          {plural(favourites, "favourite")} you confirmed, {found} more found by Qloo
        </h2>
        <p className="text-base text-muted-foreground">
          Films and TV from {profile.era.from}
          <span aria-hidden="true">–</span>
          <span className="sr-only"> to </span>
          {profile.era.to}, from childhood to middle age. Every item has Qloo&apos;s evidence behind
          it. Version {profile.version}, built {built}.
        </p>
        {profile.partial && (
          <a
            href="#notes-heading"
            className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-warning px-4 text-base font-bold text-warning outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Partly built: some parts couldn&apos;t be researched this time
          </a>
        )}
        <nav aria-label="Jump to a section" className="flex flex-wrap gap-2 pt-1">
          {DOMAINS.map(({ key, title, icon: Icon }) => (
            <a
              key={key}
              href={`#domain-${key}`}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border bg-card px-4 text-base font-bold outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Icon aria-hidden="true" className="size-5 text-primary" />
              {title}
              <span className="font-normal text-muted-foreground">
                {profile.items.filter((i) => i.domain === key).length}
                <span className="sr-only"> items</span>
              </span>
            </a>
          ))}
        </nav>
      </div>

      <SessionsPanel profileId={id} />

      {DOMAINS.map(({ key, title, icon: Icon }) => {
        const items = profile.items.filter((i) => i.domain === key);
        return (
          <section key={key} aria-labelledby={`domain-${key}`} className="space-y-3">
            <h2
              id={`domain-${key}`}
              tabIndex={-1}
              className="flex scroll-mt-6 items-center gap-2 text-xl font-bold outline-none"
            >
              <Icon aria-hidden="true" className="size-6 text-primary" />
              {title}
            </h2>
            {items.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Nothing here this time. The notes below say what Qloo returned and what was left
                out.
              </p>
            ) : (
              <ul role="list" className="grid gap-3 sm:grid-cols-2">
                {items.map((item) => (
                  <ItemCard key={`${key}-${item.entityId}`} item={item} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {profile.notes.length > 0 && (
        <section aria-labelledby="notes-heading" className="space-y-3">
          <h2
            id="notes-heading"
            tabIndex={-1}
            className="scroll-mt-6 text-xl font-bold outline-none"
          >
            Notes on this version
          </h2>
          <ul role="list" className="space-y-2 rounded-xl border bg-card p-4 text-base">
            {profile.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="rebuild-heading" className="space-y-3 border-t pt-6">
        <h2 id="rebuild-heading" className="text-xl font-bold">
          Build a fresh version
        </h2>
        <p className="text-base text-muted-foreground">
          Useful after a partly built version, or a few days later. Version {profile.version} stays
          unless the new one is ready.
        </p>
        <Button
          variant="outline"
          className={actionButton}
          disabled={running}
          focusableWhenDisabled
          onClick={build}
        >
          {running ? "Building…" : "Build again"}
        </Button>
        {progress}
      </section>

      <BackLink id={id} />
    </div>
  );
}

function ItemCard({ item }: { item: TasteItem }) {
  const meta = [item.typeLabel, item.year === null ? null : String(item.year)].filter(Boolean);
  const favourite = item.source === "favourite";
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4">
      {favourite ? (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-secondary px-3 py-1 text-base">
          <Heart aria-hidden="true" className="size-4 text-primary" />
          Added as a favourite
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-accent px-3 py-1 text-base text-accent-foreground">
          <Sparkles aria-hidden="true" className="size-4" />
          Found by Qloo
        </span>
      )}
      <div className="min-w-0">
        <h3 className="font-heading text-xl leading-snug break-words">{item.name}</h3>
        {meta.length > 0 && (
          <p className="text-base text-muted-foreground">
            {meta.map((m, i) => (
              <span key={i}>
                {i > 0 && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">, </span>
                  </>
                )}
                {m}
              </span>
            ))}
          </p>
        )}
      </div>
      {/* A favourite's badge says why it is here; Qloo's one line says more than repeating that. */}
      <p className="flex-1 text-base break-words">
        {favourite ? (item.description ?? item.caption) : item.caption}
      </p>
      <EvidenceDrawer item={item} />
    </li>
  );
}

const TOOL_LABELS: Record<string, string> = {
  qloo_describe: "Looked up in Qloo, then chosen as a favourite",
  qloo_find_tags: "Matched to Qloo's tags",
  qloo_recommend: "Recommended by Qloo from the favourites",
  qloo_rank: "Ranked by Qloo against the favourites",
};

const STATUS_WORDS: Record<string, string> = {
  ok: "Answered",
  needs_input: "Several matches; one was chosen",
  partial: "Partly answered",
  degraded: "Partly answered",
  empty: "No results",
};

/** The evidence drawer (docs/06): the Qloo call behind an item, as recorded. */
function EvidenceDrawer({ item }: { item: TasteItem }) {
  const [records, setRecords] = useState<Record<string, EvidenceView>>({});
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const chip =
    item.source === "favourite"
      ? "Qloo · confirmed"
      : item.entityType?.startsWith("urn:tag:")
        ? "Qloo · food tag"
        : "Qloo · recommended";

  // Only what loaded is kept, so reopening (or "Try again") fetches just what's missing.
  function load() {
    const missing = item.evidenceIds.filter((e) => !records[e]);
    if (missing.length === 0 || loading) return;
    setLoading(true);
    setFailed(false);
    Promise.all(missing.map((e) => api.getEvidence(e))).then((rs) => {
      const next: Record<string, EvidenceView> = {};
      for (const r of rs) if (r.ok) next[r.data.id] = r.data;
      setRecords((prev) => ({ ...prev, ...next }));
      setFailed(rs.some((r) => !r.ok));
      setLoading(false);
    });
  }

  const shown = item.evidenceIds.map((e) => records[e]).filter((r): r is EvidenceView => !!r);
  return (
    <Dialog onOpenChange={(open) => open && load()}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="-ml-3 h-auto min-h-12 gap-2 self-start px-3 text-left text-base font-bold whitespace-normal text-evidence"
          />
        }
      >
        <ShieldCheck aria-hidden="true" className="size-5 shrink-0" />
        {chip}
        <span className="sr-only">: show the evidence for {item.name}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{item.name}</DialogTitle>
          <DialogDescription>{item.caption}</DialogDescription>
        </DialogHeader>
        {item.description && (
          <p className="text-base break-words">
            <span className="font-bold">Qloo says: </span>
            {item.description}
          </p>
        )}
        <div className="space-y-3">
          <h3 className="text-base font-bold">The Qloo record behind it</h3>
          <p role="status" className="text-base text-muted-foreground empty:hidden">
            {loading ? "Loading the record…" : ""}
          </p>
          {shown.map((r) => (
            <dl
              key={r.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-xl border bg-card p-3 text-base"
            >
              <dt className="text-muted-foreground">What</dt>
              <dd>{TOOL_LABELS[r.tool] ?? r.tool}</dd>
              <dt className="text-muted-foreground">Asked</dt>
              <dd className="break-words">{describeArgs(r)}</dd>
              <dt className="text-muted-foreground">Answer</dt>
              <dd>
                {STATUS_WORDS[r.status] ?? r.status}, {plural(r.resultCount, "result")}
                {r.cached && " (saved answer)"}
              </dd>
              <dt className="text-muted-foreground">When</dt>
              <dd>
                {new Date(r.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </dl>
          ))}
          {failed && !loading && (
            <div className="space-y-2">
              <p className="text-base text-muted-foreground">
                {typeof navigator !== "undefined" && navigator.onLine === false
                  ? "You seem to be offline, so the record couldn't be loaded."
                  : "The record couldn't be loaded just now."}
              </p>
              <Button variant="outline" className="h-12 px-5 text-base" onClick={load}>
                Try again
              </Button>
            </div>
          )}
          <p className="text-base text-muted-foreground">
            Qloo describes what groups of people tend to enjoy, not what one person will like.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What was sent, in plain words (the args already passed the personal-data guard). */
function describeArgs(r: EvidenceView): string {
  const a = (r.args && typeof r.args === "object" ? r.args : {}) as Record<string, unknown>;
  const n = Array.isArray(a.signals) ? a.signals.length : 0;
  const parts: string[] = [];
  if (typeof a.entity === "string") parts.push(`“${a.entity}”`);
  if (typeof a.query === "string") parts.push(`“${a.query}”`);
  if (typeof a.target_type === "string") parts.push(`${a.target_type.replace(/_/g, " ")}s`);
  if (n) parts.push(`based on ${plural(n, "confirmed favourite")}`);
  if (typeof a.filter_location === "string") parts.push(`near ${a.filter_location}`);
  return parts.join(", ") || "—";
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/profiles/${id}`}
      className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
    >
      Back to the profile
    </Link>
  );
}

const SESSION_STATUS: Record<SessionSummary["status"], string> = {
  planned: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/** The way on from the profile: plan a session (the screen's one primary action), see past ones. */
function SessionsPanel({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listSessions(profileId).then((r) => {
      if (active) setSessions(r.ok ? r.data.sessions : []);
    });
    return () => {
      active = false;
    };
  }, [profileId]);

  async function plan() {
    setPlanning(true);
    setError(null);
    const r = await api.planSession(profileId);
    if (r.ok) {
      router.push(`/sessions/${r.data.session.id}`);
      return;
    }
    setPlanning(false);
    setError(r.message);
  }

  const any = (sessions?.length ?? 0) > 0;
  return (
    <section
      aria-labelledby="sessions-heading"
      className="space-y-4 rounded-2xl border-2 border-primary/50 bg-card p-5"
    >
      <h2 id="sessions-heading" className="text-xl font-bold">
        Sessions
      </h2>
      <p className="text-base text-muted-foreground">
        About 25 minutes together: six things from this profile, each with something to listen to or
        look at, and gentle things to talk about.
      </p>
      <Button className={actionButton} disabled={planning} focusableWhenDisabled onClick={plan}>
        {planning ? "Planning…" : any ? "Plan the next session" : "Plan the first session"}
      </Button>
      {error && (
        <p role="alert" className="text-base font-bold text-destructive">
          {error}
        </p>
      )}
      {any && (
        <ul role="list" className="space-y-2">
          {sessions?.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${s.id}${s.status === "done" ? "/summary" : ""}`}
                className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 rounded-xl border px-4 py-2 text-base outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="font-bold">Session {s.number}</span>
                <span className="text-muted-foreground">
                  {SESSION_STATUS[s.status]}
                  {s.reacted > 0 && ` · ${s.reacted} of ${s.itemCount} reactions`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
