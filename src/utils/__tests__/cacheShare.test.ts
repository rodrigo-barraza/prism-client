import { describe, it, expect } from "vitest";
import { cacheReadShare } from "../cacheShare";

describe("cacheReadShare", () => {
  it("is cache read over the cache-inclusive input total", () => {
    expect(cacheReadShare({ input: 1000, cacheRead: 730 })).toBeCloseTo(0.73);
    expect(cacheReadShare({ input: 1000 })).toBe(0);
  });

  it("is null before any input, and clamped to 0–1", () => {
    expect(cacheReadShare(null)).toBeNull();
    expect(cacheReadShare({ input: 0, cacheRead: 0 })).toBeNull();
    expect(cacheReadShare({ input: 100, cacheRead: 150 })).toBe(1);
  });
});
