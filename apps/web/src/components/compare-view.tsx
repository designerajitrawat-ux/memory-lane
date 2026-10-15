"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bot, CalendarX2, CircleSlash, Copy, ShieldCheck, Sparkles } from "lucide-react";
import type { CompareItem, ComparePlan, CompareResponse } from "@memory-lane/shared";
import { Loading, useAfter } from "@/components/loading";
import { KIND_ICONS } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { api, type ApiFailureKind } from "@/lib/api";

const textLink =
  "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4";

const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * Screen 9 (docs/06): the same AI model asked for the same session from the same facts, without Qloo,
 * next to Memory Lane's session — with the differences counted in code, not claimed.
 */
export function CompareView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<{ kind: ApiFailureKind; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const slow = useAfter(!data && !error, 5_000);

  useEffect(() => {
    let active = true;
    api.getCompare(id).then((r) => {
      if (!active) return;
      if (r.ok) setData(r.data);
      else setError({ kind: r.kind, message: r.message });
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setData(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    document.title = "Generic AI vs Memory Lane · Memory Lane";
  }, []);

  if (error) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {error.kind === "not_found" ? "We couldn't find that profile." : error.message}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {error.kind !== "not_found" && (
            <Button className="h-12 px-5 text-base" onClick={retry}>
              Try again
            </Button>
          )}
          <Link href="/demo" className={textLink}>
            Demo profiles
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-2">
        <Loading>Loading the comparison…</Loading>
        {slow && (
          <p className="text-base text-muted-foreground">
            The first time, the AI is asked for its plan; this takes a few seconds.
          </p>
        )}
      </div>
    );
  }

  const era = `${data.era.from}–${data.era.to}`;
  const others = joinNames(data.comparedWith);
  return (
    <div className="space-y-8">
      <p className="text-lg text-muted-foreground">
        The same AI model{data.model ? ` (${data.model})` : ""}, asked for the same session from the
        same facts the caregiver typed — but without Qloo. Code then counts the differences.
      </p>

      {data.state !== "ready" && (
        <p className="rounded-2xl border-2 border-warning p-4 text-base">
          {data.state === "off"
            ? "The generic-AI side needs an AI key on the server, which isn't set up right now. Memory Lane's own plan is below."
            : data.state === "budget"
              ? "Today's AI budget has been used, so the generic plan can't be made right now. Please look again tomorrow."
              : "The AI couldn't make its plan just now. Please try again in a moment."}
        </p>
      )}

      {data.generic && data.memoryLane && (
        <section aria-labelledby="counts-heading" className="space-y-3">
          <h2 id="counts-heading" className="text-xl font-bold">
            What code counted
          </h2>
          <ul role="list" className="grid gap-3 sm:grid-cols-2">
            <Metric
              icon={Sparkles}
              label="New beyond their favourites"
              generic={`${data.generic.beyondFavourites} of ${data.generic.items.length}`}
              ours={`${data.memoryLane.beyondFavourites} of ${data.memoryLane.items.length}`}
            />
            <Metric
              icon={ShieldCheck}
              label="With Qloo evidence"
              generic={`${data.generic.withEvidence} of ${data.generic.items.length}`}
              ours={`${data.memoryLane.withEvidence} of ${data.memoryLane.items.length}`}
            />
            <Metric
              icon={CalendarX2}
              label={`Dated outside their years (${era})`}
              generic={String(data.generic.outsideYears)}
              ours={String(data.memoryLane.outsideYears)}
            />
            <Metric
              icon={CircleSlash}
              label="Touching the things to avoid"
              generic={String(data.generic.avoided)}
              ours={String(data.memoryLane.avoided)}
            />
            {others && (
              <Metric
                icon={Copy}
                label={`Also in ${others}’s plans`}
                generic={`${data.generic.shared} of ${data.generic.items.length}`}
                ours={`${data.memoryLane.shared} of ${data.memoryLane.items.length}`}
              />
            )}
          </ul>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Plan
          title="A generic AI, without Qloo"
          icon={Bot}
          plan={data.generic}
          era={era}
          empty="Not available right now."
          generic
        />
        <Plan
          title="Memory Lane, grounded in Qloo"
          icon={Sparkles}
          plan={data.memoryLane}
          era={era}
          empty="No session has been planned for this profile yet."
        />
      </div>

      <p className="text-base text-muted-foreground">
        A generic answer can still make a fine session, but it mostly hands back what the caregiver
        already typed, and it can&apos;t show why anything else fits <em>this</em> person. Memory
        Lane finds what people with the same favourites enjoyed in those years, checks it against
        their years and things to avoid, and each item carries the Qloo calls behind it.
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {data.sessionId && (
          <Link href={`/sessions/${data.sessionId}`} className={textLink}>
            Open Memory Lane&apos;s session
          </Link>
        )}
        <Link href={`/profiles/${id}/taste`} className={textLink}>
          Back to the Life Taste Profile
        </Link>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  generic,
  ours,
}: {
  icon: typeof ShieldCheck;
  label: string;
  generic: string;
  ours: string;
}) {
  return (
    <li className="space-y-2 rounded-2xl border bg-card p-4">
      <p className="flex items-start gap-2 text-base font-bold">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        {label}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-base">
        <div>
          <dt className="text-muted-foreground">Generic AI</dt>
          <dd className="font-heading text-2xl">{generic}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Memory Lane</dt>
          <dd className="font-heading text-2xl text-evidence">{ours}</dd>
        </div>
      </dl>
    </li>
  );
}

function Plan({
  title,
  icon: Icon,
  plan,
  era,
  empty,
  generic = false,
}: {
  title: string;
  icon: typeof Bot;
  plan: ComparePlan | null;
  era: string;
  empty: string;
  generic?: boolean;
}) {
  const headingId = generic ? "generic-heading" : "ours-heading";
  return (
    <section
      aria-labelledby={headingId}
      className={`space-y-3 rounded-2xl border-2 p-4 ${generic ? "border-border" : "border-evidence"}`}
    >
      <h2 id={headingId} className="flex items-center gap-2 text-xl font-bold">
        <Icon aria-hidden="true" className="size-6 shrink-0 text-primary" />
        {title}
      </h2>
      {!plan || plan.items.length === 0 ? (
        <p className="text-base text-muted-foreground">{empty}</p>
      ) : (
        <ol role="list" className="space-y-3">
          {plan.items.map((item, n) => (
            <Item key={n} item={item} era={era} generic={generic} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Item({ item, era, generic }: { item: CompareItem; era: string; generic: boolean }) {
  const Icon = KIND_ICONS[item.kind];
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3">
      <p className="flex items-start gap-2">
        <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
        <span className="font-heading text-lg leading-snug break-words">
          {item.name}
          {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
        </span>
      </p>
      <p className="text-base break-words">{item.why}</p>
      <ul role="list" className="flex flex-wrap gap-2 text-base">
        {generic ? (
          <Badge tone="muted">No Qloo evidence</Badge>
        ) : (
          <Badge tone="good">
            Qloo evidence: {item.evidence} {item.evidence === 1 ? "call" : "calls"}
          </Badge>
        )}
        {item.fromFavourites ? (
          <Badge tone="muted">One of their favourites</Badge>
        ) : (
          !generic && <Badge tone="good">New find</Badge>
        )}
        {item.outsideYears && <Badge tone="warn">Outside {era}</Badge>}
        {item.avoided && <Badge tone="warn">On the things to avoid</Badge>}
        {item.sharedWith.length > 0 && (
          <Badge tone="muted">Also for {joinNames(item.sharedWith)}</Badge>
        )}
      </ul>
    </li>
  );
}

function Badge({ tone, children }: { tone: "good" | "warn" | "muted"; children: ReactNode }) {
  const style =
    tone === "good"
      ? "border-evidence text-evidence"
      : tone === "warn"
        ? "border-destructive text-destructive"
        : "border-border text-muted-foreground";
  return <li className={`rounded-full border-2 px-3 py-0.5 font-bold ${style}`}>{children}</li>;
}
