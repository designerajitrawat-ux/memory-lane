import type { Metadata } from "next";
import Link from "next/link";
import { DemoPicker } from "@/components/demo-picker";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Try a demo profile · Memory Lane" };

export default function DemoPage() {
  return (
    <>
      <SiteHeader wide />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-10">
        <div className="max-w-3xl space-y-2">
          <h1 className="font-heading text-4xl leading-tight">Try a demo profile</h1>
          <p className="text-lg text-muted-foreground">
            Three <strong className="font-bold text-foreground">fictional</strong> people from three
            countries, already worked through with Qloo: their Life Taste Profile, a first session
            with reactions, and a second session that learned from them. Look around; nothing here
            can be changed.
          </p>
        </div>
        <DemoPicker />
        <p className="text-base text-muted-foreground">
          Ready to make one for someone you care for?{" "}
          <Link
            href="/profiles/new"
            className="font-bold text-foreground underline underline-offset-4"
          >
            Create a profile
          </Link>
          . It takes about three minutes.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
