/**
 * The colour choice: the device's setting (the default), or Light or Dark picked with the colour
 * button. Kept on this device only (localStorage), and applied as `data-theme` on <html>.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "memory-lane-theme";

/** Runs in <head> before the page paints, so a picked theme never flashes the other one. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: changes from the colour button, or from another tab. */
export function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  for (const l of listeners) l();
}
