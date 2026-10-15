"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { applyTheme, readTheme, subscribeTheme, type ThemeChoice } from "@/lib/theme";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = {
  system: "same as this device",
  light: "light",
  dark: "dark",
};
const SHORT: Record<ThemeChoice, string> = { system: "Auto", light: "Light", dark: "Dark" };
const ICON = { system: SunMoon, light: Sun, dark: Moon };

/**
 * The colour button: same as this device (the default) → Light → Dark. Many older eyes read dark text
 * on a light page more easily, so someone whose phone is in dark mode can still choose Light here, on
 * this device only. The button names the current choice ("Colours: Light") and the change is announced.
 */
export function ThemeToggle() {
  // The server (and the first paint) can't know the choice: "system" until hydrated.
  const current = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as const);
  const [said, setSaid] = useState("");
  const Icon = ICON[current];
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const next = NEXT[current];
          applyTheme(next);
          setSaid(`Colours: ${LABEL[next]}.`);
        }}
        aria-label={`Colours: ${LABEL[current]}. Change`}
        className="inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-lg px-2 text-base font-bold outline-hidden hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span aria-hidden="true" className="hidden sm:inline">
          Colours: {SHORT[current]}
        </span>
      </button>
      <span role="status" className="sr-only">
        {said}
      </span>
    </>
  );
}
