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

export function SiteFooter() {
  return (
    <footer className="border-t px-4 py-6 text-center text-base text-muted-foreground">
      Memory Lane supports reminiscence activities. It is not a medical device and does not diagnose
      or treat any condition.
    </footer>
  );
}
