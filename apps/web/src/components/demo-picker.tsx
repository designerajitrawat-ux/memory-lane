"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { DemoProfile } from "@memory-lane/shared";
import { Loading } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const POLL_MS = 15_000;
const POLL_FOR_MS = 2 * 60_000;
const textLink =
  "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4";

/** Screen 2 (docs/06): the three fictional personas, each opening on a ready Life Taste Profile. */
export function DemoPicker() {
  const [demos, setDemos] = useState<DemoProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    api.listDemoProfiles().then((r) => {
      if (!active) return;
      setChecking(false);
      if (r.ok) {
        setError(null);
        setDemos(r.data.profiles);
      } else setError(r.message);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const check = useCallback(() => {
    setChecking(true);
    setAttempt((n) => n + 1);
  }, []);

  // Right after a deploy the personas are still being built: look again for a couple of minutes.
  const empty = demos !== null && demos.length === 0;
  useEffect(() => {
    if (!empty) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) clearInterval(timer);
      else check();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [empty, check]);

  if (error) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {error}
        </p>
        <Button
          className="h-12 px-5 text-base"
          disabled={checking}
          focusableWhenDisabled
          onClick={check}
        >
          {checking ? "Trying…" : "Try again"}
        </Button>
      </div>
    );
  }
  if (!demos) return <Loading>Loading the demo profiles…</Loading>;
  if (demos.length === 0) {
    return (
      <div role="status" className="space-y-4 rounded-2xl border bg-card p-5">
        <p className="text-lg">
          The demo profiles are being prepared with Qloo right now. This page checks again by
          itself; it usually takes a minute or two.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Button
            variant="outline"
            className="h-12 px-5 text-base"
            disabled={checking}
            focusableWhenDisabled
            onClick={check}
          >
            {checking ? "Checking…" : "Check again"}
          </Button>
          <Link href="/profiles/new" className={textLink}>
            Create a profile instead
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul role="list" className="space-y-4">
      {demos.map((d) => {
        const name = d.nickname ?? "Demo profile";
        return (
          <li key={d.id} className="space-y-1">
            <Link
              href={`/profiles/${d.id}/taste`}
              className="group block space-y-3 rounded-2xl border bg-card p-5 outline-hidden hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <h2 className="font-heading text-2xl leading-snug">{name}</h2>
                  <span className="block text-base font-normal text-muted-foreground">
                    Born {d.birthYear}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="mt-1 size-6 shrink-0 text-primary transition-transform group-hover:translate-x-1"
                />
              </span>
              <span className="flex items-start gap-2 text-base text-muted-foreground">
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <span>
                  {d.regions.map((r, i) => (
                    <span key={r}>
                      {i > 0 && (
                        <>
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only">, then </span>
                        </>
                      )}
                      {r}
                    </span>
                  ))}
                </span>
              </span>
              {d.favourites.length > 0 && (
                <span className="block text-base">
                  <span className="font-bold">Favourites: </span>
                  {d.favourites.join(", ")}
                </span>
              )}
              <span className="block text-base font-bold text-primary underline-offset-4 group-hover:underline">
                Open {d.nickname ? `${d.nickname}’s` : "the"} Life Taste Profile
              </span>
            </Link>
            {d.latestSessionId && (
              <Link href={`/sessions/${d.latestSessionId}`} className={`${textLink} px-1`}>
                or go straight to session 2<span className="sr-only">, for {name}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
