import { describe, it, expect } from "vitest";
import {
  compact,
  contestantChips,
  diffInterval,
  divergingFill,
  duration,
  heatFill,
  interval,
  money,
  percent,
  points,
  pValue,
  relativeTime,
  seriesColor,
  verdictOf,
} from "../benchmarkFormat";
import { parseCases } from "../../components/benchmarks/SuiteDetailComponent";
import type { PairwiseComparison } from "../../types/benchmarks";

describe("numbers", () => {
  it("formats scores, differences and intervals", () => {
    expect(percent(0.734)).toBe("73.4%");
    expect(percent(1)).toBe("100%");
    expect(percent(0)).toBe("0%");
    expect(percent(null)).toBe("—");
    expect(points(0.052)).toBe("+5.2 pts");
    expect(points(-0.1)).toBe("−10.0 pts");
    expect(points(0.0001)).toBe("±0 pts");
    expect(interval({ low: 0.681, high: 0.79 })).toBe("68–79%");
    expect(diffInterval({ low: 0.031, high: 0.149 })).toBe("+3.1 to +14.9 pts");
    expect(diffInterval({ low: -0.02, high: 0.05 })).toBe("−2.0 to +5.0 pts");
  });

  it("prints money with the precision it needs", () => {
    expect(money(0)).toBe("$0");
    expect(money(0.00004)).toBe("<$0.0001");
    expect(money(0.0042)).toBe("$0.0042");
    expect(money(0.31)).toBe("$0.310");
    expect(money(12.4)).toBe("$12.40");
    expect(money(1234)).toBe("$1,234");
  });

  it("prints durations, counts, p-values and ages", () => {
    expect(duration(840)).toBe("840 ms");
    expect(duration(3200)).toBe("3.2 s");
    expect(duration(125_000)).toBe("2m 05s");
    expect(compact(950)).toBe("950");
    expect(compact(12_345)).toBe("12K");
    expect(compact(2_500_000)).toBe("2.5M");
    expect(pValue(0.0004)).toBe("p < 0.001");
    expect(pValue(0.042)).toBe("p = 0.04");
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(relativeTime("2026-09-23T11:57:00Z", now)).toBe("3 minutes ago");
    expect(relativeTime("2026-09-22T12:00:00Z", now)).toBe("yesterday");
  });
});

describe("colors", () => {
  it("assigns categorical slots in order and folds the rest", () => {
    expect(seriesColor(0)).toBe("var(--bench-series-1)");
    expect(seriesColor(7)).toBe("var(--bench-series-8)");
    expect(seriesColor(8)).toBe("var(--bench-series-other)");
  });

  it("shades scores on one hue and differences on two poles", () => {
    expect(heatFill(null)).toBe("transparent");
    expect(heatFill(1)).toContain("56%");
    expect(heatFill(0)).toContain("8%");
    expect(divergingFill(0)).toContain("--bench-diverge-neutral");
    expect(divergingFill(0.2)).toContain("--bench-diverge-positive");
    expect(divergingFill(-0.2)).toContain("--bench-diverge-negative");
  });
});

describe("contestant chips", () => {
  it("lists what a contestant pins", () => {
    expect(
      contestantChips({ kind: "agent", provider: "google", model: "m", agent: "CODING", effort: "none", harness: { maxIterations: 8, toolDiscovery: "off" }, tools: ["a"] }),
    ).toEqual(["no thinking", "a", "≤8 steps", "discovery off"]);
  });
});

describe("verdict", () => {
  const summary = (key: string, mean: number) => ({ key, label: key.toUpperCase(), mean, ci: { low: mean - 0.1, high: mean + 0.1 }, cases: 50 });
  const pair = (overrides: Partial<PairwiseComparison>): PairwiseComparison => ({
    a: "a",
    b: "b",
    n: 50,
    diff: 0.12,
    se: 0.03,
    ci: { low: 0.06, high: 0.18 },
    pValue: 0.001,
    pAdjusted: 0.001,
    significant: true,
    test: "mcnemar",
    wins: 10,
    ties: 36,
    losses: 4,
    mde: 0.08,
    correlation: 0.5,
    ...overrides,
  });

  it("names a real lead with its interval", () => {
    const verdict = verdictOf([summary("a", 0.8), summary("b", 0.68)], [pair({})]);
    expect(verdict.tone).toBe("clear");
    expect(verdict.text).toContain("A leads with 80.0%");
    expect(verdict.text).toContain("+12.0 pts");
    expect(verdict.text).toContain("a real difference");
  });

  it("reads a pair stored the other way round", () => {
    const verdict = verdictOf([summary("a", 0.8), summary("b", 0.68)], [pair({ a: "b", b: "a", diff: -0.12, ci: { low: -0.18, high: -0.06 } })]);
    expect(verdict.text).toContain("+12.0 pts");
    expect(verdict.text).toContain("+6.0 to +18.0 pts");
  });

  it("calls a gap inside the noise a tie, and says what it would take", () => {
    const verdict = verdictOf([summary("a", 0.72), summary("b", 0.7)], [pair({ diff: 0.02, ci: { low: -0.05, high: 0.09 }, significant: false, pAdjusted: 0.5, mde: 0.13 })]);
    expect(verdict.tone).toBe("tie");
    expect(verdict.text).toContain("not separated");
    expect(verdict.text).toContain("~13 pts");
  });

  it("without a paired test, lets the rank ranges decide", () => {
    const ranked = (key: string, mean: number, rankRange: [number, number]) => ({ ...summary(key, mean), rankRange });
    const overlapping = verdictOf([ranked("a", 1, [1, 3]), ranked("b", 0.99, [1, 3]), ranked("c", 0.98, [1, 3])], []);
    expect(overlapping.tone).toBe("tie");
    expect(overlapping.text).toBe("A scores highest (100%), but 2 others could rank first too: their intervals overlap.");
    const clear = verdictOf([ranked("a", 0.9, [1, 1]), ranked("b", 0.5, [2, 2])], []);
    expect(clear.tone).toBe("clear");
    expect(clear.text).toContain("no other contestant's interval reaches it");
    // Without ranks, the intervals themselves.
    expect(verdictOf([summary("a", 0.9), summary("b", 0.85)], []).text).toContain("B could rank first too");
  });

  it("handles one contestant and none", () => {
    expect(verdictOf([summary("a", 0.5)], []).tone).toBe("single");
    expect(verdictOf([], []).tone).toBe("empty");
  });
});

describe("pasted cases", () => {
  it("reads JSONL with the usual field names", () => {
    const { cases, errors } = parseCases(
      ['{"id": "x", "input": "2+2?", "target": "4", "tags": ["math"]}', '{"question": "Capital of France?", "answer": "Paris"}', '{"nope": 1}'].join("\n"),
    );
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({ id: "x", input: "2+2?", target: "4", tags: ["math"] });
    expect(cases[1]).toMatchObject({ input: "Capital of France?", target: "Paris" });
    expect(errors[0]).toMatch(/line 3/);
  });

  it("reads CSV with quoted commas", () => {
    const { cases } = parseCases('"Name three colours, please",red\nWhat is 6x7?,42');
    expect(cases.map((entry) => [entry.input, entry.target])).toEqual([
      ["Name three colours, please", "red"],
      ["What is 6x7?", "42"],
    ]);
  });
});
