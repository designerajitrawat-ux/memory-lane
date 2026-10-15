import { Suspense } from "react";
import type { Metadata } from "next";
import { CompareView } from "@/components/compare-view";
import { Loading } from "@/components/loading";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Generic AI vs Memory Lane · Memory Lane" };

export default function ComparePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-10">
        <h1 className="font-heading text-4xl leading-tight">Generic AI vs Memory Lane</h1>
        <Suspense fallback={<Loading>Loading the comparison…</Loading>}>
          <CompareView />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
