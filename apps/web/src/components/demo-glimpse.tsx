"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DemoProfile } from "@memory-lane/shared";
import { QlooImage } from "@/components/qloo-image";
import { api } from "@/lib/api";

const TILES = 6;
const tile = "block aspect-square w-full rounded-xl bg-secondary";

/** Up to six pictures, taking each demo profile's in turn (favourites first), each picture once. */
function pick(demos: readonly DemoProfile[]): string[] {
  const out: string[] = [];
  for (let round = 0; out.length < TILES; round++) {
    const next = demos.map((d) => d.preview[round]).filter((src): src is string => !!src);
    if (next.length === 0) break;
    for (const src of next) if (out.length < TILES && !out.includes(src)) out.push(src);
  }
  return out;
}

/**
 * The landing page's first pictures: Qloo's images from the three fictional demo profiles, so a visitor
 * sees at a glance that very different childhoods get their own music, films and places. Space is kept
 * while loading (no layout jump); if the demos can't be read, or have no pictures, it goes away.
 */
export function DemoGlimpse() {
  const [demos, setDemos] = useState<DemoProfile[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api.listDemoProfiles().then((r) => {
      if (!active) return;
      if (r.ok) setDemos(r.data.profiles);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const images = demos ? pick(demos) : [];
  if (failed || (demos && images.length === 0)) return null;
  const names = (demos ?? []).map((d) => d.nickname).filter((n): n is string => !!n);
  const who =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}, our` : "our";

  return (
    <div className="space-y-2">
      {/* The pictures open the demos too; keyboard and screen-reader users have the link below. */}
      <Link
        href="/demo"
        tabIndex={-1}
        aria-hidden="true"
        className="grid grid-cols-3 gap-2 sm:grid-cols-6"
      >
        {demos
          ? images.map((src) => (
              <QlooImage
                key={src}
                src={src}
                sizes="(min-width: 640px) 110px, 30vw"
                className="aspect-square w-full rounded-xl"
                fallback={<span className={tile} />}
              />
            ))
          : Array.from({ length: TILES }, (_, i) => <span key={i} className={tile} />)}
      </Link>
      <p className="text-base text-muted-foreground">
        {demos
          ? `Pictures Qloo has for the music, films and places it found for ${who} fictional demo profiles.`
          : "Loading pictures from the demo profiles…"}
      </p>
      <Link
        href="/demo"
        className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
      >
        See the demo profiles
      </Link>
    </div>
  );
}
