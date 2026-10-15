"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Candidate, ResolveProblem, SeedResolution } from "@memory-lane/shared";
import { AgentLog, ProblemBanner } from "@/components/agent-run";
import { QlooImage } from "@/components/qloo-image";
import { Button } from "@/components/ui/button";
import { api, type ApiFailureKind } from "@/lib/api";

const NONE = "none";

// Long labels wrap instead of overflowing small phones or large text (WCAG 1.4.10).
const actionButton = "h-auto min-h-12 w-full whitespace-normal px-6 py-3 text-base sm:w-auto";

const STOPPED =
  "The check stopped before it finished, so some favourites weren't looked up. You can try again.";
const BUSY =
  "These favourites are already being checked, maybe in another tab. Please wait a minute and try again.";

type Problem = { kind: ResolveProblem | "stopped"; message: string };

/**
 * name · type · year (read as "name, type, year"), then Qloo's one-line description, which is what
 * tells same-name matches apart (two films called the same, a temple in another city).
 */
function CandidateLabel({ c }: { c: Candidate }) {
  const parts = [c.name, c.type, c.year === null ? null : String(c.year)].filter(
    (x): x is string => !!x,
  );
  return (
    <span className="flex items-start gap-3">
      {/* Qloo's picture of the best match helps a caregiver say "yes, that's him". */}
      <QlooImage src={c.image} sizes="96px" className="size-14 rounded-lg" />
      <span className="block min-w-0 flex-1">
        <span className="block">
          {parts.map((part, i) => (
            <span key={i} className={i === 0 ? "font-bold" : undefined}>
              {i > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="sr-only">, </span>
                </>
              )}
              {part}
            </span>
          ))}
        </span>
        {c.description && (
          <span className="mt-0.5 block text-base text-muted-foreground">{c.description}</span>
        )}
      </span>
    </span>
  );
}

// Keeps choices that still fit the list and preselects single matches (still saved by a person).
function nextChoices(prev: Record<string, string>, list: SeedResolution[]) {
  const next: Record<string, string> = {};
  for (const r of list) {
    if (r.status !== "needs_input") continue;
    const kept = prev[r.seedId];
    const only = r.candidates.length === 1 ? r.candidates[0] : undefined;
    if (kept && (kept === NONE || r.candidates.some((c) => c.id === kept))) next[r.seedId] = kept;
    else if (only) next[r.seedId] = only.id;
  }
  return next;
}

