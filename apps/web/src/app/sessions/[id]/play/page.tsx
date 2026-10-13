import { Suspense } from "react";
import type { Metadata } from "next";
import { SessionPlayer } from "@/components/session-player";
import { SiteFooter } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Session · Memory Lane" };

// The player keeps the screen to the item itself: no site navigation, just the session (docs/06).
export default function SessionPlayerPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Suspense fallback={<p className="text-lg text-muted-foreground">Loading the session…</p>}>
          <SessionPlayer />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
