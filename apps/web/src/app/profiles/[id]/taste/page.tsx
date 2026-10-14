import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading } from "@/components/loading";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { TasteProfileView } from "@/components/taste-profile";

export const metadata: Metadata = { title: "Life Taste Profile · Memory Lane" };

// The heading is drawn by the view, so it can name whose profile it is.
export default function TastePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
        <Suspense fallback={<Loading>Loading the profile…</Loading>}>
          <TasteProfileView />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
