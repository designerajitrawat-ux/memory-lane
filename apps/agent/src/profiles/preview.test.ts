import { describe, expect, it } from "vitest";
import type { TasteItem } from "@memory-lane/shared";
import { previewImages } from "./store";

// SYNTHETIC items and image URLs (not Qloo data).
const img = (n: number) =>
  `https://images.qloo.com/i/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.jpg`;
const item = (n: number, source: TasteItem["source"], image: string | null): TasteItem => ({
  entityId: `e${n}`,
  domain: "music",
  entityType: "urn:entity:artist",
  typeLabel: null,
  name: `Item ${n}`,
  year: null,
  description: null,
  caption: "People who enjoy Example often also enjoy this.",
  source,
  becauseOf: [],
  evidenceIds: [`ev${n}`],
  image,
});

describe("demo picker preview", () => {
  it("shows Qloo's pictures, favourites first, at most six, each once, nothing else", () => {
    const items = [
      item(1, "qloo", img(1)),
      item(2, "favourite", img(2)),
      item(3, "qloo", null), // a dish: no picture
      item(4, "qloo", "https://elsewhere.example/i/x.jpg"),
      item(5, "learned", img(5)),
      item(6, "qloo", img(1)),
      item(7, "qloo", img(7)),
      item(8, "qloo", img(8)),
      item(9, "qloo", img(9)),
      item(10, "qloo", img(10)),
    ];
    expect(previewImages(items)).toEqual([img(2), img(1), img(5), img(7), img(8), img(9)]);
  });
});
