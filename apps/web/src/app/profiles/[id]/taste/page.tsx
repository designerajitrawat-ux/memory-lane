import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { TasteProfileView } from "@/components/taste-profile";

export const metadata: Metadata = { title: "Life Taste Profile · Memory Lane" };

export default function TastePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
        <h1 className="font-heading text-4xl leading-tight">Life Taste Profile</h1>
        <Suspense
          fallback={
            <p role="status" className="text-lg text-muted-foreground">
              Loading the profile…
            </p>
          }
        >
          <TasteProfileView />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
