"use client";

import { useEffect, useState } from "react";

const SLOW_MS = 6_000;

/**
 * A loading line that explains a slow start (the free host sleeps when quiet; ux review W17). The
 * request itself times out after 25 s and the page then offers a retry.
 */
export function Loading({ children }: { children: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p role="status" className="text-lg text-muted-foreground">
      {children}
      {slow && (
        <span className="mt-1 block text-base">
          Still loading: Memory Lane can take a few seconds to wake up after a quiet spell.
        </span>
      )}
    </p>
  );
}
