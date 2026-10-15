"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DemoProfile } from "@memory-lane/shared";
import { QlooImage } from "@/components/qloo-image";
import { api } from "@/lib/api";

const TILES = 6;

/**
 * The landing page's first picture: two of Qloo's images from each demo profile (favourites first), so
 * a visitor sees at a glance that three very different childhoods get their own music, films and
 * places. Space is kept while loading (no layout jump); if the demos can't be read, it goes away.
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

  const perDemo = demos?.length ? Math.max(1, Math.floor(TILES / demos.length)) : 0;
  const images = (demos ?? []).flatMap((d) => d.preview.slice(0, perDemo)).slice(0, TILES);
  const names = (demos ?? []).map((d) => d.nickname).filter((n): n is string => !!n);
  if (failed || (demos && images.length === 0)) return null;

  return (
    <figure className="space-y-2">
      <div aria-hidden="true" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: TILES }, (_, i) => {
          const src = images[i];
          return src ? (
            <QlooImage
              key={src}
              src={src}
              sizes="(min-width: 640px) 110px, 30vw"
              className="aspect-square w-full rounded-xl"
              eager
            />
          ) : (
            <span key={i} className="block aspect-square w-full rounded-xl bg-secondary" />
          );
        })}
      </div>
      <figcaption className="text-base text-muted-foreground">
        {names.length ? (
          <>
            From the demo profiles of {names.slice(0, -1).join(", ")}
            {names.length > 1 ? " and " : ""}
            {names.at(-1)}: Qloo&apos;s pictures from the years that mattered to each of them.{" "}
            <Link href="/demo" className="font-bold text-foreground underline underline-offset-4">
              See them
            </Link>
          </>
        ) : (
          <span>Loading pictures from the demo profiles…</span>
        )}
      </figcaption>
    </figure>
  );
}
