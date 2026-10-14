"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * "Try it yourself" on a demo persona: a private copy on this device, before any session, so a
 * visitor can log how each item lands and watch Memory Lane plan the next session with Qloo.
 */
export function TryDemo({ profileId, name }: { profileId: string; name: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api.tryDemo(profileId);
    if (r.ok) {
      router.push(`/sessions/${r.data.session.id}`);
      return;
    }
    setBusy(false);
    setError(
      r.code === "profile_limit"
        ? "This device has too many profiles to make a copy. Delete one first."
        : r.message,
    );
  }

  return (
    <section
      aria-labelledby="try-heading"
      className="no-print space-y-3 rounded-2xl border-2 border-evidence bg-card p-5"
    >
      <h2 id="try-heading" className="flex items-center gap-2 text-xl font-bold">
        <FlaskConical aria-hidden="true" className="size-6 text-evidence" />
        Try the learning yourself
      </h2>
      <p className="text-base">
        Make a private copy of {name ?? "this profile"} on this device, before any session. Play
        session 1, tap how each item lands, then plan session 2: Memory Lane asks Qloo live and
        shows what it changed. The demo stays as it is.
      </p>
      <Button
        className="h-auto min-h-12 w-full whitespace-normal px-6 py-3 text-base sm:w-auto"
        disabled={busy}
        focusableWhenDisabled
        onClick={start}
      >
        {busy ? "Making your copy…" : "Make my copy and start session 1"}
      </Button>
      {error && (
        <p role="alert" className="text-base font-bold text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
