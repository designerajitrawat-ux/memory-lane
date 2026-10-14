import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3"
      >
        <Link
          href="/"
          className="inline-flex min-h-12 items-center font-heading text-xl font-medium underline-offset-4 hover:underline"
        >
          Memory Lane
        </Link>
        <Link
          href="/profiles"
          className="inline-flex min-h-12 items-center text-base font-bold underline-offset-4 hover:underline"
        >
          Your profiles
        </Link>
      </nav>
    </header>
  );
}

const SOURCE_URL = "https://github.com/designerajitrawat-ux/memory-lane";

/** `minimal` (the session player): just the disclaimer, nothing to mis-tap under Back/Next. */
export function SiteFooter({ minimal = false }: { minimal?: boolean } = {}) {
  if (minimal) {
    return (
      <footer className="border-t px-4 py-6 text-center text-base text-muted-foreground">
        <p>
          Memory Lane supports reminiscence activities. It is not a medical device and does not
          diagnose or treat any condition.
        </p>
      </footer>
    );
  }
  return (
    <footer className="space-y-3 border-t px-4 py-6 text-center text-base text-muted-foreground">
      <nav aria-label="More" className="flex flex-wrap justify-center gap-x-6">
        <Link
          href="/demo"
          className="inline-flex min-h-12 items-center underline underline-offset-4"
        >
          Try a demo profile
        </Link>
        <Link
          href="/how-it-works"
          className="inline-flex min-h-12 items-center underline underline-offset-4"
        >
          How it works
        </Link>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center underline underline-offset-4"
        >
          Source on GitHub<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </nav>
      <p>
        Memory Lane supports reminiscence activities. It is not a medical device and does not
        diagnose or treat any condition.
      </p>
    </footer>
  );
}
