import type { Metadata } from "next";
import Link from "next/link";
import {
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  ListMusic,
  ListChecks,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = { title: "How it works · Memory Lane" };

const FLOW: { icon: LucideIcon; title: string; who: string; text: string }[] = [
  {
    icon: ListChecks,
    title: "Before · Favourites",
    who: "The caregiver",
    text: "A few public favourites: a singer, a film, a dish, a place. Plus where they grew up (town level) and anything to avoid.",
  },
  {
    icon: CheckCircle2,
    title: "1 · Match them in Qloo",
    who: "Qloo decides, the caregiver confirms",
    text: "qloo_describe for singers, films, TV and places; qloo_find_tags for dishes and interests. When there are several matches, the caregiver picks one. Nothing unconfirmed is ever used.",
  },
  {
    icon: Sparkles,
    title: "2 · Build the Life Taste Profile",
    who: "Qloo recommends, code checks",
    text: "qloo_recommend from the confirmed favourites' Qloo IDs, each domain from its own favourites; places near where they grew up; dishes from Qloo's food tags. When too few films fit their years, it asks Qloo again from the ones that do. Code keeps it to their era, lasting places and real dishes, leaves out the avoid-list and painful subjects, and logs every step, including what it left out.",
  },
  {
    icon: ListMusic,
    title: "3 · Plan a session",
    who: "Code composes from the profile only",
    text: "Six items for about 25 minutes: an opening song, a film or TV memory, food, a place, a choice, a closing song. Gentle prompts that invite, never test. Links to YouTube, Spotify or a map, built in code.",
  },
  {
    icon: RefreshCcw,
    title: "4 · Learn from how it landed",
    who: "Qloo again, from the reactions",
    text: "qloo_recommend finds more like what they sang along to, and qloo_rank orders everything still to play against it, so Qloo decides what comes first next time. Anything that upset them never returns and joins the avoid-list. The next plan says what changed, and each item shows the calls behind it.",
  },
];

const RULES = [
  "Every item carries the ID of the Qloo call it came from; the evidence drawer shows that record.",
  "Validators run before anything is shown: Qloo evidence, the avoid-list, wording that talks about groups (never about the person), prompts that aren't memory tests, and only allowed links.",
  "When Qloo can't answer (no key, quota, outage), the app says so. It never fills the gap with made-up items.",
];

const PRIVACY = [
  "Nothing personal reaches Qloo: a guard in front of every call refuses nicknames, contact details, addresses and health terms.",
  "Places stay at town level. Favourites are public cultural names. The nickname stays in Memory Lane.",
  'No login: profiles live on the device that made them. "Delete this profile" removes the profile, its sessions and its Qloo call records; Qloo answers shared by everyone stay cached for up to 8 days. Idle profiles go after 90 days.',
];

const LIMITS = [
  "Qloo describes what groups of people tend to enjoy, not what one person will like or remember.",
  "Qloo has no year filter. Memory Lane keeps films and TV to the right years in code, and orders singers by the decades Qloo's descriptions mention; it isn't perfect.",
  "Dishes are tags in Qloo, not things with a year or place, so food is lighter than music.",
  "Most places Qloo knows near a town today are new; only lasting landmarks are kept, so some towns get few places.",
  "Reminiscence is an activity, not medical care. Memory Lane makes no medical claims.",
];

const RESEARCH = [
  {
    href: "https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001120.pub3/information",
    text: "Cochrane review (Woods et al., 2018): reminiscence therapy has small positive effects on quality of life and communication.",
  },
  {
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8132012/",
    text: "Reminiscence is delivered inconsistently, without a shared model: a structured session format helps.",
  },
  {
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3782173",
    text: "Gerdner's protocol for individualised music: choose music from the person's own past.",
  },
  {
    href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9256757/",
    text: "Mixed evidence, honestly: a large trial found personalised music did not reduce agitation.",
  },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-2xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-12 px-4 py-10">
        <div className="space-y-3">
          <h1 className="font-heading text-4xl leading-tight">How Memory Lane works</h1>
          <p className="text-lg text-muted-foreground">
            An agent that prepares reminiscence sessions, where{" "}
            <strong className="font-bold text-foreground">Qloo decides what culturally fits</strong>{" "}
            and code checks every item before it is shown.
          </p>
        </div>

        <Section id="flow-heading" title="From favourites to a session">
          <ol role="list" className="relative space-y-4 border-l-2 border-primary/40 pl-6">
            {FLOW.map(({ icon: Icon, title, who, text }) => (
              <li key={title} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-1 -left-[2.35rem] flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <Icon className="size-4" />
                </span>
                <div className="space-y-1 rounded-2xl border bg-card p-4">
                  <h3 className="font-heading text-xl leading-snug">{title}</h3>
                  <p className="text-base font-bold text-evidence">{who}</p>
                  <p className="text-base">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="rules-heading" title="Grounded, every time">
          <ul role="list" className="space-y-2">
            {RULES.map((r) => (
              <li key={r} className="flex gap-3 text-base">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-evidence" />
                {r}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="ai-heading" title="Where the AI fits">
          <p className="flex gap-3 text-base">
            <BrainCircuit aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              The design is &ldquo;the AI proposes, Qloo decides, code verifies&rdquo;. When Qloo
              leaves a gap (say, no TV from their years), a language model suggests era-typical
              names, and they count only once Qloo has matched and ranked them and their years fit.
              The model also writes warmer prompts for items already in a session, and each one
              passes the same checks as the templates. Without an AI key the app runs on Qloo and
              code alone. The &ldquo;Generic AI vs Memory Lane&rdquo; page on every profile shows
              the same model asked without Qloo, and what code finds wrong with its plan.
            </span>
          </p>
        </Section>

        <Section id="privacy-heading" title="Privacy and safety">
          <ul role="list" className="list-disc space-y-2 pl-5 text-base">
            {PRIVACY.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Section>

        <Section id="limits-heading" title="What it doesn't do">
          <ul role="list" className="list-disc space-y-2 pl-5 text-base">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Section>

        <Section id="research-heading" title="Why reminiscence and music">
          <ul role="list" className="space-y-2 text-base">
            {RESEARCH.map((r) => (
              <li key={r.href}>
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {r.text}
                  <ExternalLink
                    aria-hidden="true"
                    className="ml-1 inline size-4 align-baseline text-muted-foreground"
                  />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/demo"
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-bold text-primary-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Try a demo profile
          </Link>
          <Link
            href="/profiles/new"
            className="inline-flex min-h-12 items-center text-base font-bold underline underline-offset-4"
          >
            Create a profile
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
