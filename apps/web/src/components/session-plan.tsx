"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock } from "lucide-react";
import type { Session } from "@memory-lane/shared";
import { KIND_ICONS, REACTION_LABEL, slotLabel } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { api, type ApiFailureKind } from "@/lib/api";

const primaryLink =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-center text-base font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto";

/** Screen 6 (docs/06): the session plan — a calm timeline, then Start. */
export function SessionPlan() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<{ kind: ApiFailureKind; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.getSession(id).then((r) => {
      if (!active) return;
      if (r.ok) setSession(r.data.session);
      else setError({ kind: r.kind, message: r.message });
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setSession(null);
    setAttempt((n) => n + 1);
  }, []);

  if (error) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {error.kind === "not_found"
            ? "We couldn't find that session on this device."
            : error.message}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {error.kind !== "not_found" && (
            <Button className="h-12 px-5 text-base" onClick={retry}>
              Try again
            </Button>
          )}
          <Link
            href="/profiles"
            className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
          >
            Your profiles
          </Link>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <p role="status" className="text-lg text-muted-foreground">
        Loading the session…
      </p>
    );
  }

  const done = session.status === "done";
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-4xl leading-tight">Session {session.number}</h1>
        <p className="flex items-center gap-2 text-lg text-muted-foreground">
          <Clock aria-hidden="true" className="size-5" />
          About {session.totalMinutes} minutes · {session.items.length} things to share
        </p>
      </div>

      {session.whatChanged.length > 0 && (
        <section
          aria-labelledby="changed-heading"
          className="space-y-2 rounded-2xl border border-evidence bg-card p-4"
        >
          <h2 id="changed-heading" className="text-xl font-bold">
            What changed since last time
          </h2>
          <ul role="list" className="list-disc space-y-1 pl-5 text-base">
            {session.whatChanged.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="plan-heading" className="space-y-3">
        <h2 id="plan-heading" className="sr-only">
          The plan
        </h2>
        <ol className="space-y-3">
          {session.items.map((item, i) => {
            const Icon = KIND_ICONS[item.kind];
            return (
              <li key={item.id} className="flex gap-4 rounded-2xl border bg-card p-4">
                <span
                  aria-hidden="true"
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"
                >
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-base font-bold text-muted-foreground">
                    {i + 1}. {slotLabel(item, i, session.items.length)} · {item.minutes} min
                  </p>
                  <p className="font-heading text-xl leading-snug">
                    {item.name}
                    {item.year ? (
                      <span className="text-muted-foreground"> ({item.year})</span>
                    ) : null}
                  </p>
                  <p className="text-base">{item.why}</p>
                  <p className="text-base text-muted-foreground">
                    <span className="font-bold">To start: </span>
                    {item.prompts[0]}
                  </p>
                  {item.reaction && (
                    <p className="text-base font-bold text-evidence">
                      {REACTION_LABEL[item.reaction]}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href={`/sessions/${session.id}/${done ? "summary" : "play"}`} className={primaryLink}>
          {done
            ? "See how it went"
            : session.status === "in_progress"
              ? "Carry on with the session"
              : "Start the session"}
        </Link>
        <Link
          href={`/profiles/${session.profileId}/taste`}
          className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
        >
          Back to the Life Taste Profile
        </Link>
      </div>
      <p className="text-base text-muted-foreground">
        Sit together somewhere comfortable. Play each one, talk if it feels right, and move on
        whenever you like. There are no right answers.
      </p>
    </div>
  );
}
