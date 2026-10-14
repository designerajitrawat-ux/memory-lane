"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, CircleDashed, CircleHelp, CircleSlash } from "lucide-react";
import type { ProfileView } from "@memory-lane/shared";
import { DemoBanner } from "@/components/demo-banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, type ApiResult } from "@/lib/api";

type Loaded = ApiResult<{ profile: ProfileView; isOwner: boolean }>;

const DOMAIN_LABELS: Record<string, string> = {
  music: "Music",
  film: "Film",
  tv: "TV",
  food: "Food",
  place: "Place",
  other: "Other",
};

const STATUS_CHIP: Record<
  ProfileView["seeds"][number]["status"],
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  pending: { label: "Not checked yet", icon: CircleDashed, className: "text-muted-foreground" },
  needs_input: { label: "Choose a match", icon: CircleHelp, className: "text-warning" },
  confirmed: { label: "Confirmed with Qloo", icon: CircleCheck, className: "text-evidence" },
  unresolved: { label: "Not found in Qloo", icon: CircleSlash, className: "text-muted-foreground" },
  rejected: { label: "Not used", icon: CircleSlash, className: "text-muted-foreground" },
};

const NOT_SENT_CHIP = {
  label: "Not sent to Qloo",
  icon: CircleSlash,
  className: "text-muted-foreground",
};

const secondaryLink =
  "inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-primary px-6 py-2 text-base font-bold outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const primaryLink =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-6 py-2 text-base font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Years({ from, to }: { from: number; to: number }) {
  return (
    <span className="text-muted-foreground">
      {" "}
      · {from}
      <span aria-hidden="true">–</span>
      <span className="sr-only"> to </span>
      {to}
    </span>
  );
}

