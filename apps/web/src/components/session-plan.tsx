"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock, Printer } from "lucide-react";
import type { Session } from "@memory-lane/shared";
import { DemoBanner } from "@/components/demo-banner";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { Loading } from "@/components/loading";
import {
  KIND_ICONS,
  REACTION_LABEL,
  isFavouriteItem,
  slotLabel,
} from "@/components/session-labels";
import { TryDemo } from "@/components/try-demo";
import { Button } from "@/components/ui/button";
import { api, type ApiFailureKind } from "@/lib/api";

const primaryLink =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-center text-base font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto";
const textLink =
  "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4";

/** Screen 6 (docs/06): the session plan — a calm timeline, what changed, then Start. */
export function SessionPlan() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<{ kind: ApiFailureKind; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.getSession(id).then((r) => {
      if (!active) return;
      if (r.ok) {
        setSession(r.data.session);
        setReadOnly(r.data.readOnly);
      } else setError({ kind: r.kind, message: r.message });
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

  useEffect(() => {
    if (!error || error.kind === "not_found") return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [error, retry]);

  useEffect(() => {
    if (session) document.title = `Session ${session.number} plan · Memory Lane`;
  }, [session]);

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
  if (!session) return <Loading>Loading the session…</Loading>;

  const done = session.status === "done";
  const start = (
    <Link href={`/sessions/${session.id}/${done ? "summary" : "play"}`} className={primaryLink}>
      {done
        ? "See how it went"
        : session.status === "in_progress"
          ? "Carry on with the session"
          : "Start the session"}
    </Link>
  );
  return (
    <div className="space-y-8">
      {readOnly && (
        <div className="no-print">
          <DemoBanner />
        </div>
      )}
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="font-heading text-4xl leading-tight">Session {session.number}</h1>
          <p className="flex items-center gap-2 text-lg text-muted-foreground">
            <Clock aria-hidden="true" className="size-5" />
            About {session.totalMinutes} minutes · {session.items.length} things to share
          </p>
        </div>
        <p className="text-base text-muted-foreground">
          Sit together somewhere comfortable. Play each one, talk if it feels right, and move on
          whenever you like. There are no right answers.
        </p>
        {/* Start sits near the top too: the timeline is two or three screens on a phone (ux S8). */}
        <div className="no-print">{start}</div>
      </div>

      {session.whatChanged.length > 0 && (
        <section
          aria-labelledby="changed-heading"
          className="print-plain space-y-2 rounded-2xl border-2 border-evidence bg-card p-4"
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
        <ol role="list" className="space-y-3">
          {session.items.map((item, i) => {
            const Icon = KIND_ICONS[item.kind];
            return (
              <li key={item.id} className="print-plain flex gap-4 rounded-2xl border bg-card p-4">
                <span
                  aria-hidden="true"
                  className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary min-[24rem]:flex"
                >
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-base font-bold text-muted-foreground">
                    {i + 1}. {slotLabel(item, i, session.items.length)} · {item.minutes} min
                  </p>
                  <h3 className="font-heading text-xl leading-snug break-words">
                    {item.name}
                    {item.year ? (
                      <span className="text-muted-foreground"> ({item.year})</span>
                    ) : null}
                  </h3>
                  <p className="text-base">{item.why}</p>
                  <p className="text-base text-muted-foreground">
                    <span className="font-bold">To start: </span>
                    {item.prompts[0]}
                  </p>
                  {/* On paper: the other prompts, and what to search for (links don't work there). */}
                  <ul className="hidden list-disc pl-5 text-base print:block">
                    {item.prompts.slice(1).map((p, n) => (
                      <li key={n}>{p}</li>
                    ))}
                  </ul>
                  <p className="hidden text-base print:block">
                    <span className="font-bold">Search: </span>
                    {searchWords(item.link.url)}
                  </p>
                  {item.reaction && (
                    <p className="text-base font-bold text-evidence">
                      <span className="sr-only">How it landed: </span>
                      {REACTION_LABEL[item.reaction]}
                    </p>
                  )}
                  <div className="no-print">
                    <EvidenceDrawer
                      subject={{
                        name: item.name,
                        caption: item.why,
                        entityId: item.entityId,
                        entityType: item.entityType,
                        evidenceIds: item.evidenceIds,
                        ...(isFavouriteItem(item) ? { source: "favourite" as const } : {}),
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {readOnly && <TryDemo profileId={session.profileId} name={null} />}

      <p className="hidden text-base print:block">
        Memory Lane supports reminiscence activities. It is not a medical device and does not
        diagnose or treat any condition.
      </p>

      <div className="no-print flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {start}
        <Button
          variant="outline"
          className="h-auto min-h-12 gap-2 px-5 text-base"
          onClick={() => window.print()}
        >
          <Printer aria-hidden="true" className="size-5" />
          Print this plan
        </Button>
        <Link href={`/profiles/${session.profileId}/compare`} className={textLink}>
          Compare with a generic AI
        </Link>
        <Link href={`/profiles/${session.profileId}/taste`} className={textLink}>
          Back to the Life Taste Profile
        </Link>
      </div>
    </div>
  );
}

/** The words a link searches for, for the printed plan ("Asha Bhosle 1970s songs on YouTube"). */
function searchWords(url: string): string {
  try {
    const u = new URL(url);
    const where = u.host.includes("google")
      ? "Google Maps"
      : u.host.includes("spotify")
        ? "Spotify"
        : "YouTube";
    const q =
      u.searchParams.get("search_query") ??
      u.searchParams.get("query") ??
      decodeURIComponent(u.pathname.split("/").pop() ?? "");
    return `${q} (${where})`;
  } catch {
    return url;
  }
}
