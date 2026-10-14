"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@memory-lane/shared";
import { DemoBanner } from "@/components/demo-banner";
import { Loading } from "@/components/loading";
import { KIND_ICONS, REACTION_LABEL } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { api, type ApiFailureKind } from "@/lib/api";

const primary =
  "inline-flex h-auto min-h-12 w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-center text-base font-bold whitespace-normal text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto";
const textLink =
  "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4";

/** Screen 8 (docs/06): how the session went, what happens with it, and the next one. */
export function SessionSummary() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [loadError, setLoadError] = useState<{ kind: ApiFailureKind; message: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  // On a demo persona: the session Stage 4 planned from this one, to see what it learned.
  const [nextId, setNextId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getSession(id).then(async (r) => {
      if (!active) return;
      if (!r.ok) {
        setLoadError({
          kind: r.kind,
          message:
            r.kind === "not_found" ? "We couldn't find that session on this device." : r.message,
        });
        return;
      }
      setSession(r.data.session);
      setReadOnly(r.data.readOnly);
      document.title = `How session ${r.data.session.number} went · Memory Lane`;
      if (r.data.readOnly) {
        const list = await api.listSessions(r.data.session.profileId);
        const next = list.ok
          ? list.data.sessions.find((s) => s.number === r.data.session.number + 1)
          : undefined;
        if (active) setNextId(next?.id ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }, []);

  async function planNext() {
    if (!session) return;
    setPlanning(true);
    setError(null);
    const r = await api.planSession(session.profileId);
    if (r.ok) {
      router.push(`/sessions/${r.data.session.id}`);
      return;
    }
    setPlanning(false);
    setError(r.message);
  }

  if (loadError) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {loadError.message}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {loadError.kind !== "not_found" && (
            <Button className="h-12 px-5 text-base" onClick={retry}>
              Try again
            </Button>
          )}
          <Link href="/profiles" className={textLink}>
            Your profiles
          </Link>
          <Link href="/demo" className={textLink}>
            Demo profiles
          </Link>
        </div>
      </div>
    );
  }
  if (!session) return <Loading>Loading…</Loading>;

  const reacted = session.items.filter((i) => i.reaction);
  const landed = session.items.filter((i) => i.reaction === "sang" || i.reaction === "engaged");
  return (
    <div className="space-y-8">
      {readOnly && <DemoBanner />}
      <div className="space-y-2">
        <h1 className="font-heading text-4xl leading-tight">How session {session.number} went</h1>
        <p className="text-lg text-muted-foreground">
          {reacted.length === 0
            ? "No reactions were logged. That's fine; the next session will still be fresh."
            : landed.length === 0
              ? "Some days are quieter. Next time Memory Lane will try different things."
              : `${landed.length} of ${session.items.length} landed well.`}
        </p>
      </div>

      {reacted.length > 0 && (
        <p className="rounded-2xl border-2 border-evidence bg-card p-4 text-base">
          <span className="font-bold">What happens next: </span>
          when the next session is planned, what landed well comes first and Qloo is asked for more
          like it and ranks what comes next; anything that seemed to upset them never returns.
        </p>
      )}

      <ul role="list" className="space-y-3">
        {session.items.map((item) => {
          const Icon = KIND_ICONS[item.kind];
          return (
            <li key={item.id} className="flex items-start gap-4 rounded-2xl border bg-card p-4">
              <Icon aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-xl leading-snug break-words">{item.name}</p>
                <p
                  className={`text-base font-bold ${item.reaction ? "text-evidence" : "text-muted-foreground"}`}
                >
                  <span className="sr-only">How it landed: </span>
                  {item.reaction ? REACTION_LABEL[item.reaction] : "No reaction logged"}
                </p>
                {item.note && <p className="text-base break-words">“{item.note}”</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-base font-bold text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {!readOnly && (
          <Button
            className="h-auto min-h-12 w-full whitespace-normal px-6 py-3 text-base sm:w-auto"
            disabled={planning}
            focusableWhenDisabled
            onClick={planNext}
          >
            {planning ? "Planning…" : "Plan the next session"}
          </Button>
        )}
        {readOnly && nextId && (
          <Link href={`/sessions/${nextId}`} className={primary}>
            See session {session.number + 1}: what Memory Lane learned
          </Link>
        )}
        <Link href={`/profiles/${session.profileId}/taste`} className={textLink}>
          Back to the Life Taste Profile
        </Link>
      </div>
    </div>
  );
}
