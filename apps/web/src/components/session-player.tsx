"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, ExternalLink, MapPin, Play, TriangleAlert, WifiOff } from "lucide-react";
import type { Reaction, Session, SessionItem } from "@memory-lane/shared";
import { DemoBanner } from "@/components/demo-banner";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { Loading } from "@/components/loading";
import { QlooImage } from "@/components/qloo-image";
import { TryDemo } from "@/components/try-demo";
import { KIND_ICONS, REACTIONS, isFavouriteItem, slotLabel } from "@/components/session-labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type ApiFailureKind } from "@/lib/api";

// The picture's frame: a share of the screen's height (not rem, which grows with text), within limits.
// Wide screens: the picture is the left column's whole height, staying in view while the prompts scroll.
const PLAYER_FRAME =
  "h-[clamp(140px,24svh,320px)] w-full rounded-xl lg:sticky lg:top-6 lg:h-[min(70svh,36rem)] lg:self-start";

const bigLink =
  "inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-primary px-4 py-3 text-center text-lg font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto sm:px-6";
const textLink =
  "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4";

type Status = { text: string; error?: boolean };
/** What the caregiver last asked to keep for an item; `note` only while a note change is unsaved. */
type Wanted = { value: Reaction | null; note?: string };

const UPSET_DEMO =
  "Noted for this visit. In your own profile, Memory Lane wouldn't suggest this one again.";

