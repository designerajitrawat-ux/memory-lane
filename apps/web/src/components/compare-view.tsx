"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Bot,
  CalendarX2,
  CircleSlash,
  Copy,
  MessageSquareOff,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { CompareItem, ComparePlan, CompareResponse } from "@memory-lane/shared";
import { DemoBanner } from "@/components/demo-banner";
import { Loading } from "@/components/loading";
import { KIND_ICONS } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { api, type ApiFailureKind } from "@/lib/api";

const textLink =
  "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4";

const join = (names: string[], word: "and" | "or") =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${word} ${names.at(-1)}`;

const possessive = (name: string) => `${name}’s`;

interface MetricRow {
  icon: typeof ShieldCheck;
  label: string;
  /** For the "same on both sides" line. */
  short: string;
  generic: number;
  ours: number;
  /** Shown as "n of total". */
  outOf?: boolean;
}

/** The counts code made, each side; a card only where the two differ, the rest in one line. */
function metricRows(data: CompareResponse, generic: ComparePlan, ours: ComparePlan, era: string) {
  const rows: MetricRow[] = [
    {
      icon: Sparkles,
      label: "New beyond what the caregiver typed",
      short: "new beyond what the caregiver typed",
      generic: generic.beyondFavourites,
      ours: ours.beyondFavourites,
      outOf: true,
    },
    {
      icon: ShieldCheck,
      label: "With Qloo evidence (a generic AI has none to show)",
      short: "with Qloo evidence",
      generic: generic.withEvidence,
      ours: ours.withEvidence,
      outOf: true,
    },
    {
      icon: CalendarX2,
      label: `Dated outside their years (${era}), by the year each plan gives`,
      short: "dated outside their years",
      generic: generic.outsideYears,
      ours: ours.outsideYears,
    },
    {
      icon: CircleSlash,
      label: "On the avoid-list",
      short: "on the avoid-list",
      generic: generic.avoided,
      ours: ours.avoided,
    },
    {
      icon: MessageSquareOff,
      label: "Reasons Memory Lane wouldn't show",
      short: "reasons Memory Lane wouldn't show",
      generic: generic.wordingBlocked,
      ours: ours.wordingBlocked,
    },
  ];
  if (data.comparedWith.length > 0) {
    const others = join(data.comparedWith.map(possessive), "or");
    rows.push({
      icon: Copy,
      label: `Also in ${others} plans`,
      short: `also in ${others} plans`,
      generic: generic.shared,
      ours: ours.shared,
      outOf: true,
    });
  }
  return rows;
}

/** One line a judge can read in ten seconds, made from the counts (never a fixed verdict). */
function verdict(generic: ComparePlan, ours: ComparePlan) {
  const of = (n: number, plan: ComparePlan) => `${n} of ${plan.items.length}`;
  const extras = [
    generic.outsideYears > 0 && `${generic.outsideYears} dated outside their years`,
    generic.avoided > 0 && `${generic.avoided} on the avoid-list`,
    generic.wordingBlocked > 0 &&
      `${generic.wordingBlocked} with reasons Memory Lane wouldn't show`,
  ].filter((e): e is string => !!e);
  return {
    ours: `${of(ours.beyondFavourites, ours)} new beyond what the caregiver typed, ${of(ours.withEvidence, ours)} with Qloo evidence${ours.avoided ? `, ${ours.avoided} on the avoid-list` : ""}.`,
    generic: `${of(generic.beyondFavourites, generic)} new, none with evidence${extras.length ? `, ${join(extras, "and")}` : ""}.`,
  };
}

/**
 * Screen 9 (docs/06): the same AI model given the same facts and the same task, without Qloo, next to
 * Memory Lane's first session (made from those facts, before any reactions) — with the differences
 * counted in code, not claimed.
 */
