import Link from "next/link";
import { HeartHandshake, ListChecks, Music, ShieldCheck } from "lucide-react";
import { DemoGlimpse } from "@/components/demo-glimpse";
import { SessionPeek } from "@/components/session-peek";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SystemStatus } from "@/components/system-status";

const linkFocus =
  "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const STEPS = [
  {
    icon: ListChecks,
    title: "Add a few favourites",
    text: "A singer, a film, a dish, a place. No personal details: a nickname at most, and it never leaves Memory Lane.",
  },
  {
    icon: ShieldCheck,
    title: "Qloo builds their Life Taste Profile",
    text: "Memory Lane checks each favourite with Qloo, then finds music, films and TV, food and places from the years they grew up in. Every item shows its evidence.",
  },
  {
    icon: Music,
    title: "Share a 25-minute session",
    text: "Six things to listen to, watch or talk about, with gentle prompts. Note how each one landed, and the next session adapts.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 py-8 sm:py-14">
        {/* Phones: one column. Wide screens: the words on the left, Qloo's pictures on the right. */}
        <section
          aria-labelledby="hero-heading"
          className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-center lg:gap-12"
        >
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 text-base font-bold text-primary">
              <HeartHandshake aria-hidden="true" className="size-5" />
              For families and carers
            </p>
            <h1
              id="hero-heading"
              className="font-heading text-4xl leading-tight text-balance hyphens-auto sm:text-5xl lg:text-6xl"
            >
              Reminiscence sessions, personal to them.
            </h1>
            <p className="text-lg text-muted-foreground">
              Music, films, food and places from the years that mattered to the person you care for,
              with gentle things to talk about. Every suggestion is grounded in Qloo&apos;s cultural
              taste graph, with the evidence one tap away.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/demo"
                className={`inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-6 py-3 text-center text-base font-bold text-primary-foreground ${linkFocus}`}
              >
                <span className="flex flex-wrap items-baseline justify-center gap-x-2">
                  <span>Try a demo profile</span>
                  <span className="font-normal opacity-90">no sign-up</span>
                </span>
              </Link>
              <Link
                href="/profiles/new"
                className={`inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-primary px-6 py-3 text-center text-base font-bold hover:bg-secondary ${linkFocus}`}
              >
                Create a profile
              </Link>
              <Link
                href="/how-it-works"
                className={`inline-flex min-h-12 items-center justify-center px-4 text-base font-bold underline underline-offset-4 ${linkFocus}`}
              >
                How it works
              </Link>
            </div>
          </div>
          <DemoGlimpse />
        </section>

        <SessionPeek />

        <section aria-labelledby="steps-heading" className="space-y-4">
          <h2 id="steps-heading" className="text-xl font-bold">
            Three steps
          </h2>
          <ol role="list" className="grid gap-3 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4 rounded-2xl border bg-card p-4 md:flex-col">
                <span
                  aria-hidden="true"
                  className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary min-[24rem]:flex"
                >
                  <Icon className="size-6" />
                </span>
                <span className="min-w-0 space-y-1">
                  <span className="block font-heading text-xl leading-snug">
                    <span className="sr-only">Step {i + 1}: </span>
                    {title}
                  </span>
                  <span className="block text-base text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="w-full max-w-2xl">
          <SystemStatus />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
