"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { useAfter } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * "Try it yourself" on a demo persona: a private copy on this device, as it was before session 1, so
 * a visitor can log how each item lands and watch Memory Lane plan the next session with Qloo. An
 * outline button: the screens it sits on already have their own primary action (ux review W5).
 */
export function TryDemo({ profileId, name }: { profileId: string; name: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slow = useAfter(busy);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api.tryDemo(profileId);
    if (r.ok) {
      router.push(`/sessions/${r.data.session.id}`);
      return;
    }
    setBusy(false);
    setError(r.message);
  }

  return (
    <section
      aria-labelledby="try-heading"
      className="no-print space-y-3 rounded-2xl border-2 border-evidence bg-card p-5"
    >
      <h2 id="try-heading" className="flex items-center gap-2 text-xl font-bold">
        <FlaskConical aria-hidden="true" className="size-6 shrink-0 text-evidence" />
        Try the learning yourself
      </h2>
      <p className="text-base">
        Make a private copy of {name ? `${name}’s profile` : "this profile"} on this device, as it
        was before session 1. Play session 1, tap how each item lands, then plan session 2: Memory
        Lane asks Qloo live and shows what it changed. The demo stays as it is.
      </p>
      <Button
        variant="outline"
        className="h-auto min-h-12 w-full border-2 border-primary px-6 py-3 text-base whitespace-normal sm:w-auto"
        disabled={busy}
        focusableWhenDisabled
        onClick={start}
      >
        {busy ? "Making your copy…" : "Make my copy and start session 1"}
      </Button>
      <p role="status" className="text-base text-muted-foreground empty:hidden">
        {slow ? "Copying the profile and its Qloo records…" : ""}
      </p>
      {error && (
        <p role="alert" className="text-base font-bold text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
