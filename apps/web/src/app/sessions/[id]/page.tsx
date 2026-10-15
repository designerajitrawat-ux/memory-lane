import { Suspense } from "react";
import type { Metadata } from "next";
import { SessionPlan } from "@/components/session-plan";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Session plan · Memory Lane" };

export default function SessionPlanPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 lg:max-w-5xl">
        <Suspense fallback={<p className="text-lg text-muted-foreground">Loading the session…</p>}>
          <SessionPlan />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
