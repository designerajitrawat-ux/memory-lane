import { describe, expect, it } from "vitest";
import { createTestDb } from "../../test/pglite";
import { createPgLlmStore } from "./client";

describe("the daily LLM cap in Postgres", () => {
  it("counts atomically, keeps the reserve for seeding, and never goes past the cap", async () => {
    const store = createPgLlmStore(await createTestDb());
    const take = (n: number, cap: number, keep: number) =>
      Promise.all(Array.from({ length: n }, () => store.reserve(cap, keep)));

    // The first call of the day inserts the row; visitors stop at cap − reserve.
    expect(await take(1, 3, 1)).toEqual([true]);
    expect(await take(1, 3, 1)).toEqual([true]);
    expect(await take(1, 3, 1)).toEqual([false]);
    // Seeding may use the reserve, up to the cap itself.
    expect(await take(1, 3, 0)).toEqual([true]);
    expect(await take(1, 3, 0)).toEqual([false]);

    // Concurrent calls land exactly at the cap (3 used so far).
    expect((await take(20, 25, 0)).filter(Boolean)).toHaveLength(20);
    expect((await take(10, 25, 0)).filter(Boolean)).toHaveLength(2);
    // A reserve as large as the cap leaves visitors nothing.
    expect(await take(1, 25, 25)).toEqual([false]);
  }, 30_000);
});
