"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Session } from "@memory-lane/shared";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { ItemThumb } from "@/components/qloo-image";
import { KIND_ICONS, isFavouriteItem, slotLabel } from "@/components/session-labels";
import { api } from "@/lib/api";
import { loadDemos } from "@/lib/demos";

/**
 * The landing page's look at the product itself: a demo profile's newest session (the one that learned
 * from session 1), as a caregiver sees it — what changed, then the first items with Qloo's pictures and
 * reasons. Space is kept while it loads; if it can't load, the section goes away.
 */
export function SessionPeek() {
  const [peek, setPeek] = useState<{ name: string | null; session: Session } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const demos = await loadDemos();
      const demo = demos.ok ? demos.data.profiles.find((d) => d.latestSessionId) : undefined;
      if (!demo?.latestSessionId) {
        if (active) setFailed(true);
        return;
      }
      const r = await api.getSession(demo.latestSessionId);
      if (!active) return;
      if (r.ok) setPeek({ name: demo.nickname, session: r.data.session });
      else setFailed(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;
  if (!peek) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center rounded-2xl border bg-card p-5">
        <p className="text-base text-muted-foreground">Loading a session from a demo profile…</p>
      </div>
    );
  }

  const { name, session } = peek;
  const whose = name ? `${name}’s` : "A demo profile’s";
  return (
    <section
      aria-labelledby="peek-heading"
      className="grid gap-8 rounded-2xl border bg-card p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12"
    >
      <div className="space-y-4">
        <p className="text-base font-bold text-primary">A real session, from a fictional demo</p>
        <h2 id="peek-heading" className="font-heading text-3xl leading-tight">
          {whose} session {session.number}
        </h2>
        <p className="text-base text-muted-foreground">
          About {session.totalMinutes} minutes · {session.items.length} things to share.
          {session.whatChanged.length > 0 && " What it learned from how the last one went:"}
        </p>
        {session.whatChanged.length > 0 && (
          <ul role="list" className="list-disc space-y-1 pl-5 text-base">
            {session.whatChanged.slice(0, 2).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <Link
          href={`/sessions/${session.id}`}
          className="inline-flex min-h-12 items-center gap-2 text-base font-bold underline underline-offset-4"
        >
          Open {whose} session {session.number}
          <ArrowRight aria-hidden="true" className="size-5" />
        </Link>
      </div>
      <ol role="list" className="space-y-3">
        {session.items.slice(0, 3).map((item, i) => (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-xl bg-secondary/60 p-3 min-[22rem]:flex-row min-[22rem]:items-start min-[22rem]:gap-4"
          >
            <ItemThumb image={item.image} icon={KIND_ICONS[item.kind]} />
            <div className="min-w-0 space-y-0.5">
              <p className="text-base font-bold text-muted-foreground">
                {slotLabel(item, i, session.items.length)}
              </p>
              <p className="font-heading text-xl leading-snug break-words">
                {item.name}
                {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
              </p>
              <p className="text-base break-words">{item.why}</p>
              {/* Every item shows its Qloo evidence, here too (checklist; ux review W7). */}
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
          </li>
        ))}
      </ol>
    </section>
  );
}