/** Screen 4 (docs/06): the agent looks favourites up in Qloo; the caregiver picks the right match. */
export function SeedConfirm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [resolutions, setResolutions] = useState<SeedResolution[] | null>(null);
  const [loadError, setLoadError] = useState<{ kind: ApiFailureKind; message: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [finishedRuns, setFinishedRuns] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  const chooseHeadingRef = useRef<HTMLHeadingElement>(null);
  const allCheckedRef = useRef<HTMLParagraphElement>(null);
  const runRef = useRef<AbortController | null>(null);

  const applyResolutions = useCallback((list: SeedResolution[]) => {
    setResolutions(list);
    setChoices((prev) => nextChoices(prev, list));
  }, []);

  useEffect(() => {
    let active = true;
    api.listResolutions(id).then((r) => {
      if (!active) return;
      if (r.ok) applyResolutions(r.data.resolutions);
      else setLoadError({ kind: r.kind, message: r.message });
    });
    return () => {
      active = false;
    };
  }, [id, attempt, applyResolutions]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setResolutions(null);
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

  // After a run, focus moves to what needs doing next (the button that had focus is gone).
  useEffect(() => {
    if (finishedRuns > 0) (chooseHeadingRef.current ?? allCheckedRef.current)?.focus();
  }, [finishedRuns]);

  async function check() {
    const controller = new AbortController();
    runRef.current = controller;
    setRunning(true);
    setProblem(null);
    setSaveError(null);
    setLog([]);
    const run: { done: boolean; problem: Problem | null } = { done: false, problem: null };
    const result = await api.resolveSeeds(
      id,
      (event) => {
        if (event.type === "error") {
          run.problem = { kind: event.problem, message: event.message };
          return;
        }
        // After a stop the banner explains it; a closing "Done." would read like success.
        if (event.type !== "done" || !run.problem) setLog((l) => [...l, event.message]);
        if (event.type === "done") {
          run.done = true;
          applyResolutions(event.data);
        }
      },
      controller.signal,
    );
    if (controller.signal.aborted) return;
    runRef.current = null;
    if (!result.ok) {
      run.problem = { kind: "stopped", message: result.kind === "limit" ? BUSY : result.message };
    } else if (!run.done && !run.problem) {
      run.problem = { kind: "stopped", message: STOPPED };
    }
    if (!run.done) {
      // Favourites looked up before the stream ended are saved: show them.
      const fresh = await api.listResolutions(id);
      if (fresh.ok) applyResolutions(fresh.data.resolutions);
    }
    setRunning(false);
    if (run.problem) setProblem(run.problem);
    else setFinishedRuns((n) => n + 1);
  }

  async function save() {
    if (!resolutions) return;
    const decisions = resolutions
      .filter((r) => r.status === "needs_input" && choices[r.seedId])
      .map((r) => ({
        seedId: r.seedId,
        candidateId: choices[r.seedId] === NONE ? null : (choices[r.seedId] ?? null),
      }));
    if (decisions.length === 0) {
      setSaveError("Please choose a match (or “None of these”) for at least one favourite.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const r = await api.confirmSeeds(id, decisions);
    if (r.ok) {
      router.replace(`/profiles/${id}?confirmed=1`);
      return;
    }
    setSaving(false);
    if (r.kind === "limit") {
      // Something changed since the page opened (another tab, a new check): show the current list.
      const fresh = await api.listResolutions(id);
      if (fresh.ok) applyResolutions(fresh.data.resolutions);
      setSaveError(
        "Something changed since this page opened. We've refreshed the list. Please choose again.",
      );
      return;
    }
    setSaveError(
      r.kind === "invalid"
        ? "Those choices couldn't be read. Please reload the page and try again."
        : r.message,
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {loadError.message}
        </p>
        {loadError.kind !== "not_found" && (
          <Button className="h-12 px-5 text-base" onClick={retryLoad}>
            Try again
          </Button>
        )}
        <Link
          href={`/profiles/${id}`}
          className="block py-3 text-base font-bold underline underline-offset-4"
        >
          Back to the profile
        </Link>
      </div>
    );
  }
  if (!resolutions) {
    return (
      <p role="status" className="text-lg text-muted-foreground">
        Loading favourites…
      </p>
    );
  }

  const pending = resolutions.filter((r) => r.status === "pending");
  const choosing = resolutions.filter((r) => r.status === "needs_input");
  const notes = resolutions.filter((r) => r.status === "unresolved" && r.message);
  // One primary action per screen: checking steps back while choices wait or Qloo can't answer.
  const checkIsSecondary =
    choosing.length > 0 || problem?.kind === "qloo_not_connected" || problem?.kind === "quota";

  return (
    <div className="space-y-8">
      <section aria-labelledby="check-heading" className="space-y-4">
        <h2 id="check-heading" className="text-xl font-bold">
          Look up the favourites in Qloo
        </h2>
        <p className="text-base text-muted-foreground">
          Memory Lane asks Qloo which singers, films, TV shows, dishes and places match each
          favourite. You then pick the right one. Only the names you typed are sent, never the
          nickname.
        </p>
        {pending.length > 0 ? (
          <>
            <div className="space-y-2">
              <h3 className="text-lg font-bold">Not checked yet</h3>
              <ul role="list" className="space-y-2">
                {pending.map((r) => (
                  <li key={r.seedId} className="rounded-xl border bg-card p-4 text-base">
                    <span className="font-bold">“{r.rawText}”</span>
                    {r.message && <span className="block text-muted-foreground">{r.message}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              variant={checkIsSecondary ? "outline" : "default"}
              className={actionButton}
              disabled={running || saving}
              focusableWhenDisabled
              onClick={check}
            >
              {running
                ? "Checking…"
                : `Check ${pending.length} favourite${pending.length === 1 ? "" : "s"} with Qloo`}
            </Button>
          </>
        ) : (
          <p ref={allCheckedRef} tabIndex={-1} className="text-base outline-none">
            {resolutions.length > 0
              ? "Every favourite has been checked."
              : "There are no favourites to check."}
          </p>
        )}
        {(running || log.length > 0) && <AgentLog lines={log} />}
        {problem && (
          <ProblemBanner
            ref={problemRef}
            message={problem.message}
            offerDemo={problem.kind === "quota" || problem.kind === "qloo_not_connected"}
          />
        )}
      </section>

      {notes.length > 0 && (
        <section aria-labelledby="notes-heading" className="space-y-3">
          <h2 id="notes-heading" className="text-xl font-bold">
            Won&apos;t be used
          </h2>
          <ul role="list" className="space-y-2">
            {notes.map((r) => (
              <li key={r.seedId} className="rounded-xl border bg-card p-4 text-base">
                <span className="font-bold">“{r.rawText}”:</span> {r.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {choosing.length > 0 && (
        <section aria-labelledby="choose-heading" className="space-y-4">
          <h2
            id="choose-heading"
            ref={chooseHeadingRef}
            tabIndex={-1}
            className="text-xl font-bold outline-none"
          >
            Choose the right matches
          </h2>
          <p className="text-base text-muted-foreground">
            {choosing.length === 1
              ? "1 favourite needs your choice."
              : `${choosing.length} favourites need your choice.`}{" "}
            Nothing is used until you save.
          </p>
          {choosing.map((r) => {
            const options: { value: string; label: ReactNode }[] = [
              ...r.candidates.map((c) => ({ value: c.id, label: <CandidateLabel c={c} /> })),
              { value: NONE, label: "None of these" },
            ];
            return (
              <fieldset key={r.seedId} className="space-y-2 rounded-2xl border bg-card p-4">
                <legend className="px-1 text-lg font-bold">
                  Which “{r.rawText}” did you mean?
                </legend>
                {options.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-transparent px-3 py-2 text-lg has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                  >
                    <input
                      type="radio"
                      name={`seed-${r.seedId}`}
                      value={opt.value}
                      checked={choices[r.seedId] === opt.value}
                      onChange={() => setChoices((c) => ({ ...c, [r.seedId]: opt.value }))}
                      className="mt-0.5 size-6 shrink-0 accent-primary outline-none"
                    />
                    <span className="min-w-0 flex-1">{opt.label}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
          {saveError && (
            <p role="alert" className="text-base font-bold text-destructive">
              {saveError}
            </p>
          )}
          <Button
            className={actionButton}
            disabled={saving || running}
            focusableWhenDisabled
            onClick={save}
          >
            {saving ? "Saving…" : "Save choices"}
          </Button>
        </section>
      )}

      <Link
        href={`/profiles/${id}`}
        className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
      >
        Back to the profile
      </Link>
    </div>
  );
}
