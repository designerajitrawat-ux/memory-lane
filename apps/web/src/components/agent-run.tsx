import type { Ref } from "react";
import Link from "next/link";

/** The agent's live steps (docs/06 §1.5: the agent is visible while it works). */
export function AgentLog({
  lines,
  label = "What Memory Lane is doing",
}: {
  lines: string[];
  label?: string;
}) {
  return (
    <div role="log" aria-label={label} className="rounded-xl border bg-card p-4 text-base">
      <ol className="space-y-1">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * An honest stop (no key, quota, outage). Focused when shown, so it is read once on focus and is not
 * also a live region (ux-reviewer W3).
 */
export function ProblemBanner({
  message,
  ref,
  offerDemo = false,
}: {
  message: string;
  ref?: Ref<HTMLDivElement>;
  /** When Qloo can't answer here (no key, quota), the demo personas still work (docs/06 §4). */
  offerDemo?: boolean;
}) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="space-y-2 rounded-xl border border-destructive p-4 text-base outline-none"
    >
      <p>
        <span className="sr-only">Problem: </span>
        {message}
      </p>
      {offerDemo && (
        <p>
          Meanwhile, the demo profiles already have everything built.{" "}
          <Link href="/demo" className="font-bold underline underline-offset-4">
            Try a demo profile
          </Link>
        </p>
      )}
    </div>
  );
}
