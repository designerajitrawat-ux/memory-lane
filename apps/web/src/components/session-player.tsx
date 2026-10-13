"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, Play } from "lucide-react";
import type { Reaction, Session, SessionItem } from "@memory-lane/shared";
import { DemoBanner } from "@/components/demo-banner";
import { KIND_ICONS, REACTIONS, slotLabel } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

const bigLink =
  "inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 py-3 text-center text-lg font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto";

/**
 * Screen 7 (docs/06): the session player. One item at a time, large type, one-handed: play it, talk
 * if it feels right, tap how it landed, move on. Reactions save as soon as they are tapped.
 */
export function SessionPlayer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  // A demo persona's session: reactions show how it works, but nothing is saved.
  const [readOnly, setReadOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [finishing, setFinishing] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  useEffect(() => {
    let active = true;
    api.getSession(id).then((r) => {
      if (!active) return;
      if (!r.ok) {
        setLoadError(
          r.kind === "not_found" ? "We couldn't find that session on this device." : r.message,
        );
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
  }, [id]);

  // Each new item (not each saved reaction): focus its title, so screen readers start there and the
  // page scrolls to the top.
  const ready = session !== null;
  useEffect(() => {
    if (ready) titleRef.current?.focus();
  }, [step, ready]);

  const updateItem = useCallback((item: SessionItem) => {
    setSession((s) => (s ? { ...s, items: s.items.map((i) => (i.id === item.id ? item : i)) } : s));
  }, []);

  async function react(item: SessionItem, value: Reaction) {
    const next = item.reaction === value ? null : value; // tapping again clears it
    updateItem({ ...item, reaction: next });
    if (readOnly) {
      setStatus(next ? "Noted for this visit (demo reactions aren't saved)." : "Cleared.");
      return;
    }
    setStatus("Saving…");
    const r = await api.react(item.id, next, item.note ?? undefined);
    if (r.ok) {
      updateItem(r.data.item);
      setStatus(next ? "Saved." : "Cleared.");
    } else {
      updateItem(item);
      setStatus(`Not saved: ${r.message}`);
    }
  }

  async function saveNote(item: SessionItem, note: string) {
    if (readOnly) {
      updateItem({ ...item, note: note.trim() || null });
      setStatus("Noted for this visit (demo notes aren't saved).");
      return;
    }
    setStatus("Saving the note…");
    const r = await api.react(item.id, item.reaction, note.trim());
    if (r.ok) {
      updateItem(r.data.item);
      setStatus("Note saved.");
    } else {
      setStatus(`Note not saved: ${r.message}`);
    }
  }

  async function finish() {
    if (readOnly) {
      router.push(`/sessions/${id}`);
      return;
    }
    setFinishing(true);
    const r = await api.completeSession(id);
    if (r.ok) {
      router.push(`/sessions/${id}/summary`);
      return;
    }
    setFinishing(false);
    setStatus(`Couldn't finish: ${r.message}`);
  }

  if (loadError) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <p role="alert" className="text-lg">
          {loadError}
        </p>
        <Link
          href="/profiles"
          className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
        >
          Your profiles
        </Link>
      </div>
    );
  }
  if (!session) {
    return (
      <p role="status" className="text-lg text-muted-foreground">
        Loading the session…
      </p>
    );
  }

  const total = session.items.length;
  const item = session.items[step];
  if (!item) return null;
  const Icon = KIND_ICONS[item.kind];
  const last = step === total - 1;

  return (
    <div className="space-y-6">
      {readOnly && <DemoBanner playing />}
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-bold text-muted-foreground">
          Session {session.number} · {step + 1} of {total}
        </p>
        <Link
          href={`/sessions/${session.id}`}
          className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
        >
          Pause
        </Link>
      </div>
      <div
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
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
          className="font-heading text-4xl leading-tight outline-none sm:text-5xl"
        >
          {item.name}
          {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
        </h1>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href={item.link.url} target="_blank" rel="noopener noreferrer" className={bigLink}>
            <Play aria-hidden="true" className="size-6" />
            {item.link.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {item.altLink && (
            <a
              href={item.altLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border px-6 py-3 text-lg font-bold outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {item.altLink.label}
              <ExternalLink aria-hidden="true" className="size-5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
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

        <p className="text-base text-muted-foreground">{item.why}</p>

        <Reactions key={item.id} item={item} onReact={react} onSaveNote={saveNote} />
        <p role="status" aria-live="polite" className="min-h-6 text-base text-muted-foreground">
          {status}
        </p>
      </article>

      <nav aria-label="Session" className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          className="h-14 px-6 text-lg"
          disabled={step === 0}
          onClick={() => {
            setStatus("");
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          Back
        </Button>
        {last ? (
          <Button
            className="h-14 px-8 text-lg"
            disabled={finishing}
            focusableWhenDisabled
            onClick={finish}
          >
            {finishing ? "Finishing…" : "Finish the session"}
          </Button>
        ) : (
          <Button
            className="h-14 px-8 text-lg"
            onClick={() => {
              setStatus("");
              setStep((s) => Math.min(total - 1, s + 1));
            }}
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
  onReact,
  onSaveNote,
}: {
  item: SessionItem;
  onReact: (item: SessionItem, value: Reaction) => void;
  onSaveNote: (item: SessionItem, note: string) => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  return (
    <section aria-labelledby="reaction-heading" className="space-y-3 border-t pt-5">
      <h2 id="reaction-heading" className="text-xl font-bold">
        How did it land?
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {REACTIONS.map(({ value, label, icon: Icon }) => {
          const on = item.reaction === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onReact(item, value)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-2 text-base font-bold outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              <Icon aria-hidden="true" className="size-6" />
              {label}
            </button>
          );
        })}
      </div>
      {item.reaction === "distressed" && (
        <p className="rounded-xl border border-warning p-3 text-base">
          It&apos;s fine to stop or move on. Memory Lane won&apos;t suggest this one again.
        </p>
      )}
      <details className="rounded-xl border p-3">
        <summary className="min-h-10 cursor-pointer text-base font-bold">
          Add a note (optional)
        </summary>
        <div className="mt-3 space-y-2">
          <label htmlFor={`note-${item.id}`} className="block text-base">
            A few words for next time, like what they said or did. Stays in Memory Lane.
          </label>
          <Textarea
            id={`note-${item.id}`}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
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
