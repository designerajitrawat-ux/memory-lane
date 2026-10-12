import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ProfileWizard } from "@/components/profile-wizard";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Create a profile · Memory Lane" };

// The form's field lists get random ids (react-hook-form uses crypto.randomUUID), so it renders per
// request rather than in the static shell (Cache Components rule for random values).
async function WizardAtRequestTime() {
  await connection();
  return <ProfileWizard />;
}

export default function NewProfilePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-10">
        <div className="space-y-3">
          <h1 className="font-heading text-4xl leading-tight">Create a profile</h1>
          <p className="text-lg text-muted-foreground">
            Four short steps, about three minutes. The nickname and the things to avoid are
            optional.
          </p>
        </div>
        <Suspense fallback={<p className="text-lg text-muted-foreground">Loading the form…</p>}>
          <WizardAtRequestTime />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
