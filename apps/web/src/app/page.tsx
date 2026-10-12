import Link from "next/link";
import { SiteFooter } from "@/components/site-chrome";
import { SystemStatus } from "@/components/system-status";

const linkFocus =
  "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function Home() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-start gap-8 px-4 py-16 sm:justify-center">
        <p className="text-base font-bold text-muted-foreground">
          Memory Lane <span aria-hidden="true">·</span> in development
        </p>
        <h1 className="font-heading text-4xl leading-tight text-balance hyphens-auto sm:text-5xl">
          Reminiscence sessions, personal to them.
        </h1>
        <p className="text-lg text-muted-foreground">
          Music, films, food and places from the years that mattered to the person you care for,
          with gentle prompts to start a conversation.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/profiles/new"
            className={`inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-base font-bold text-primary-foreground ${linkFocus}`}
          >
            Create a profile
          </Link>
          <Link
            href="/profiles"
            className={`inline-flex h-12 items-center justify-center rounded-lg px-4 text-base font-bold underline underline-offset-4 ${linkFocus}`}
          >
            Your profiles
          </Link>
        </div>
        <SystemStatus />
      </main>
      <SiteFooter />
    </>
  );
}
