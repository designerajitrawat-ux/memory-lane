"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Clapperboard,
  Heart,
  ListChecks,
  MapPin,
  Music,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type {
  ResolveProblem,
  SessionSummary,
  TasteDomain,
  TasteItem,
  TasteProfile,
} from "@memory-lane/shared";
import { AgentLog, ProblemBanner } from "@/components/agent-run";
import { DemoBanner } from "@/components/demo-banner";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { Loading, useAfter } from "@/components/loading";
import { ItemThumb } from "@/components/qloo-image";
import { TryDemo } from "@/components/try-demo";
import { Button } from "@/components/ui/button";
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
  // A public demo persona (not this device's profile): look, don't change. Read-only until the
  // agent confirms this device owns it, so a demo never flashes owner buttons (ux review S17).
  const [readOnly, setReadOnly] = useState(true);
  const [nickname, setNickname] = useState<string | null>(null);
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
      // Whose profile it is decides what can be done here: without that answer, show a retry rather
      // than guess (an owner must never see their own profile as a demo; ux review W4).
      if (!t.ok || !p.ok) {
        const failed = !t.ok ? t : p;
        if (!failed.ok) setLoadError({ kind: failed.kind, message: failed.message });
        return;
      }
      setProfile(t.data.tasteProfile);
      setReadOnly(!p.data.isOwner);
      const { nickname: name, seeds: s } = p.data.profile;
      setNickname(name);
      document.title = `${name ? `${name}’s ` : ""}Life Taste Profile · Memory Lane`;
      setSeeds({
        confirmed: s.filter((x) => x.status === "confirmed").length,
        toChoose: s.filter((x) => x.status === "needs_input").length,
        toCheck: s.filter((x) => x.status === "pending").length,
      });
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

  const title = (
    <h1 className="font-heading text-4xl leading-tight break-words">
      {nickname ? `${nickname}’s Life Taste Profile` : "Life Taste Profile"}
    </h1>
  );

  if (loadError) {
    return (
      <div className="max-w-2xl space-y-6">
        {title}
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <p role="alert" className="text-lg">
            {loadError.message}
          </p>
          {loadError.kind === "not_found" && (
            <p className="text-base text-muted-foreground">
              Profiles are remembered on the device that created them. If you made it on another
              phone or browser, open it there.
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
      </div>
    );
  }
  if (profile === undefined) return <Loading>Loading the profile…</Loading>;

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
      {problem && (
        <ProblemBanner
          ref={problemRef}
          message={problem.message}
          offerDemo={problem.kind === "quota" || problem.kind === "qloo_not_connected"}
        />
      )}
    </>
  );

  if (!profile && readOnly) {
    return (
      <div className="max-w-2xl space-y-4">
        {title}
        <p className="rounded-2xl border bg-card p-5 text-lg">
          This demo profile is still being prepared with Qloo. Please come back in a few minutes.
        </p>
        <BackLink id={id} />
      </div>
    );
  }

  if (!profile) {
    const nothingConfirmed = seeds !== null && seeds.confirmed === 0;
    return (
      <div className="max-w-2xl space-y-8">
        {title}
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
  const learned = profile.items.filter((i) => i.source === "learned").length;
  const found = profile.items.length - favourites - learned;
  const built = new Date(profile.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" });
  // Phones: one column. Wide screens: the profile on the left, the sessions in a side panel that
  // stays in view. The DOM order stays the phone order (demo: sessions first, ux W13; a caregiver's own:
  // after the summary).
  const aside =
    "space-y-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-start";
  return (
    <div className="space-y-10 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-10 lg:gap-y-10 lg:space-y-0">
      <div className="space-y-4 lg:col-span-2">
        {title}
        {readOnly && <DemoBanner />}
      </div>
      {readOnly && (
        <aside aria-label="Sessions" className={aside}>
          <SessionsPanel profileId={id} readOnly />
          <TryDemo profileId={id} name={nickname} />
          {/* On a caregiver's own profile it sits with the sessions, once one exists (ux W9). */}
          <CompareLink profileId={id} />
        </aside>
      )}
      <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-2">
        <h2
          ref={readyRef}
          tabIndex={-1}
          className="font-heading text-2xl leading-snug outline-none"
        >
          {readOnly
            ? `${plural(favourites, "confirmed favourite")}, ${found} more found by Qloo`
            : `${plural(favourites, "favourite")} you confirmed, ${found} more found by Qloo`}
          {learned > 0 && `, ${learned} learned from sessions`}
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

      {!readOnly && (
        <aside aria-label="Sessions" className={aside}>
          <SessionsPanel profileId={id} readOnly={false} />
        </aside>
      )}

      <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-3">
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

        {profile.steps.length > 0 && (
          <section aria-labelledby="built-heading" className="space-y-3">
            <h2 id="built-heading" className="flex items-center gap-2 text-xl font-bold">
              <ListChecks aria-hidden="true" className="size-6 text-primary" />
              How Memory Lane built this
            </h2>
            <details className="rounded-xl border bg-card p-4">
              <summary className="flex min-h-12 cursor-pointer items-center text-base font-bold">
                The agent&apos;s {profile.steps.length} steps, as it worked
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-6 text-base">
                {profile.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <p className="mt-3 text-base text-muted-foreground">
                Each &ldquo;Qloo&rdquo; chip above opens the exact call behind that item.
              </p>
            </details>
          </section>
        )}

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

        {!readOnly && (
          <section aria-labelledby="rebuild-heading" className="space-y-3 border-t pt-6">
            <h2 id="rebuild-heading" className="text-xl font-bold">
              Build a fresh version
            </h2>
            <p className="text-base text-muted-foreground">
              Useful after a partly built version, or a few days later. Version {profile.version}{" "}
              stays unless the new one is ready.
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
        )}

        <BackLink id={id} />
      </div>
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
          {item.source === "learned"
            ? "Learned from a session"
            : item.source === "proposed"
              ? "Suggested by AI, ranked by Qloo"
              : "Found by Qloo"}
        </span>
      )}
      {/* Qloo's picture (artist, poster, place) or the kind icon for a dish: beside the name, or above
          it when the card is narrow for the text size (rem breakpoint; ux C2). */}
      <div className="flex min-w-0 flex-col gap-3 min-[22rem]:flex-row min-[22rem]:items-start">
        <ItemThumb
          image={item.image}
          icon={DOMAINS.find((d) => d.key === item.domain)?.icon ?? Music}
          className="size-20 rounded-xl"
          iconClassName="size-8"
        />
        <div className="min-w-0 flex-1">
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
      </div>
      {/* A favourite's badge says why it is here; Qloo's one line says more than repeating that. */}
      <p className="flex-1 text-base break-words">
        {favourite ? (item.description ?? item.caption) : item.caption}
      </p>
      <EvidenceDrawer
        subject={{
          name: item.name,
          caption: item.caption,
          description: item.description,
          entityId: item.entityId,
          entityType: item.entityType,
          evidenceIds: item.evidenceIds,
          source: item.source,
        }}
      />
    </li>
  );
}

/** The way to screen 9: the same AI without Qloo, next to this profile's session. */
function CompareLink({ profileId }: { profileId: string }) {
  return (
    <Link
      href={`/profiles/${profileId}/compare`}
      className="group flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 border-field-border bg-card px-5 py-4 text-base outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span>
        <span className="block font-bold">Generic AI vs Memory Lane</span>
        <span className="text-muted-foreground">
          The same AI asked without Qloo: what it suggests, and what code counts in each plan.
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-6 shrink-0 text-primary transition-transform group-hover:translate-x-1"
      />
    </Link>
  );
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

const primaryLink =
  "group inline-flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-primary px-5 py-3 text-left text-lg font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The way on from the profile: plan a session (the screen's one primary action), see past ones. On a
 * demo: the session Stage 4 learned is the thing to open.
 */
function SessionsPanel({ profileId, readOnly }: { profileId: string; readOnly: boolean }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listSessions(profileId).then((r) => {
      if (!active) return;
      if (r.ok) setSessions(r.data.sessions);
      else setListError(r.message);
    });
    return () => {
      active = false;
    };
  }, [profileId, attempt]);

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

  const slowPlan = useAfter(planning);
  const any = (sessions?.length ?? 0) > 0;
  const newest = sessions?.[0];
  const learnedSession = readOnly && newest && newest.number > 1 ? newest : null;
  return (
    <section
      aria-labelledby="sessions-heading"
      className="space-y-4 rounded-2xl border-2 border-primary/50 bg-card p-5"
    >
      <h2 id="sessions-heading" className="text-xl font-bold">
        Sessions
      </h2>
      <p className="text-base text-muted-foreground">
        {readOnly
          ? "Session 1 has sample reactions logged. Session 2 was planned from them: it shows what Memory Lane learned."
          : "About 25 minutes together: six things from this profile, each with something to listen to or look at, and gentle things to talk about."}
      </p>
      {!readOnly && (
        <Button className={actionButton} disabled={planning} focusableWhenDisabled onClick={plan}>
          {planning ? "Planning…" : any ? "Plan the next session" : "Plan the first session"}
        </Button>
      )}
      <p role="status" className="text-base text-muted-foreground empty:hidden">
        {slowPlan ? "Asking Qloo for more like what landed, and ranking what comes next…" : ""}
      </p>
      {learnedSession && (
        <Link href={`/sessions/${learnedSession.id}`} className={primaryLink}>
          <span>
            Open session {learnedSession.number}: what it learned from session{" "}
            {learnedSession.number - 1}
          </span>
          <ArrowRight
            aria-hidden="true"
            className="size-6 shrink-0 transition-transform group-hover:translate-x-1"
          />
        </Link>
      )}
      {error && (
        <p role="alert" className="text-base font-bold text-destructive">
          {error}
        </p>
      )}
      {sessions === null && !listError && <Loading>Loading the sessions…</Loading>}
      {listError && (
        <div className="space-y-2">
          <p role="alert" className="text-base">
            The sessions couldn&apos;t be loaded: {listError}
          </p>
          <Button
            variant="outline"
            className="h-12 px-5 text-base"
            onClick={() => {
              setListError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {readOnly && sessions?.length === 0 && (
        <p className="text-base">This demo&apos;s sessions are still being prepared.</p>
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
                  {readOnly && s.status === "planned" ? "Ready to try" : SESSION_STATUS[s.status]}
                  {s.reacted > 0 && ` · ${s.reacted} of ${s.itemCount} reactions`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && any && (
        <Link
          href={`/profiles/${profileId}/compare`}
          className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
        >
          Compare session 1 with a generic AI
        </Link>
      )}
    </section>
  );
}
