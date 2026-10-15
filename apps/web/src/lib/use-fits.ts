"use client";

import { useEffect, useState } from "react";

/**
 * Whether an element (plus `margin` px) fits in the window's height, kept up to date as either
 * changes. Sticky panels use it to stick only when they fit, so nothing in them is ever out of reach
 * below the fold (ux review C1/W6). Returns a callback ref, so it also works for elements that appear
 * after the first render.
 */
export function useFitsInView<T extends HTMLElement>(margin = 48) {
  const [el, setEl] = useState<T | null>(null);
  const [fits, setFits] = useState(false);
  useEffect(() => {
    if (!el) return;
    const check = () => setFits(el.offsetHeight + margin <= window.innerHeight);
    // ResizeObserver also reports once when it starts observing.
    const observer = new ResizeObserver(check);
    observer.observe(el);
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [el, margin]);
  return [setEl, fits] as const;
}
