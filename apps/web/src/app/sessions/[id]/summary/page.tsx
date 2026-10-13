import { Suspense } from "react";
import type { Metadata } from "next";
import { SessionSummary } from "@/components/session-summary";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "How the session went · Memory Lane" };

export default function SessionSummaryPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <Suspense fallback={<p className="text-lg text-muted-foreground">Loading…</p>}>
          <SessionSummary />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
