"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { EvidenceView } from "@memory-lane/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";

/** What the drawer needs to know about an item: a taste-profile item or a session item. */
export interface EvidenceSubject {
  name: string;
  /** Why it is here (aggregate wording). */
  caption: string;
  description?: string | null;
  entityId: string;
  entityType: string | null;
  evidenceIds: string[];
  /** Taste-profile items say where they came from; session items don't. */
  source?: "favourite" | "qloo" | "learned";
}

const TOOL_LABELS: Record<string, string> = {
  qloo_describe: "Looked up in Qloo, then chosen as a favourite",
  qloo_find_tags: "Matched to Qloo's tags",
  qloo_recommend: "Recommended by Qloo",
  qloo_rank: "Ranked by Qloo against what landed well",
};

const STATUS_WORDS: Record<string, string> = {
  ok: "Answered",
  needs_input: "Several matches; one was chosen",
  partial: "Partly answered",
  degraded: "Partly answered",
  empty: "No results",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function chipFor(subject: EvidenceSubject): string {
  if (subject.source === "favourite") return "Qloo · confirmed";
  if (subject.source === "learned") return "Qloo · learned";
  if (subject.entityType?.startsWith("urn:tag:")) return "Qloo · food tag";
  if (!subject.source && subject.evidenceIds.length > 1) return "Qloo · recommended and ranked";
  return "Qloo · recommended";
}

/**
 * The evidence drawer (docs/06): the Qloo calls behind an item, as recorded — what was asked (with the
 * favourites by name), what Qloo answered, and where this item sat in that answer.
 */
export function EvidenceDrawer({
  subject,
  className = "",
}: {
  subject: EvidenceSubject;
  className?: string;
}) {
  const [records, setRecords] = useState<Record<string, EvidenceView>>({});
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Only what loaded is kept, so reopening (or "Try again") fetches just what's missing.
  function load() {
    const missing = subject.evidenceIds.filter((e) => !records[e]);
    if (missing.length === 0 || loading) return;
    setLoading(true);
    setFailed(false);
    Promise.all(missing.map((e) => api.getEvidence(e))).then((rs) => {
      const next: Record<string, EvidenceView> = {};
      for (const r of rs) if (r.ok) next[r.data.id] = r.data;
      setRecords((prev) => ({ ...prev, ...next }));
      setFailed(rs.some((r) => !r.ok));
      setLoading(false);
    });
  }

  const shown = subject.evidenceIds.map((e) => records[e]).filter((r): r is EvidenceView => !!r);
  return (
    <Dialog onOpenChange={(open) => open && load()}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className={`-ml-3 h-auto min-h-12 gap-2 self-start px-3 text-left text-base font-bold whitespace-normal text-evidence ${className}`}
          />
        }
      >
        <ShieldCheck aria-hidden="true" className="size-5 shrink-0" />
        {chipFor(subject)}
        <span className="sr-only">: show the evidence for {subject.name}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{subject.name}</DialogTitle>
          <DialogDescription>{subject.caption}</DialogDescription>
        </DialogHeader>
        {subject.description && (
          <p className="text-base break-words">
            <span className="font-bold">Qloo says: </span>
            {subject.description}
          </p>
        )}
        <div className="space-y-3">
          <h3 className="text-base font-bold">
            {subject.evidenceIds.length > 1
              ? "The Qloo records behind it"
              : "The Qloo record behind it"}
          </h3>
          <p role="status" className="text-base text-muted-foreground empty:hidden">
            {loading ? "Loading the record…" : ""}
          </p>
          {shown.map((r) => (
            <CallRecord key={r.id} record={r} subject={subject} />
          ))}
          {failed && !loading && (
            <div className="space-y-2">
              <p className="text-base text-muted-foreground">
                {typeof navigator !== "undefined" && navigator.onLine === false
                  ? "You seem to be offline, so the record couldn't be loaded."
                  : "The record couldn't be loaded just now."}
              </p>
              <Button variant="outline" className="h-12 px-5 text-base" onClick={load}>
                Try again
              </Button>
            </div>
          )}
          <p className="text-base text-muted-foreground">
            Qloo describes what groups of people tend to enjoy, not what one person will like.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CallRecord({ record: r, subject }: { record: EvidenceView; subject: EvidenceSubject }) {
  const position = r.results.findIndex((n) => n === subject.name);
  const others = r.results.filter((n) => n !== subject.name).slice(0, 6);
  return (
    // Labels sit beside their values when there is room, above them on narrow screens or large text.
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-xl border bg-card p-3 text-base min-[26rem]:grid-cols-[auto_minmax(0,1fr)] [&>dt]:font-bold min-[26rem]:[&>dt]:font-normal">
      <dt className="text-muted-foreground">What</dt>
      <dd>{TOOL_LABELS[r.tool] ?? r.tool}</dd>
      <dt className="text-muted-foreground">Asked</dt>
      <dd className="break-words">{describeArgs(r)}</dd>
      <dt className="text-muted-foreground">Answer</dt>
      <dd>
        {STATUS_WORDS[r.status] ?? r.status}, {plural(r.resultCount, "result")}
        {position >= 0 && r.tool !== "qloo_describe" && `; this was number ${position + 1}`}
        {r.cached && " (saved answer)"}
      </dd>
      {others.length > 0 && r.tool !== "qloo_describe" && (
        <>
          <dt className="text-muted-foreground">Also</dt>
          <dd className="break-words">
            {others.join(", ")}
            {r.results.length - (position >= 0 ? 1 : 0) > others.length && "…"}
          </dd>
        </>
      )}
      <dt className="text-muted-foreground">When</dt>
      <dd>
        {new Date(r.createdAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </dd>
    </dl>
  );
}

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** What was sent, in plain words, favourites by name (the args already passed the privacy guard). */
function describeArgs(r: EvidenceView): string {
  const a = (r.args && typeof r.args === "object" ? r.args : {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const signals = ids(a.signals);
  const named = signals.map((s) => r.names[s]).filter((n): n is string => !!n);
  const from =
    named.length === signals.length && named.length > 0
      ? joinNames(named)
      : signals.length
        ? plural(signals.length, "favourite")
        : "";
  const parts: string[] = [];
  if (typeof a.entity === "string") parts.push(`“${a.entity}”`);
  if (typeof a.query === "string") parts.push(`“${a.query}”`);
  if (r.tool === "qloo_rank") {
    parts.push(`${plural(ids(a.options).length, "option")} ranked`);
    if (from) parts.push(`against ${from}`);
  } else {
    if (typeof a.target_type === "string") parts.push(`${a.target_type.replace(/_/g, " ")}s`);
    if (from) parts.push(`enjoyed by people who love ${from}`);
  }
  if (typeof a.filter_location === "string") parts.push(`near ${a.filter_location}`);
  const text = parts.join(", ").replace(/s, enjoyed by/, "s enjoyed by");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}
