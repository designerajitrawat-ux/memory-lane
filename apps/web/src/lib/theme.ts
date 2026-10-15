/**
 * The colour choice: the device's setting (the default), or Light or Dark picked with the colour
 * button. Applied as `data-theme` on <html> (the source of truth for the page and the button), and
 * remembered on this device (localStorage) when storage is allowed.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "memory-lane-theme";

/** Runs in <head> before the page paints, so a picked theme never flashes the other one. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const parse = (value: string | null | undefined): ThemeChoice =>
  value === "light" || value === "dark" ? value : "system";

/** What the page shows now (works even when storage is blocked). */
export function readTheme(): ThemeChoice {
  return parse(document.documentElement.dataset.theme);
}

function setPage(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

/** For useSyncExternalStore: changes from the colour button, or from another tab. */
export function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  const fromOtherTab = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== null) return;
    setPage(parse(e.newValue));
    notify();
  };
  window.addEventListener("storage", fromOtherTab);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", fromOtherTab);
  };
}

export function applyTheme(choice: ThemeChoice) {
  setPage(choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  notify();
}
