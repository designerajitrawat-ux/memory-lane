import { Suspense } from "react";
import type { Metadata } from "next";
import { SeedConfirm } from "@/components/seed-confirm";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Confirm matches · Memory Lane" };

export default function ConfirmPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
        <h1 className="font-heading text-4xl leading-tight">Confirm matches</h1>
        <Suspense fallback={<p className="text-lg text-muted-foreground">Loading favourites…</p>}>
          <SeedConfirm />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
