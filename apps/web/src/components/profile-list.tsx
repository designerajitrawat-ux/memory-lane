"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ProfileSummary } from "@memory-lane/shared";
import { Button } from "@/components/ui/button";
import { api, type ApiResult } from "@/lib/api";
import { clearOwnerToken, getOwnerToken } from "@/lib/owner-token";

const primaryLink =
  "inline-flex h-12 items-center rounded-lg bg-primary px-5 text-base font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ProfileList() {
  const justDeleted = useSearchParams().get("deleted") === "1";
  const [result, setResult] = useState<ApiResult<{ profiles: ProfileSummary[] }> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [forgotten, setForgotten] = useState(false);

  useEffect(() => {
    let active = true;
    api.listProfiles().then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  function forget() {
    clearOwnerToken();
    setForgotten(true);
    retry();
  }

  const status = justDeleted
    ? "Profile deleted."
    : forgotten
      ? "This device has forgotten your profiles."
      : null;

  return (
    <div className="space-y-6">
      {status && (
        <p role="status" className="rounded-xl border border-evidence p-4 text-base">
          {status}
        </p>
      )}
      {!result ? (
        <p role="status" className="text-lg text-muted-foreground">
          Loading your profiles…
        </p>
      ) : !result.ok ? (
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <p role="alert" className="text-lg">
            {result.message}
          </p>
          <Button className="h-12 px-5 text-base" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : result.data.profiles.length === 0 ? (
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <p className="text-lg">No profiles on this device yet.</p>
          <Link href="/profiles/new" className={primaryLink}>
            Create a profile
          </Link>
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {result.data.profiles.map((p) => (
            <li key={p.id}>
              <Link
                href={`/profiles/${p.id}`}
                className="block rounded-2xl border bg-card p-5 outline-hidden hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="block text-xl font-bold">{p.nickname ?? "Unnamed profile"}</span>
                <span className="text-base text-muted-foreground">Born {p.birthYear}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result?.ok && result.data.profiles.length > 0 && getOwnerToken() && (
        <section aria-labelledby="forget-heading" className="space-y-3 border-t pt-6">
          <h2 id="forget-heading" className="text-xl font-bold">
            Shared device?
          </h2>
          <p className="text-base text-muted-foreground">
            &ldquo;Forget&rdquo; removes the link between this browser and these profiles, so the
            next person can&apos;t open them here. The profiles themselves are deleted automatically
            after 90 days without a visit.
          </p>
          <Button variant="outline" className="h-12 px-5 text-base" onClick={forget}>
            Forget profiles on this device
          </Button>
        </section>
      )}
    </div>
  );
}
