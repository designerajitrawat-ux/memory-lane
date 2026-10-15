import { describe, expect, it } from "vitest";
import { QlooImageFieldSchema, QlooImageListSchema, qlooImageOrNull } from "./image";

describe("Qloo image URLs", () => {
  it("accepts only Qloo's own image files, over https", () => {
    const good = "https://images.qloo.com/i/00000000-0000-4000-8000-000000000001-420x-auto.jpg";
    expect(qlooImageOrNull(good)).toBe(good);
    for (const bad of [
      "http://images.qloo.com/i/a.jpg",
      "https://images.qloo.com.evil.example/i/a.jpg",
      "https://evil.example/i/a.jpg",
      "https://images.qloo.com/other/a.jpg",
      "https://images.qloo.com/i/a.jpg?track=1",
      "https://user@images.qloo.com/i/a.jpg",
      "https://images.qloo.com:8443/i/a.jpg",
      "https://images.qloo.com/i/../a.jpg",
      "https://images.qloo.com/i/a.jpg#x",
      "https://images.qloo.com/i/%2e%2e/a.jpg",
      "https://images.qloo.com/i/a.jpg\n",
      "https://images.qloo.com/i/",
      "https://images.qloo.com/i/a/b.jpg",
      "javascript:alert(1)",
      42,
      null,
    ]) {
      expect(qlooImageOrNull(bad), String(bad)).toBeNull();
    }
  });

  it("fails soft in API responses: a bad picture is no picture, never a failed page", () => {
    const good = "https://images.qloo.com/i/00000000-0000-4000-8000-000000000001.jpg";
    expect(QlooImageFieldSchema.parse("https://evil.example/i/a.jpg")).toBeNull();
    expect(QlooImageFieldSchema.parse(undefined)).toBeUndefined();
    expect(QlooImageListSchema.parse([good, "https://evil.example/i/a.jpg", 3])).toEqual([good]);
    expect(QlooImageListSchema.parse(undefined)).toEqual([]);
  });
});
