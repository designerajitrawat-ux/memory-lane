"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { DemoProfile } from "@memory-lane/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** Screen 2 (docs/06): the three fictional personas, each opening on a ready Life Taste Profile. */
export function DemoPicker() {
  const [demos, setDemos] = useState<DemoProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.listDemoProfiles().then((r) => {
      if (!active) return;
      if (r.ok) setDemos(r.data.profiles);
      else setError(r.message);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setDemos(null);
    setAttempt((n) => n + 1);
  }, []);

  if (error) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {error}
        </p>
        <Button className="h-12 px-5 text-base" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!demos) {
    return (
      <p role="status" className="text-lg text-muted-foreground">
        Loading the demo profiles… (the first visit can take a few seconds while Memory Lane wakes
        up)
      </p>
    );
  }
  if (demos.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-5 text-lg">
        The demo profiles are being prepared with Qloo right now. Please come back in a few minutes,
        or create your own profile.
      </p>
    );
  }

  return (
    <ul role="list" className="space-y-4">
      {demos.map((d) => (
        <li key={d.id}>
          <Link
            href={`/profiles/${d.id}/taste`}
            className="group block space-y-3 rounded-2xl border bg-card p-5 outline-hidden hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="font-heading text-2xl leading-snug">
                {d.nickname ?? "Demo profile"}
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
              {d.regions.join(" → ")}
            </span>
            {d.favourites.length > 0 && (
              <span className="block text-base">
                <span className="font-bold">Favourites: </span>
                {d.favourites.join(", ")}
              </span>
            )}
            <span className="block text-base font-bold text-primary underline-offset-4 group-hover:underline">
              Open {d.nickname ?? "this"}&apos;s Life Taste Profile
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
