import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading } from "@/components/loading";
import { SessionPlayer } from "@/components/session-player";
import { SiteFooter } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Session · Memory Lane" };

// The player keeps the screen to the item itself: no site navigation, just the session (docs/06).
export default function SessionPlayerPage() {
  return (
    <>
      {/* At least a screen tall, so the footer doesn't jump down when the session arrives (CLS). */}
      <main className="mx-auto min-h-svh w-full max-w-2xl flex-1 px-4 py-6">
        <Suspense fallback={<Loading>Loading the session…</Loading>}>
          <SessionPlayer />
        </Suspense>
      </main>
      <SiteFooter minimal />
    </>
  );
}
