import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProfileList } from "@/components/profile-list";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Your profiles · Memory Lane" };

export default function ProfilesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-heading text-4xl leading-tight">Your profiles</h1>
          <Link
            href="/profiles/new"
            className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
          >
            Create a profile
          </Link>
        </div>
        <p className="text-base text-muted-foreground">
          Profiles are remembered on this device. There is no account or password.
        </p>
        {/* Reads ?deleted=1, which is request data: keep it behind Suspense. */}
        <Suspense
          fallback={<p className="text-lg text-muted-foreground">Loading your profiles…</p>}
        >
          <ProfileList />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