/**
 * Screen 7 (docs/06): the session player. One item at a time, large type, one-handed: play it, talk
 * if it feels right, tap how it landed, move on. Saves for an item go one at a time, each carrying
 * everything still wanted for it (reaction and any unsaved note), so a tap never erases a note and
 * the server can't apply them out of order. A failed save stays listed until it goes through.
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
  const [unsaved, setUnsaved] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [ended, setEnded] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const endRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const stepRef = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const wanted = useRef(new Map<string, Wanted>());
  const latest = useRef(new Map<string, number>());
  const chains = useRef(new Map<string, Promise<unknown>>());
  const pending = useRef(new Set<Promise<unknown>>());
  // Note drafts as typed, so moving on or finishing saves them too (ux review C1).
  const drafts = useRef(new Map<string, string>());

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

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }, []);

  const updateItem = useCallback((next: SessionItem) => {
    setSession((s) => (s ? { ...s, items: s.items.map((i) => (i.id === next.id ? next : i)) } : s));
  }, []);

  const itemById = useCallback(
    (itemId: string) => sessionRef.current?.items.find((i) => i.id === itemId),
    [],
  );
  const isCurrent = useCallback(
    (itemId: string) => sessionRef.current?.items[stepRef.current]?.id === itemId,
    [],
  );

  /**
   * Queues a save for an item: one request at a time per item, and only the newest queued one is
   * sent, carrying the merged wanted state. Resolves true when that state is stored.
   */
  const save = useCallback(
    (itemId: string, change: Partial<Wanted>): Promise<boolean> => {
      const current = itemById(itemId);
      const before = wanted.current.get(itemId) ?? { value: current?.reaction ?? null };
      wanted.current.set(itemId, { ...before, ...change });
      const seq = (latest.current.get(itemId) ?? 0) + 1;
      latest.current.set(itemId, seq);
      const run = (chains.current.get(itemId) ?? Promise.resolve()).then(async () => {
        if (latest.current.get(itemId) !== seq) return null; // a newer save carries it
        const want = wanted.current.get(itemId) ?? { value: null };
        const r = await api.react(itemId, want.value, want.note);
        return { r, want };
      });
      const done = run.then((out) => {
        if (!out) return true;
        const { r, want } = out;
        const name = itemById(itemId)?.name ?? "this item";
        if (r.ok) {
          // Stored: keep what was asked unless a newer change came in meanwhile.
          if (wanted.current.get(itemId) === want)
            wanted.current.set(itemId, { value: want.value });
          if (latest.current.get(itemId) === seq) updateItem(r.data.item);
          setUnsaved((u) => {
            const rest = { ...u };
            delete rest[itemId];
            return rest;
          });
          return true;
        }
        setUnsaved((u) => ({ ...u, [itemId]: name }));
        if (r.code === "invalid_note") {
          // A note the agent refused is dropped from what's wanted; the reaction still saves.
          wanted.current.set(itemId, { value: want.value });
          setStatus({ text: `Note not saved for “${name}”: ${r.message}`, error: true });
        } else {
          setStatus({ text: `Not saved for “${name}”: ${r.message}`, error: true });
        }
        return false;
      });
      chains.current.set(
        itemId,
        done.catch(() => false),
      );
      pending.current.add(done);
      void done.finally(() => pending.current.delete(done));
      return done;
    },
    [updateItem, itemById],
  );

  /** Tries every save that failed, with what is still wanted for each. */
  const retryUnsaved = useCallback(() => {
    for (const itemId of Object.keys(unsaved)) {
      void save(itemId, {}).then((ok) => {
        if (ok && isCurrent(itemId)) setStatus({ text: "Saved." });
      });
    }
  }, [unsaved, save, isCurrent]);

  // Back online: try the load again, or every save that failed. Offline: say so.
  useEffect(() => {
    const online = () => {
      setOffline(false);
      if (loadError) retryLoad();
      else retryUnsaved();
    };
    const gone = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", gone);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", gone);
    };
  }, [loadError, retryLoad, retryUnsaved]);

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

  function react(target: SessionItem, value: Reaction) {
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
    // An unsaved note draft goes with the reaction, so neither overwrites the other.
    const draft = drafts.current.get(target.id);
    const noteChange =
      draft !== undefined && draft.trim() !== (target.note ?? "") ? { note: draft.trim() } : {};
    void save(target.id, { value: next, ...noteChange }).then((ok) => {
      if (ok && isCurrent(target.id)) {
        setStatus({ text: !next ? "Cleared." : "Saved. Tap it again to undo." });
      }
    });
  }

  function saveNote(target: SessionItem, note: string) {
    const text = note.trim();
    const want = wanted.current.get(target.id);
    const known = want?.note !== undefined ? want.note : (target.note ?? "");
    if (known === text) return; // nothing new (blur, then the button)
    if (readOnly) {
      updateItem({ ...target, note: text || null });
      setStatus({ text: "Noted for this visit (demo notes aren't saved)." });
      return;
    }
    setStatus({ text: "Saving the note…" });
    void save(target.id, { note: text }).then((ok) => {
      if (ok && isCurrent(target.id)) setStatus({ text: text ? "Note saved." : "Note removed." });
    });
  }

  const draftFor = useCallback((itemId: string) => drafts.current.get(itemId), []);

  /** Saves any note typed but not saved yet (moving on, finishing). */
  function flushDrafts() {
    if (readOnly || !session) return;
    for (const [itemId, draft] of drafts.current) {
      const target = session.items.find((i) => i.id === itemId);
      if (target) saveNote(target, draft);
    }
  }

  function go(to: number) {
    flushDrafts();
    setStatus({ text: "" });
    setStep(to);
  }

  async function finish(anyway = false) {
    if (readOnly) {
      setEnded(true);
      return;
    }
    flushDrafts();
    setFinishing(true);
    await Promise.allSettled([...pending.current]);
    const left = Object.keys(unsavedRef.current).length;
    if (left > 0 && !anyway) {
      setFinishing(false);
      setConfirmFinish(true);
      return;
    }
    const r = await api.completeSession(id);
    if (r.ok) {
      router.push(`/sessions/${id}/summary`);
      return;
    }
    setFinishing(false);
    setStatus({ text: `Couldn't finish: ${r.message}`, error: true });
  }

  // The latest unsaved list for finish(), which awaits saves that update it.
  const unsavedRef = useRef(unsaved);
  useEffect(() => {
    unsavedRef.current = unsaved;
  }, [unsaved]);

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
            Qloo is asked for more like what they sang along to and ranks what comes next, and
            anything that upset them never returns.
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
  const unsavedCount = Object.keys(unsaved).length;

  const statusLine = (
    <div role="status" aria-live="polite" className="min-h-6">
      {status.text && (
        <p
          className={`flex items-start gap-2 text-base ${status.error ? "font-bold text-destructive" : "text-muted-foreground"}`}
        >
          {status.error && <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
          {status.text}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {readOnly && <DemoBanner playing />}
      {offline && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-warning p-3 text-base">
          <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          You&apos;re offline. Reactions will save when you&apos;re back online.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4">
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

      {/* Phones: label, name, picture, then the rest. Wide screens with a picture: the picture on the
          left, everything else beside it (grid areas keep one DOM order for both). */}
      <article
        aria-labelledby="item-title"
        className={`grid gap-6 rounded-2xl border bg-card p-5 sm:p-8 ${
          item.image
            ? "[grid-template-areas:'label'_'title'_'pic'_'rest'] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-10 lg:[grid-template-areas:'pic_label'_'pic_title'_'pic_rest']"
            : "[grid-template-areas:'label'_'title'_'rest']"
        }`}
      >
        <p className="flex items-center gap-2 text-lg font-bold text-primary [grid-area:label]">
          <Icon aria-hidden="true" className="size-6 shrink-0" />
          {slotLabel(item, step, total)} · {item.minutes} min
        </p>
        <h1
          id="item-title"
          ref={titleRef}
          tabIndex={-1}
          className="font-heading text-4xl leading-tight break-words outline-none [grid-area:title] sm:text-5xl"
        >
          <span className="sr-only">
            Item {step + 1} of {total}:{" "}
          </span>
          {item.name}
          {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
        </h1>
        {/* Something to look at together: Qloo's photo, poster or place, whole, under the name (which
            takes focus, so it is always on screen) and sized by the screen, not the text (ux C1). A
            picture that fails keeps its frame, with the kind icon (ux W3). */}
        {item.image && (
          <QlooImage
            key={item.id}
            src={item.image}
            sizes="(min-width: 1024px) 460px, (min-width: 640px) 560px, 90vw"
            fit="contain"
            eager
            className={`${PLAYER_FRAME} [grid-area:pic]`}
            fallback={
              <span
                aria-hidden="true"
                className={`flex items-center justify-center bg-secondary text-primary [grid-area:pic] ${PLAYER_FRAME}`}
              >
                <Icon className="size-12" />
              </span>
            }
          />
        )}

        <div className="min-w-0 space-y-6 [grid-area:rest]">
          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href={item.link.url} target="_blank" rel="noopener noreferrer" className={bigLink}>
                <LinkIcon aria-hidden="true" className="size-6 shrink-0" />
                <span className="min-w-0">{item.link.label}</span>
                <ExternalLink
                  aria-hidden="true"
                  className="hidden size-5 shrink-0 opacity-80 min-[360px]:inline"
                />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {item.altLink && (
                <a
                  href={item.altLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-field-border px-4 py-3 text-center text-lg font-bold outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-6"
                >
                  <span className="min-w-0">{item.altLink.label}</span>
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
            draftFor={draftFor}
            status={statusLine}
            onReact={react}
            onDraft={(text) => drafts.current.set(item.id, text)}
            onSaveNote={saveNote}
          />
        </div>
      </article>

      <nav aria-label="Session" className="player-nav space-y-3">
        {unsavedCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base font-bold text-destructive">
            <span className="flex items-start gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {unsavedCount === 1
                ? `Not saved yet: “${Object.values(unsaved)[0]}”`
                : `${unsavedCount} reactions not saved yet`}
            </span>
            <Button variant="outline" className="h-12 px-5 text-base" onClick={retryUnsaved}>
              Try again
            </Button>
          </div>
        )}
        {confirmFinish && (
          <div className="space-y-2 rounded-xl border-2 border-warning p-3">
            <p className="text-base">
              {unsavedCount === 1 ? "One reaction isn't" : `${unsavedCount} reactions aren't`} saved
              yet. Try again, or finish without {unsavedCount === 1 ? "it" : "them"}.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="h-12 px-5 text-base"
                onClick={() => {
                  setConfirmFinish(false);
                  retryUnsaved();
                }}
              >
                Try again
              </Button>
              <Button
                className="h-12 px-5 text-base"
                onClick={() => {
                  setConfirmFinish(false);
                  void finish(true);
                }}
              >
                Finish anyway
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="h-auto min-h-14 flex-none border-2 border-field-border px-5 text-lg"
            disabled={step === 0}
            onClick={() => go(Math.max(0, step - 1))}
          >
            Back
          </Button>
          {last ? (
            <Button
              className="h-auto min-h-14 flex-[1_1_10rem] px-5 text-lg whitespace-normal"
              disabled={finishing}
              focusableWhenDisabled
              onClick={() => void finish()}
            >
              {finishing ? "Finishing…" : "Finish the session"}
            </Button>
          ) : (
            <Button
              className="h-auto min-h-14 flex-[1_1_10rem] px-5 text-lg whitespace-normal"
              onClick={() => go(Math.min(total - 1, step + 1))}
            >
              Next
            </Button>
          )}
        </div>
      </nav>
    </div>
  );
}

function Reactions({
  item,
  readOnly,
  draftFor,
  status,
  onReact,
  onDraft,
  onSaveNote,
}: {
  item: SessionItem;
  readOnly: boolean;
  /** The unsaved draft for an item, if any (read once, when the item opens). */
  draftFor: (itemId: string) => string | undefined;
  status: ReactNode;
  onReact: (item: SessionItem, value: Reaction) => void;
  onDraft: (text: string) => void;
  onSaveNote: (item: SessionItem, note: string) => void;
}) {
  const [note, setNote] = useState(() => draftFor(item.id) ?? item.note ?? "");
  // A saved note (or a draft) shows when they come back to the item (ux review W5).
  const [open, setOpen] = useState(() => !!(draftFor(item.id) ?? item.note));
  return (
    <section aria-labelledby="reaction-heading" className="space-y-3 border-t pt-5">
      <h2 id="reaction-heading" className="text-xl font-bold">
        How did it land?
      </h2>
      <div
        role="group"
        aria-labelledby="reaction-heading"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3 lg:grid-cols-4"
      >
        {REACTIONS.map(({ value, label, icon: Icon }) => {
          const on = item.reaction === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onReact(item, value)}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-2 text-center text-lg font-bold outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-xl ${
                on
                  ? "border-evidence bg-evidence/10 text-foreground"
                  : "border-field-border bg-card hover:bg-secondary"
              }`}
            >
              {on && (
                <Check
                  aria-hidden="true"
                  className="absolute top-2 right-2 size-5 rounded-full bg-evidence p-0.5 text-card"
                />
              )}
              <Icon aria-hidden="true" className={`size-6 ${on ? "text-evidence" : ""}`} />
              {label}
            </button>
          );
        })}
      </div>
      {status}
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
            onChange={(e) => {
              setNote(e.target.value);
              onDraft(e.target.value);
            }}
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
