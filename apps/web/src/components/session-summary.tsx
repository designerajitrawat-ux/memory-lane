"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@memory-lane/shared";
import { KIND_ICONS, REACTION_LABEL } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** Screen 8 (docs/06): how the session went, and the next one. */
export function SessionSummary() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);

  useEffect(() => {
    let active = true;
    api.getSession(id).then((r) => {
      if (!active) return;
      if (r.ok) {
        setSession(r.data.session);
        setReadOnly(r.data.readOnly);
      } else setError(r.message);
    });
    return () => {
      active = false;
    };
  }, [id]);

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

  if (!session) {
    return error ? (
      <p role="alert" className="text-lg">
        {error}
      </p>
    ) : (
      <p role="status" className="text-lg text-muted-foreground">
        Loading…
      </p>
    );
  }

  const reacted = session.items.filter((i) => i.reaction);
  const landed = session.items.filter((i) => i.reaction === "sang" || i.reaction === "engaged");
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-4xl leading-tight">How session {session.number} went</h1>
        <p className="text-lg text-muted-foreground">
          {reacted.length === 0
            ? "No reactions were logged. That's fine; the next session will still be fresh."
            : `${landed.length} of ${session.items.length} landed well. Memory Lane uses these to plan what comes next.`}
        </p>
      </div>

      <ul role="list" className="space-y-3">
        {session.items.map((item) => {
          const Icon = KIND_ICONS[item.kind];
          return (
            <li key={item.id} className="flex items-start gap-4 rounded-2xl border bg-card p-4">
              <Icon aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-xl leading-snug">{item.name}</p>
                <p
                  className={`text-base font-bold ${item.reaction ? "text-evidence" : "text-muted-foreground"}`}
                >
                  {item.reaction ? REACTION_LABEL[item.reaction] : "No reaction logged"}
                </p>
                {item.note && <p className="text-base">“{item.note}”</p>}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
        <Link
          href={`/profiles/${session.profileId}/taste`}
          className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
        >
          Back to the Life Taste Profile
        </Link>
      </div>
    </div>
  );
}
