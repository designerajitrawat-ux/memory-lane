"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CircleDashed } from "lucide-react";
import type { ProfileView } from "@memory-lane/shared";
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

const primaryLink =
  "inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-base font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
  const justSaved = useSearchParams().get("saved") === "1";
  const router = useRouter();
  const id = params.id;
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
  const anyPending = profile.seeds.some((s) => s.status === "pending");

  return (
    <div className="space-y-8">
      {justSaved && (
        <p role="status" className="rounded-xl border border-evidence p-4 text-base">
          Profile saved.
        </p>
      )}
      <div className="space-y-2">
        <h1 className="font-heading text-4xl leading-tight">{name}</h1>
        <p className="text-lg text-muted-foreground">
          Born {profile.birthYear} · {profile.languages.join(", ")}
          {profile.isDemo && " · Fictional demo profile"}
        </p>
      </div>

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
              {s.status === "pending" && (
                <span className="inline-flex items-center gap-2 text-base text-muted-foreground">
                  <span className="sr-only">. </span>
                  <CircleDashed aria-hidden="true" className="size-5" /> Not checked yet
                </span>
              )}
            </li>
          ))}
        </ul>
        {anyPending && (
          <p className="text-base text-muted-foreground">
            Checking favourites with Qloo isn&apos;t switched on yet. When it is, Memory Lane will
            look each one up and ask you to confirm the match. Nothing is guessed in the meantime.
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
        <Link href="/profiles" className={primaryLink}>
          Back to your profiles
        </Link>
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
