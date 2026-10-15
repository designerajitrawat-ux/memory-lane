import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** The custom properties (--name: value) set inside the block that starts at `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]?.trim() ?? ""]),
  );
}

describe("colour themes", () => {
  it("picked Dark and the device's dark mode use the same colours", () => {
    // The block openers (the dark variant above mentions the same selectors in lists).
    const picked = tokens(':root[data-theme="dark"] {');
    const device = tokens(':root:not([data-theme="light"]) {');
    expect(Object.keys(picked).length).toBeGreaterThan(15);
    expect(device).toEqual(picked);
  });

  it("dark colours apply to screens only, so a printed plan is always light", () => {
    expect(css).toMatch(/@media screen \{\s*:root\[data-theme="dark"\]/);
    expect(css).toContain(
      '@media screen and (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"])',
    );
  });
});
