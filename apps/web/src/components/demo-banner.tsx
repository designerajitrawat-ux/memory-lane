import Link from "next/link";

/** Shown on public demo personas: what they are, and the way to make your own. */
export function DemoBanner({ playing = false }: { playing?: boolean }) {
  return (
    <p className="rounded-2xl border-2 border-accent-foreground/30 bg-accent p-4 text-base text-accent-foreground">
      {/* Short in the player, where the item's name, picture and link need the screen (ux S7). */}
      <span className="font-bold">
        {playing ? "A fictional demo:" : "A fictional demo profile."}
      </span>{" "}
      {playing
        ? "reactions aren't saved."
        : "Everything here was found with Qloo for real; look around, nothing can be changed."}{" "}
      <Link href="/profiles/new" className="font-bold underline underline-offset-4">
        Create your own
      </Link>
    </p>
  );
}
