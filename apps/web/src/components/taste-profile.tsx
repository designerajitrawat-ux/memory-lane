"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Clapperboard,
  Heart,
  MapPin,
  Music,
  ShieldCheck,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type {
  EvidenceView,
  ResolveProblem,
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

const DOMAINS: { key: TasteDomain; title: string; icon: LucideIcon; empty: string }[] = [
  {
    key: "music",
    title: "Music",
    icon: Music,
    empty: "No music yet. A singer they love, added as a favourite, opens this up.",
  },
  {
    key: "film_tv",
    title: "Films and TV",
    icon: Clapperboard,
    empty: "Qloo had no films or TV from their years for these favourites.",
  },
  { key: "food", title: "Food", icon: UtensilsCrossed, empty: "No dishes yet." },
  { key: "places", title: "Places", icon: MapPin, empty: "No places yet." },
];

// Long labels wrap instead of overflowing small phones or large text (WCAG 1.4.10).
const actionButton = "h-auto min-h-12 w-full whitespace-normal px-6 py-3 text-base sm:w-auto";

const STOPPED =
  "The build stopped before it finished, so nothing new was saved. You can try again.";
const BUSY =
  "Memory Lane is already researching this profile, maybe in another tab. Please wait a minute and try again.";

type Problem = { kind: ResolveProblem | "stopped"; message: string };

/** Screen 5 (docs/06): the Life Taste Profile, built by the agent with Qloo, evidence on every item. */
export function TasteProfileView() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<TasteProfile | null | undefined>(undefined);
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
    api.getTasteProfile(id).then((r) => {
      if (!active) return;
      if (r.ok) setProfile(r.data.tasteProfile);
      else setLoadError({ kind: r.kind, message: r.message });
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
      run.problem = { kind: "stopped", message: result.kind === "limit" ? BUSY : result.message };
    } else if (!run.built && !run.problem) {
      run.problem = { kind: "stopped", message: STOPPED };
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

  const progress = (
    <>
      {(running || log.length > 0) && <AgentLog lines={log} />}
      {problem && <ProblemBanner ref={problemRef} message={problem.message} />}
    </>
  );

  if (!profile) {
    return (
      <div className="space-y-8">
        <section aria-labelledby="build-heading" className="space-y-4">
          <h2 id="build-heading" className="text-xl font-bold">
            Build it from the confirmed favourites
          </h2>
          <p className="text-base text-muted-foreground">
            Memory Lane asks Qloo what people with the same favourites also enjoyed: music, films
            and TV, food and places. It keeps what fits the years they were young, leaves out
            anything on the avoid-list, and shows Qloo&apos;s evidence for every item. Nothing is
            made up.
          </p>
          <Button className={actionButton} disabled={running} focusableWhenDisabled onClick={build}>
            {running ? "Building…" : "Build the profile"}
          </Button>
          {progress}
        </section>
        <BackLink id={id} />
      </div>
    );
  }

  const favourites = profile.items.filter((i) => i.source === "favourite").length;
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h2
          ref={readyRef}
          tabIndex={-1}
          className="font-heading text-2xl leading-snug outline-none"
        >
          {profile.items.length} things to share, from {favourites}{" "}
          {favourites === 1 ? "favourite" : "favourites"}
        </h2>
        <p className="text-base text-muted-foreground">
          Films and TV from {profile.era.from}–{profile.era.to}, the years they were young and busy.
          Every item has Qloo&apos;s evidence behind it.
          {profile.partial && " Some parts couldn't be researched this time; see the notes below."}
        </p>
        <nav aria-label="Sections" className="flex flex-wrap gap-2 pt-2">
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
              </span>
            </a>
          ))}
        </nav>
      </div>

      {DOMAINS.map(({ key, title, icon: Icon, empty }) => {
        const items = profile.items.filter((i) => i.domain === key);
        return (
          <section key={key} aria-labelledby={`domain-${key}`} className="space-y-3">
            <h2
              id={`domain-${key}`}
              className="flex scroll-mt-6 items-center gap-2 text-xl font-bold"
            >
              <Icon aria-hidden="true" className="size-6 text-primary" />
              {title}
            </h2>
            {items.length === 0 ? (
              <p className="text-base text-muted-foreground">{empty}</p>
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
          <h2 id="notes-heading" className="text-xl font-bold">
            What Memory Lane did
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
          After confirming more favourites, build again. Version {profile.version} stays until the
          new one is ready.
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
  // A favourite's badge already says why it is here; Qloo's one line says more than repeating it.
  const line = item.source === "favourite" ? (item.description ?? item.caption) : item.caption;
  return (
    <li className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-xl leading-snug">{item.name}</p>
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
        {item.source === "favourite" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1 text-base">
            <Heart aria-hidden="true" className="size-4 text-primary" />
            Their favourite
          </span>
        )}
      </div>
      <p className="flex-1 text-base">{line}</p>
      <EvidenceDrawer item={item} />
    </li>
  );
}

const TOOL_LABELS: Record<string, string> = {
  qloo_describe: "Looked up in Qloo and confirmed by you",
  qloo_find_tags: "Matched to Qloo's tags",
  qloo_recommend: "Recommended by Qloo from the favourites",
  qloo_rank: "Ranked by Qloo against the favourites",
};

/** The evidence drawer (docs/06): the Qloo call behind an item, as recorded. */
function EvidenceDrawer({ item }: { item: TasteItem }) {
  const [records, setRecords] = useState<(EvidenceView | null)[] | null>(null);
  const chip =
    item.source === "favourite"
      ? "Qloo · confirmed"
      : item.entityType?.startsWith("urn:tag:")
        ? "Qloo · food tag"
        : "Qloo · recommended";

  function load(open: boolean) {
    if (!open || records) return;
    Promise.all(item.evidenceIds.map((e) => api.getEvidence(e))).then((rs) =>
      setRecords(rs.map((r) => (r.ok ? r.data : null))),
    );
  }

  return (
    <Dialog onOpenChange={load}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="-ml-3 h-auto min-h-12 gap-2 self-start px-3 text-base font-bold text-evidence"
          />
        }
      >
        <ShieldCheck aria-hidden="true" className="size-5" />
        {chip}
        <span className="sr-only">: show the evidence for {item.name}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{item.caption}</DialogDescription>
        </DialogHeader>
        {item.description && (
          <p className="text-base">
            <span className="font-bold">Qloo says: </span>
            {item.description}
          </p>
        )}
        <div className="space-y-3">
          <h3 className="text-base font-bold">The Qloo record behind it</h3>
          {records === null ? (
            <p role="status" className="text-base text-muted-foreground">
              Loading the record…
            </p>
          ) : (
            records.map((r, i) =>
              r ? (
                <dl
                  key={r.id}
                  className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border bg-card p-3 text-base"
                >
                  <dt className="text-muted-foreground">What</dt>
                  <dd>{TOOL_LABELS[r.tool] ?? r.tool}</dd>
                  <dt className="text-muted-foreground">Asked</dt>
                  <dd>{describeArgs(r)}</dd>
                  <dt className="text-muted-foreground">Answer</dt>
                  <dd>
                    {r.status === "ok" ? "OK" : r.status}, {r.resultCount}{" "}
                    {r.resultCount === 1 ? "result" : "results"}
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
              ) : (
                <p key={i} className="text-base text-muted-foreground">
                  This record couldn&apos;t be loaded just now.
                </p>
              ),
            )
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
  if (n) parts.push(`based on ${n} confirmed ${n === 1 ? "favourite" : "favourites"}`);
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
