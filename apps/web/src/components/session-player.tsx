"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, ExternalLink, MapPin, Play, TriangleAlert } from "lucide-react";
import type { Reaction, Session, SessionItem } from "@memory-lane/shared";
import { DemoBanner } from "@/components/demo-banner";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { Loading } from "@/components/loading";
import { TryDemo } from "@/components/try-demo";
import { KIND_ICONS, REACTIONS, isFavouriteItem, slotLabel } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type ApiFailureKind } from "@/lib/api";

const bigLink =
  "inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 py-3 text-center text-lg font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto";
const textLink =
  "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4";

type Status = { text: string; error?: boolean; retry?: () => void };

const UPSET_SAVED =
  "Saved. It's fine to stop or move on; Memory Lane won't suggest this one again. Tap it again to undo.";
const UPSET_DEMO =
  "Noted for this visit. In your own profile, Memory Lane wouldn't suggest this one again.";

/**
 * Screen 7 (docs/06): the session player. One item at a time, large type, one-handed: play it, talk
 * if it feels right, tap how it landed, move on. Reactions save as soon as they are tapped; a save
 * that fails says which item it was for and can be tried again.
 */
export function SessionPlayer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  // A demo persona's session: reactions show how it works, but nothing is saved.
  const [readOnly, setReadOnly] = useState(false);
  const [loadError, setLoadError] = useState<{ kind: ApiFailureKind; message: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>({ text: "" });
  const [finishing, setFinishing] = useState(false);
  const [ended, setEnded] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const endRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const stepRef = useRef(0);
  // The newest request per item wins; finishing waits for saves still on their way (ux review W3).
  const latest = useRef(new Map<string, number>());
  const pending = useRef(new Set<Promise<unknown>>());

  useEffect(() => {
    let active = true;
    api.getSession(id).then((r) => {
      if (!active) return;
      if (!r.ok) {
        setLoadError({
          kind: r.kind,
          message:
            r.kind === "not_found" ? "We couldn't find that session on this device." : r.message,
        });
        return;
      }
      setSession(r.data.session);
      setReadOnly(r.data.readOnly);
      // Carry on where it was left: the first item without a reaction.
      if (!started.current) {
        started.current = true;
        const next = r.data.session.items.findIndex((i) => !i.reaction);
        setStep(next === -1 ? 0 : next);
      }
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }, []);

  // Back online: try again whatever failed (a load, or the last save).
  useEffect(() => {
    const retry = loadError ? retryLoad : status.error ? status.retry : undefined;
    if (!retry) return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [loadError, retryLoad, status]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Each new item (not each saved reaction): back to the top, and its title takes focus, so screen
  // readers hear "Item 2 of 6" and the name first (ux review W2).
  const ready = session !== null;
  useEffect(() => {
    if (!ready) return;
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [step, ready]);

  const item = session?.items[step];
  useEffect(() => {
    if (session && item) {
      document.title = `${step + 1} of ${session.items.length}: ${item.name} · Session ${session.number} · Memory Lane`;
    }
  }, [session, item, step]);

  useEffect(() => {
    if (ended) endRef.current?.focus();
  }, [ended]);

  const updateItem = useCallback((next: SessionItem) => {
    setSession((s) => (s ? { ...s, items: s.items.map((i) => (i.id === next.id ? next : i)) } : s));
  }, []);

  /** Sends a save; resolves to its result, or null when a newer save for the item replaced it. */
  async function send(itemId: string, value: Reaction | null, note: string | undefined) {
    const seq = (latest.current.get(itemId) ?? 0) + 1;
    latest.current.set(itemId, seq);
    const request = api.react(itemId, value, note);
    pending.current.add(request);
    const r = await request.finally(() => pending.current.delete(request));
    return latest.current.get(itemId) === seq ? r : null;
  }

  const isCurrent = (target: SessionItem) => session?.items[stepRef.current]?.id === target.id;

  async function react(target: SessionItem, value: Reaction) {
    const next = target.reaction === value ? null : value; // tapping again clears it
    updateItem({ ...target, reaction: next });
    if (readOnly) {
      setStatus({
        text: !next
          ? "Cleared."
          : next === "distressed"
            ? UPSET_DEMO
            : "Noted for this visit (demo reactions aren't saved).",
      });
      return;
    }
    setStatus({ text: "Saving…" });
    const r = await send(target.id, next, target.note ?? undefined);
    if (!r) return;
    if (r.ok) {
      updateItem(r.data.item);
      if (isCurrent(target)) {
        setStatus({ text: !next ? "Cleared." : next === "distressed" ? UPSET_SAVED : "Saved." });
      }
    } else {
      updateItem(target);
      setStatus({
        text: `Not saved for “${target.name}”: ${r.message}`,
        error: true,
        retry: () => void react(target, value),
      });
    }
  }

  async function saveNote(target: SessionItem, note: string) {
    const text = note.trim();
    if ((target.note ?? "") === text) return;
    if (readOnly) {
      updateItem({ ...target, note: text || null });
      setStatus({ text: "Noted for this visit (demo notes aren't saved)." });
      return;
    }
    setStatus({ text: "Saving the note…" });
    const r = await send(target.id, target.reaction, text);
    if (!r) return;
    if (r.ok) {
      updateItem(r.data.item);
      if (isCurrent(target)) setStatus({ text: text ? "Note saved." : "Note removed." });
    } else {
      setStatus({
        text: `Note not saved for “${target.name}”: ${r.message}`,
        error: true,
        ...(r.code === "invalid_note" ? {} : { retry: () => void saveNote(target, note) }),
      });
    }
  }

  function go(to: number) {
    setStatus({ text: "" });
    setStep(to);
  }

  async function finish() {
    if (readOnly) {
      setEnded(true);
      return;
    }
    setFinishing(true);
    await Promise.allSettled([...pending.current]);
    const r = await api.completeSession(id);
    if (r.ok) {
      router.push(`/sessions/${id}/summary`);
      return;
    }
    setFinishing(false);
    setStatus({ text: `Couldn't finish: ${r.message}`, error: true, retry: () => void finish() });
  }

  if (loadError) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {loadError.message}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {loadError.kind !== "not_found" && (
            <Button className="h-12 px-5 text-base" onClick={retryLoad}>
              Try again
            </Button>
          )}
          <Link href="/profiles" className={textLink}>
            Your profiles
          </Link>
          <Link href="/demo" className={textLink}>
            Demo profiles
          </Link>
        </div>
      </div>
    );
  }
  if (!session || !item) return <Loading>Loading the session…</Loading>;

  if (ended) {
    const learned = session.number > 1;
    return (
      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-8">
          <h1
            ref={endRef}
            tabIndex={-1}
            className="font-heading text-3xl leading-tight outline-none sm:text-4xl"
          >
            That&apos;s the end of the session
          </h1>
          <p className="text-lg">
            In your own profile, finishing saves the reactions, and the next plan learns from them:
            what they sang along to comes first, Qloo is asked for more like it and ranks what comes
            next, and anything that upset them never returns.
          </p>
          {learned && (
            <p className="text-base text-muted-foreground">
              This session already shows that: look for &ldquo;What changed since last time&rdquo;
              on its plan.
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href={`/sessions/${session.id}`}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-6 py-3 text-center text-base font-bold text-primary-foreground"
            >
              Back to the plan
            </Link>
            <Link href={`/profiles/${session.profileId}/taste`} className={textLink}>
              The Life Taste Profile
            </Link>
            <Link href="/profiles/new" className={textLink}>
              Create your own profile
            </Link>
          </div>
        </section>
        <TryDemo profileId={session.profileId} name={null} />
      </div>
    );
  }

  const total = session.items.length;
  const Icon = KIND_ICONS[item.kind];
  const last = step === total - 1;
  const LinkIcon = item.kind === "place" ? MapPin : Play;
  const destination = new URL(item.link.url).host.includes("google") ? "Google Maps" : "YouTube";

  return (
    <div className="space-y-6">
      {readOnly && <DemoBanner playing />}
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-bold text-muted-foreground" aria-hidden="true">
          Session {session.number} · {step + 1} of {total}
        </p>
        <Link href={`/sessions/${session.id}`} className={textLink}>
          Pause (see the plan)
        </Link>
      </div>
      <div
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={step + 1}
        aria-valuetext={`Item ${step + 1} of ${total}`}
        className="h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>

      <article
        aria-labelledby="item-title"
        className="space-y-6 rounded-2xl border bg-card p-5 sm:p-8"
      >
        <p className="flex items-center gap-2 text-lg font-bold text-primary">
          <Icon aria-hidden="true" className="size-6" />
          {slotLabel(item, step, total)} · {item.minutes} min
        </p>
        <h1
          id="item-title"
          ref={titleRef}
          tabIndex={-1}
          className="font-heading text-4xl leading-tight break-words outline-none sm:text-5xl"
        >
          <span className="sr-only">
            Item {step + 1} of {total}:{" "}
          </span>
          {item.name}
          {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
        </h1>

        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href={item.link.url} target="_blank" rel="noopener noreferrer" className={bigLink}>
              <LinkIcon aria-hidden="true" className="size-6 shrink-0" />
              {item.link.label}
              <ExternalLink aria-hidden="true" className="size-5 shrink-0 opacity-80" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {item.altLink && (
              <a
                href={item.altLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-field-border px-6 py-3 text-center text-lg font-bold outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.altLink.label}
                <ExternalLink aria-hidden="true" className="size-5 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
          <p className="text-base text-muted-foreground">
            {item.altLink ? "Links open" : `Opens ${destination}`} in a new tab. Come back to this
            tab when you&apos;re ready.
          </p>
        </div>

        <section aria-labelledby="prompts-heading" className="space-y-3">
          <h2 id="prompts-heading" className="text-xl font-bold">
            Things to talk about
          </h2>
          <ul role="list" className="space-y-3">
            {item.prompts.map((p, i) => (
              <li key={i} className="rounded-xl bg-secondary px-4 py-3 text-2xl leading-snug">
                {p}
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-1">
          <p className="text-base text-muted-foreground">{item.why}</p>
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

        <Reactions
          key={item.id}
          item={item}
          readOnly={readOnly}
          onReact={react}
          onSaveNote={saveNote}
        />
        <div role="status" aria-live="polite" className="min-h-6">
          {status.text && (
            <div
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-base ${status.error ? "font-bold text-destructive" : "text-muted-foreground"}`}
            >
              <span className="flex items-start gap-2">
                {status.error && (
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                )}
                {status.text}
              </span>
              {status.retry && (
                <Button variant="outline" className="h-12 px-5 text-base" onClick={status.retry}>
                  Try again
                </Button>
              )}
            </div>
          )}
        </div>
      </article>

      <nav aria-label="Session" className="player-nav grid grid-cols-[auto_1fr] gap-3">
        <Button
          variant="outline"
          className="h-auto min-h-14 px-5 text-lg"
          disabled={step === 0}
          onClick={() => go(Math.max(0, step - 1))}
        >
          Back
        </Button>
        {last ? (
          <Button
            className="h-auto min-h-14 px-5 text-lg whitespace-normal"
            disabled={finishing}
            focusableWhenDisabled
            onClick={finish}
          >
            {finishing ? "Finishing…" : "Finish the session"}
          </Button>
        ) : (
          <Button
            className="h-auto min-h-14 px-5 text-lg whitespace-normal"
            onClick={() => go(Math.min(total - 1, step + 1))}
          >
            Next
          </Button>
        )}
      </nav>
    </div>
  );
}

function Reactions({
  item,
  readOnly,
  onReact,
  onSaveNote,
}: {
  item: SessionItem;
  readOnly: boolean;
  onReact: (item: SessionItem, value: Reaction) => void;
  onSaveNote: (item: SessionItem, note: string) => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  // A saved note shows when they come back to the item (ux review W5).
  const [open, setOpen] = useState(!!item.note);
  return (
    <section aria-labelledby="reaction-heading" className="space-y-3 border-t pt-5">
      <h2 id="reaction-heading" className="text-xl font-bold">
        How did it land?
      </h2>
      <div
        role="group"
        aria-labelledby="reaction-heading"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {REACTIONS.map(({ value, label, icon: Icon }) => {
          const on = item.reaction === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onReact(item, value)}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-2 text-lg font-bold outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-xl ${
                on
                  ? "border-evidence bg-evidence/10 text-foreground"
                  : "border-field-border bg-card hover:bg-secondary"
              }`}
            >
              {on && (
                <Check
                  aria-hidden="true"
                  className="absolute top-2 right-2 size-5 rounded-full bg-evidence p-0.5 text-white"
                />
              )}
              <Icon aria-hidden="true" className={`size-6 ${on ? "text-evidence" : ""}`} />
              {label}
            </button>
          );
        })}
      </div>
      {item.reaction === "distressed" && (
        <p className="rounded-xl border border-warning p-3 text-base">
          It&apos;s fine to stop or move on.{" "}
          {readOnly
            ? "In your own profile, Memory Lane wouldn't suggest this one again."
            : "Memory Lane won't suggest this one again."}
        </p>
      )}
      <details
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
        className="rounded-xl border p-3"
      >
        <summary className="flex min-h-12 cursor-pointer items-center text-base font-bold">
          {item.note ? "Your note" : "Add a note (optional)"}
        </summary>
        <div className="mt-3 space-y-2">
          <label htmlFor={`note-${item.id}`} className="block text-base">
            A few words for next time, like what they said or did. Please leave out health details.
            Stays in Memory Lane.
          </label>
          <Textarea
            id={`note-${item.id}`}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => onSaveNote(item, note)}
            className="min-h-24 text-base"
          />
          <Button
            variant="outline"
            className="h-12 px-5 text-base"
            onClick={() => onSaveNote(item, note)}
          >
            Save note
          </Button>
        </div>
      </details>
    </section>
  );
}