export function CompareView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<{ kind: ApiFailureKind; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

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

  // After "Try again" the button is gone: move focus to the result (ux review S9).
  useEffect(() => {
    if (data && attempt > 0) resultRef.current?.focus();
  }, [data, attempt]);

  useEffect(() => {
    document.title = "Generic AI vs Memory Lane · Memory Lane";
  }, []);

  if (error) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {error.kind === "not_found"
            ? "We couldn't find that profile. Demo profiles are rebuilt from time to time; pick one again from the demo page."
            : error.message}
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
          <Link href="/profiles" className={textLink}>
            Your profiles
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <Loading slowHint="The first time, the AI is asked for its plan; this can take up to half a minute.">
        Loading the comparison…
      </Loading>
    );
  }

  const era = `${data.era.from} to ${data.era.to}`;
  const rows =
    data.generic && data.memoryLane ? metricRows(data, data.generic, data.memoryLane, era) : [];
  const differ = rows.filter((r) => r.generic !== r.ours);
  const same = rows.filter((r) => r.generic === r.ours);
  const session = data.sessionNumber ? `session ${data.sessionNumber}` : "first session";
  const of = (n: number, plan: ComparePlan | null) => `${n} of ${plan?.items.length ?? 0}`;
  const summary = data.generic && data.memoryLane ? verdict(data.generic, data.memoryLane) : null;
  const notReady =
    data.state === "off"
      ? "The generic-AI side needs an AI key on the server, which isn't set up right now."
      : data.state === "budget"
        ? "Today's AI budget has been used, so the generic plan can't be made right now. Please look again tomorrow."
        : data.state === "limit"
          ? "This device or network has asked the AI for a lot today, so the generic plan can't be made right now. Please look again tomorrow."
          : data.state === "refused"
            ? "Not asked: something in this profile looks personal, and Memory Lane never sends personal details to an AI."
            : "The AI couldn't make its plan just now.";

  return (
    <div ref={resultRef} tabIndex={-1} className="space-y-8 outline-none">
      {data.demo && <DemoBanner />}
      <p className="text-lg text-muted-foreground">
        {data.nickname ? `For ${data.nickname}. ` : ""}We gave an AI model
        {data.model ? ` (${data.model})` : ""} the facts the caregiver typed and the same task (a
        favourite or two, then new things they&apos;re likely to enjoy), with no Qloo. Next to it is
        Memory Lane&apos;s {session}, made from the same facts before any reactions. Code, not the
        AI, counts the differences.
      </p>

      {summary && (
        <div className="space-y-1 rounded-2xl border-2 border-evidence bg-card p-4 text-lg">
          <p>
            <span className="font-bold text-evidence">Memory Lane:</span> {summary.ours}
          </p>
          <p>
            <span className="font-bold">Generic AI:</span> {summary.generic}
          </p>
        </div>
      )}

      {data.state !== "ready" && (
        <div className="space-y-3 rounded-2xl border-2 border-warning p-4 text-base">
          <p>{notReady} Memory Lane&apos;s own plan is still shown below.</p>
          {data.state === "failed" && (
            <Button className="h-12 px-5 text-base" onClick={retry}>
              Try again
            </Button>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <section aria-labelledby="counts-heading" className="space-y-3">
          <h2 id="counts-heading" className="text-xl font-bold">
            What code counted
          </h2>
          {differ.length > 0 && (
            <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {differ.map((r) => (
                <Metric
                  key={r.short}
                  icon={r.icon}
                  label={r.label}
                  generic={r.outOf ? of(r.generic, data.generic) : String(r.generic)}
                  ours={r.outOf ? of(r.ours, data.memoryLane) : String(r.ours)}
                />
              ))}
            </ul>
          )}
          {same.length > 0 && (
            <p className="text-base text-muted-foreground">
              The same on both sides:{" "}
              {join(
                same.map((r) => `${r.short} (${r.generic}${r.outOf ? " each" : ""})`),
                "and",
              )}
              .
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Plan
          title="A generic AI, without Qloo"
          icon={Bot}
          plan={data.generic}
          era={era}
          empty="Not available right now."
          generic
        />
        <Plan
          title={`Memory Lane’s ${session}, grounded in Qloo`}
          subtitle="The same facts, before any reactions."
          icon={Sparkles}
          plan={data.memoryLane}
          era={era}
          empty="No session has been planned for this profile yet."
        />
      </div>

      <p className="text-base text-muted-foreground">
        A generic answer can still make a fine session, but nothing behind it shows why an item fits{" "}
        <em>this</em> person, and nothing checks its years or the avoid-list. Memory Lane finds what
        people with the same favourites enjoyed in those years, checks it against their years and
        the avoid-list, and each item carries the Qloo calls behind it.
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {data.sessionId && (
          <Link href={`/sessions/${data.sessionId}`} className={textLink}>
            Open Memory Lane&apos;s {session}
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
    <li className="min-w-0 space-y-2 rounded-2xl border bg-card p-4">
      <p className="flex items-start gap-2 text-base font-bold">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      </p>
      {/* One side per line, so the numbers never spill at large text sizes (ux review C1). */}
      <dl className="space-y-1 text-base">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <dt className="text-muted-foreground">Generic AI</dt>
          <dd className="font-heading text-2xl">{generic}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <dt className="text-muted-foreground">Memory Lane</dt>
          <dd className="font-heading text-2xl text-evidence">{ours}</dd>
        </div>
      </dl>
    </li>
  );
}

function Plan({
  title,
  subtitle,
  icon: Icon,
  plan,
  era,
  empty,
  generic = false,
}: {
  title: string;
  subtitle?: string;
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
      className={`min-w-0 space-y-3 rounded-2xl border-2 p-3 sm:p-4 ${generic ? "border-border" : "border-evidence"}`}
    >
      <div className="space-y-1">
        <h2 id={headingId} className="flex items-start gap-2 text-xl font-bold">
          <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
        </h2>
        {subtitle && <p className="text-base text-muted-foreground">{subtitle}</p>}
      </div>
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
  const matched = item.matched ?? (item.fromFavourites ? "One of their favourites" : null);
  return (
    <li className="min-w-0 space-y-2 rounded-xl border bg-card p-3">
      <p className="flex items-start gap-2">
        <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
        <span className="min-w-0 font-heading text-lg leading-snug [overflow-wrap:anywhere]">
          {item.name}
          {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
        </span>
      </p>
      {item.wordingBlocked ? (
        <p className="text-base text-muted-foreground italic">
          Reason not shown: its wording fails the checks Memory Lane runs on everything it shows
          (about the person, their memory or their health).
        </p>
      ) : (
        <p className="text-base [overflow-wrap:anywhere]">{item.why}</p>
      )}
      {/* Plain text, not a pill: it isn't a button (ux review W10). */}
      <p
        className={`flex items-center gap-2 text-base font-bold ${generic ? "text-muted-foreground" : "text-evidence"}`}
      >
        <ShieldCheck aria-hidden="true" className="size-5 shrink-0" />
        {generic
          ? "No Qloo evidence"
          : `Qloo evidence: ${item.evidence} ${item.evidence === 1 ? "call" : "calls"}`}
      </p>
      <ul role="list" className="flex flex-wrap gap-2 text-base">
        {matched ? (
          <Badge tone="muted">{matched}</Badge>
        ) : (
          !generic && (
            <Badge tone="good">
              {item.source === "proposed" ? "Suggested by AI, ranked by Qloo" : "New find"}
            </Badge>
          )
        )}
        {item.outsideYears && <Badge tone="warn">Outside {era}</Badge>}
        {item.avoided && <Badge tone="warn">On the avoid-list</Badge>}
        {item.wordingBlocked && <Badge tone="warn">Wording blocked</Badge>}
        {item.sharedWith.length > 0 && (
          <Badge tone="muted">Also for {join(item.sharedWith, "and")}</Badge>
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
  return (
    <li
      className={`max-w-full rounded-full border-2 px-3 py-0.5 font-bold [overflow-wrap:anywhere] ${style}`}
    >
      {children}
    </li>
  );
}
