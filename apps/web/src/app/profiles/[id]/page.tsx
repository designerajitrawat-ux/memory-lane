import { Suspense } from "react";
import type { Metadata } from "next";
import { ProfileDetail } from "@/components/profile-detail";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Profile · Memory Lane" };

export default function ProfilePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        {/* The id is runtime data; keep it behind Suspense so the shell stays static. */}
        <Suspense fallback={<p className="text-lg text-muted-foreground">Loading the profile…</p>}>
          <ProfileDetail />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