export function ProfileDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = params.id;
  // The query stays in the URL: Next keeps visited routes alive, and replacing it would bring back the
  // profile as it was before the save.
  const flash =
    search.get("confirmed") === "1" ? "confirmed" : search.get("saved") === "1" ? "saved" : null;
  const flashRef = useRef<HTMLParagraphElement>(null);
  const [result, setResult] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getProfile(id).then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  const loaded = result?.ok === true;
  useEffect(() => {
    if (!flash || !loaded) return;
    flashRef.current?.focus(); // the page changed under the person: say what happened
  }, [flash, loaded]);

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    const r = await api.deleteProfile(id);
    if (r.ok) {
      router.push("/profiles?deleted=1");
      return;
    }
    setDeleting(false);
    setDeleteError(r.message);
  }

  if (!result) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-4xl leading-tight">Profile</h1>
        <p role="status" className="text-lg text-muted-foreground">
          Loading the profile…
        </p>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-4xl leading-tight">Profile</h1>
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <p role="alert" className="text-lg">
            {result.message}
          </p>
          {result.kind === "not_found" ? (
            <p className="text-base text-muted-foreground">
              Profiles are remembered on the device that created them. If you made it on another
              phone or browser, open it there.
            </p>
          ) : (
            <Button className="h-12 px-5 text-base" onClick={retry}>
              Try again
            </Button>
          )}
          <Link
            href="/profiles"
            className="block py-3 text-base font-bold underline underline-offset-4"
          >
            Back to your profiles
          </Link>
        </div>
      </div>
    );
  }

  const { profile, isOwner } = result.data;
  const name = profile.nickname ?? "Unnamed profile";
  const toCheck = profile.seeds.filter((s) => s.status === "pending").length;
  const toChoose = profile.seeds.filter((s) => s.status === "needs_input").length;
  const confirmed = profile.seeds.filter((s) => s.status === "confirmed").length;
  const nothingMatched = isOwner && toCheck === 0 && toChoose === 0 && confirmed === 0;
  // One confirmed favourite is enough to build from; the rest can be checked later.
  const readyForProfile = (isOwner || profile.isDemo) && confirmed > 0 && toChoose === 0;
  const hasNextStep = isOwner && (toCheck > 0 || toChoose > 0 || confirmed > 0);

  return (
    <div className="space-y-8">
      {flash && (
        <p
          ref={flashRef}
          tabIndex={-1}
          className="rounded-xl border border-evidence p-4 text-base outline-none"
        >
          {flash === "confirmed" ? "Choices saved." : "Profile saved."}
          {flash === "confirmed" &&
            toChoose > 0 &&
            ` ${toChoose} favourite${toChoose === 1 ? " still needs" : "s still need"} a choice.`}
        </p>
      )}
      <div className="space-y-2">
        <h1 className="font-heading text-4xl leading-tight">{name}</h1>
        <p className="text-lg text-muted-foreground">
          Born {profile.birthYear} · {profile.languages.join(", ")}
          {profile.isDemo && " · Fictional demo profile"}
        </p>
      </div>
      {profile.isDemo && !isOwner && <DemoBanner />}

      <section aria-labelledby="favourites-heading" className="space-y-3">
        <h2 id="favourites-heading" className="text-xl font-bold">
          Favourites
        </h2>
        <ul role="list" className="space-y-2">
          {profile.seeds.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4"
            >
              <span className="text-lg">
                <span className="text-muted-foreground">
                  {DOMAIN_LABELS[s.domain] ?? s.domain}:{" "}
                </span>
                {s.displayName ?? s.rawText}
              </span>
              <StatusChip status={s.status} note={s.note} />
            </li>
          ))}
        </ul>
        {isOwner && (toCheck > 0 || toChoose > 0) && (
          <div className="space-y-3">
            <p className="text-base text-muted-foreground">
              {toChoose > 0
                ? "Qloo found possible matches. Please choose the right ones."
                : "Next, Memory Lane looks each favourite up in Qloo and asks you to confirm the match. Nothing is guessed."}
            </p>
            <Link
              href={`/profiles/${profile.id}/confirm`}
              // With the profile ready to open, this is the second action, not the first.
              className={readyForProfile ? secondaryLink : primaryLink}
            >
              {toChoose > 0 ? "Choose matches" : "Check favourites with Qloo"}
            </Link>
          </div>
        )}
        {readyForProfile && (
          <div className="space-y-3">
            <p className="text-base text-muted-foreground">
              Their Life Taste Profile is built with Qloo from the confirmed favourites: music,
              films and TV, food and places from their years.
            </p>
            <Link href={`/profiles/${profile.id}/taste`} className={primaryLink}>
              Open the Life Taste Profile
            </Link>
          </div>
        )}
        {nothingMatched && profile.seeds.length > 0 && (
          <p className="text-base text-muted-foreground">
            None of the favourites were matched in Qloo, so there&apos;s nothing to plan from yet.
          </p>
        )}
      </section>

      <section aria-labelledby="places-heading" className="space-y-3">
        <h2 id="places-heading" className="text-xl font-bold">
          Places
        </h2>
        <ul role="list" className="space-y-2">
          {profile.lifeStages.map((s, i) => (
            <li key={i} className="rounded-xl border bg-card p-4 text-lg">
              {s.region}
              <Years from={s.fromYear} to={s.toYear} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="avoid-heading" className="space-y-3">
        <h2 id="avoid-heading" className="text-xl font-bold">
          Things to avoid
        </h2>
        {profile.avoid.length === 0 ? (
          <p className="text-base text-muted-foreground">Nothing added.</p>
        ) : (
          <ul role="list" className="space-y-2">
            {profile.avoid.map((a) => (
              <li key={a.id} className="rounded-xl border bg-card p-4">
                <p className="text-lg">{a.text}</p>
                {a.reason && <p className="text-base text-muted-foreground">{a.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        {profile.isDemo && !isOwner ? (
          <Link
            href="/demo"
            className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
          >
            Back to the demo profiles
          </Link>
        ) : (
          <Link
            href="/profiles"
            className={
              hasNextStep
                ? "inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
                : primaryLink
            }
          >
            Back to your profiles
          </Link>
        )}
      </div>

      {isOwner && (
        <section aria-labelledby="delete-heading" className="space-y-3 border-t pt-6">
          <h2 id="delete-heading" className="text-xl font-bold">
            Delete this profile
          </h2>
          <p className="text-base text-muted-foreground">
            Removes the profile, its favourites and its avoid-list from Memory Lane.
          </p>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (deleting) return; // stay open while deleting
              setDialogOpen(open);
              if (open) setDeleteError(null);
            }}
          >
            <DialogTrigger
              render={<Button variant="destructive" className="h-12 px-5 text-base" />}
            >
              Delete profile
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this profile?</DialogTitle>
                <DialogDescription>
                  This removes {profile.nickname ? `${profile.nickname}'s` : "the"} profile, its
                  favourites and its avoid-list. It can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              {deleteError && (
                <p role="alert" className="text-base font-bold text-destructive">
                  {deleteError}
                </p>
              )}
              <DialogFooter>
                <Button
                  variant="destructive"
                  className="h-12 px-5 text-base"
                  disabled={deleting}
                  focusableWhenDisabled
                  onClick={confirmDelete}
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </Button>
                <DialogClose
                  disabled={deleting}
                  render={<Button variant="outline" className="h-12 px-5 text-base" />}
                >
                  Keep it
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      )}
    </div>
  );
}

function StatusChip({ status, note }: Pick<ProfileView["seeds"][number], "status" | "note">) {
  const chip =
    status === "unresolved" && note === "personal_info" ? NOT_SENT_CHIP : STATUS_CHIP[status];
  const Icon = chip.icon;
  return (
    <span className={`inline-flex items-center gap-2 text-base ${chip.className}`}>
      <span className="sr-only">. </span>
      <Icon aria-hidden="true" className="size-5" /> {chip.label}
    </span>
  );
}
