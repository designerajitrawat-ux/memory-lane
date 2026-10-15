"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { DemoProfile } from "@memory-lane/shared";
import { Loading } from "@/components/loading";
import { QlooImage } from "@/components/qloo-image";
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
  // After two minutes of checking, the copy stops promising it will check by itself (ux W6).
  const [gaveUp, setGaveUp] = useState(false);
  // The list arrived after a wait: say so to screen readers.
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    let active = true;
    api.listDemoProfiles().then((r) => {
      if (!active) return;
      setChecking(false);
      if (r.ok) {
        setError(null);
        setDemos((before) => {
          if (before?.length === 0 && r.data.profiles.length > 0) setWaited(true);
          return r.data.profiles;
        });
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
      if (Date.now() - started > POLL_FOR_MS) {
        clearInterval(timer);
        setGaveUp(true);
      } else check();
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
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="status" className="text-lg">
          {gaveUp
            ? "The demo profiles are still being prepared. Please check again in a few minutes, or create your own profile."
            : "The demo profiles are being prepared with Qloo right now. This page checks again by itself; it usually takes a minute or two."}
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
    <>
      <p role="status" className="sr-only">
        {waited ? "The demo profiles are ready." : ""}
      </p>
      {/* One column on phones; side by side on wider screens. */}
      <ul role="list" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {demos.map((d) => {
          const name = d.nickname ?? "Demo profile";
          return (
            // The whole card opens the profile (a stretched heading link); the session link sits above.
            <li
              key={d.id}
              className="relative space-y-3 rounded-2xl border bg-card p-5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring hover:border-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-2xl leading-snug">
                    <Link
                      href={`/profiles/${d.id}/taste`}
                      className="outline-hidden after:absolute after:inset-0 after:rounded-2xl"
                    >
                      {name}
                      <span className="sr-only">
                        : open {d.nickname ? `${d.nickname}’s` : "the"} Life Taste Profile
                      </span>
                    </Link>
                  </h2>
                  <p className="text-base text-muted-foreground">Born {d.birthYear}</p>
                </div>
                <ArrowRight aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />
              </div>
              <p className="flex items-start gap-2 text-base text-muted-foreground">
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
              </p>
              {d.preview.length > 0 && (
                // A glimpse of their profile: Qloo's pictures, favourites first (decorative).
                <div
                  aria-hidden="true"
                  className="pointer-events-none grid max-w-sm grid-cols-4 gap-2"
                >
                  {d.preview.slice(0, 4).map((src) => (
                    <QlooImage
                      key={src}
                      src={src}
                      sizes="(min-width: 640px) 96px, 22vw"
                      className="aspect-square w-full rounded-lg"
                      fallback={
                        <span className="block aspect-square w-full rounded-lg bg-secondary" />
                      }
                    />
                  ))}
                </div>
              )}
              {d.favourites.length > 0 && (
                <p className="text-base">
                  <span className="font-bold">Favourites: </span>
                  {d.favourites.join(", ")}
                </p>
              )}
              <p aria-hidden="true" className="text-base font-bold text-primary">
                Open {d.nickname ? `${d.nickname}’s` : "the"} Life Taste Profile
              </p>
              {d.latestSessionId && (
                <Link
                  href={`/sessions/${d.latestSessionId}`}
                  className={`${textLink} relative z-10`}
                >
                  Or go straight to {d.nickname ? `${d.nickname}’s` : "the"} session 2
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
