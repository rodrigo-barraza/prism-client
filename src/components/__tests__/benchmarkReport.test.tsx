import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import RunOverviewComponent from "../benchmarks/RunOverviewComponent";
import CaseMatrixComponent from "../benchmarks/CaseMatrixComponent";
import RunBuilderComponent from "../benchmarks/RunBuilderComponent";
import { ParetoChart, decadeTicks, scoreDomain, scoreTicks } from "../benchmarks/RunChartsComponent";
import BenchmarkApi from "../../services/BenchmarkApi";
import PrismService from "../../services/PrismService";
import type { BenchmarkRun, BenchmarkSample, ContestantSummary, RunReport } from "../../types/benchmarks";

// jsdom has no ResizeObserver; the segmented controls measure themselves with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  // jsdom has no layout: give charts a fixed size.
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 400, height: 280 }}>{children}</div> };
});

const contestants = [
  { key: "c_a", label: "Alpha", kind: "model" as const, provider: "google", model: "alpha" },
  { key: "c_b", label: "Beta", kind: "agent" as const, provider: "google", model: "beta", agent: "CODING" },
];

const RUN: BenchmarkRun = {
  id: "run-1",
  project: "p",
  username: "u",
  name: "Smoke",
  status: "completed",
  suites: [
    {
      id: "builtin.smoke",
      name: "Smoke test",
      version: 1,
      source: { kind: "builtin" },
      scorers: [],
      tools: { mode: "none" },
      workspace: false,
      cases: [
        { id: "arith", input: "What is 17 × 23?", target: "391", tags: ["math"] },
        { id: "gold", input: "Chemical symbol for gold?", target: "Au", tags: ["knowledge"] },
      ],
      totalCases: 11,
    },
  ],
  contestants,
  settings: {
    epochs: 2,
    judges: [],
    concurrency: 6,
    providerConcurrency: 3,
    maxAttempts: 3,
    timeoutSeconds: 0,
    pairwise: { mode: "off" },
  },
  progress: { total: 8, done: 8, errored: 0, running: 0, cost: 0.02, judgeCost: 0, battlesTotal: 0, battlesDone: 0 },
  createdAt: "2026-09-23T10:00:00Z",
};

const summary = (key: string, label: string, mean: number, rank: number): ContestantSummary => ({
  key,
  label,
  cases: 2,
  samples: 4,
  errored: key === "c_b" ? 1 : 0,
  mean,
  se: 0.1,
  ci: { low: Math.max(0, mean - 0.2), high: Math.min(1, mean + 0.2) },
  passRate: mean,
  passAtK: mean,
  passHatK: mean / 2,
  passCurve: [
    { k: 1, passAt: mean, passHat: mean },
    { k: 2, passAt: mean, passHat: mean / 2 },
  ],
  consistency: 0.5,
  flakyCases: 1,
  rank,
  rankRange: [1, 2],
  cost: { total: 0.01, perSample: 0.0025, judge: 0, perPass: 0.005 },
  latency: { meanMs: 1200, p50Ms: 1100, p95Ms: 2000 },
  ttftMs: 400,
  tokensPerSecond: 60,
  tokens: { input: 400, output: 80, reasoning: 0, cacheRead: 0 },
  meanTurns: 1,
  meanToolCalls: key === "c_b" ? 2 : 0,
  errors: key === "c_b" ? { provider: 1 } : {},
});

const REPORT: RunReport = {
  runId: "run-1",
  status: "completed",
  generatedAt: "2026-09-23T10:05:00Z",
  errorPolicy: "fail",
  overall: [summary("c_a", "Alpha", 1, 1), summary("c_b", "Beta", 0.5, 2)],
  suites: [
    {
      suiteId: "builtin.smoke",
      name: "Smoke test",
      cases: 2,
      summaries: [summary("c_a", "Alpha", 1, 1), summary("c_b", "Beta", 0.5, 2)],
      pairwise: [
        {
          a: "c_a",
          b: "c_b",
          n: 2,
          diff: 0.5,
          se: 0.5,
          ci: { low: -1, high: 1 },
          pValue: 1,
          pAdjusted: 1,
          significant: false,
          test: "permutation",
          wins: 1,
          ties: 1,
          losses: 0,
          mde: 0.9,
          correlation: null,
        },
      ],
      tags: [
        { tag: "math", cases: 1, means: { c_a: 1, c_b: 0 } },
        { tag: "knowledge", cases: 1, means: { c_a: 1, c_b: 1 } },
      ],
      caseRows: [
        { caseId: "arith", tags: ["math"], input: "What is 17 × 23?", scores: { c_a: 1, c_b: 0 }, passes: { c_a: [2, 2], c_b: [0, 2] }, discrimination: 1 },
        { caseId: "gold", tags: ["knowledge"], input: "Chemical symbol for gold?", scores: { c_a: 1, c_b: 1 }, passes: { c_a: [2, 2], c_b: [2, 2] }, discrimination: 0 },
      ],
      health: { saturated: 1, unsolved: 0, discriminating: 1, signalToNoise: 5 },
    },
  ],
  pareto: { cost: ["c_a"], latency: ["c_a"] },
  arena: null,
  judgeAgreement: null,
  judgeCost: 0,
  totalCost: 0.02,
};

describe("RunOverviewComponent", () => {
  it("states the verdict and lists every contestant with its interval, reliability and cost", () => {
    render(<RunOverviewComponent run={RUN} report={REPORT} scope="builtin.smoke" />);
    expect(screen.getByText(/are not separated/)).toBeInTheDocument();
    const table = screen.getAllByRole("table")[0];
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Alpha")).toBeInTheDocument();
    // Score and pass rate.
    expect(within(rows[1]).getAllByText("100%")).toHaveLength(2);
    expect(within(rows[2]).getByText("Beta")).toBeInTheDocument();
    expect(within(table).getByText("pass@2 / pass^2")).toBeInTheDocument();
    // Beta ran as an agent: turns and tools are shown.
    expect(within(table).getByText("Turns / tools")).toBeInTheDocument();
    expect(screen.getByText("Saturated cases")).toBeInTheDocument();
    expect(screen.getByText("By category")).toBeInTheDocument();
  });

  it("shows the paired difference of every pair", () => {
    render(<RunOverviewComponent run={RUN} report={REPORT} scope="builtin.smoke" />);
    const matrix = screen.getAllByRole("table").find((element) => element.getAttribute("class")?.includes("matrix"));
    expect(matrix).toBeTruthy();
    expect(within(matrix!).getByText("+50.0")).toBeInTheDocument();
    expect(within(matrix!).getByText("−50.0")).toBeInTheDocument();
  });
});

describe("run charts", () => {
  it("zooms the score axis to the scores, in steps of ten points", () => {
    expect(scoreDomain([1, 0.99, 0.985])).toEqual([0.9, 1]);
    expect(scoreDomain([0.52, 1])).toEqual([0.4, 1]);
    expect(scoreDomain([0.02, 0.4])).toEqual([0, 1]);
    expect(scoreDomain([])).toEqual([0, 1]);
  });

  it("ticks a score axis on round numbers", () => {
    expect(scoreTicks([0.9, 1])).toEqual([0.9, 0.92, 0.94, 0.96, 0.98, 1]);
    expect(scoreTicks([0.4, 1])).toEqual([0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(scoreTicks([0, 1])).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("gives a log axis a tick per decade", () => {
    const ticks = decadeTicks([0.0003, 0.006]);
    expect(ticks).toHaveLength(3);
    [0.0001, 0.001, 0.01].forEach((tick, index) => expect(ticks[index]).toBeCloseTo(tick, 10));
  });

  it("numbers the points by rank and names them in a key, frontier first in weight", () => {
    const summaries = REPORT.overall;
    render(<ParetoChart summaries={summaries} frontier={["c_a"]} axis="cost" />);
    const key = screen.getByRole("list");
    const items = within(key).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["1Alpha", "2Beta"]);
  });
});

describe("CaseMatrixComponent", () => {
  const samples = [
    { id: "s1", runId: "run-1", suiteId: "builtin.smoke", caseId: "arith", contestantKey: "c_b", epoch: 1, status: "error", error: { kind: "provider", message: "x", retryable: false } },
  ] as unknown as BenchmarkSample[];

  it("filters to the cases that separate the contestants and opens a case", () => {
    const onOpenCase = vi.fn();
    render(<CaseMatrixComponent run={RUN} report={REPORT} suiteId="builtin.smoke" samples={samples} onOpenCase={onOpenCase} />);
    expect(screen.getByText("2 shown")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Disagreements" }));
    expect(screen.getByText("1 shown")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Errors" }));
    expect(screen.getByText("1 shown")).toBeInTheDocument();
    expect(screen.getByLabelText("errored")).toBeInTheDocument();
    fireEvent.click(screen.getByText("arith", { exact: false }));
    expect(onOpenCase).toHaveBeenCalledWith("builtin.smoke", "arith");
  });
});

describe("RunBuilderComponent", () => {
  beforeEach(() => {
    vi.spyOn(PrismService, "getConfigWithLocalModels").mockResolvedValue({
      textToText: {
        models: { google: [{ name: "alpha", label: "Alpha", thinkingLevels: ["low", "high"] }] },
        defaults: {},
        recommendedDefault: { provider: "google", model: "alpha", temperature: 1 },
      },
    } as never);
    vi.spyOn(BenchmarkApi, "options").mockResolvedValue({
      agents: [{ id: "CODING", name: "Coding" }],
      defaultJudge: "google:alpha",
      limits: { maxEpochs: 10, maxRunCases: 2000, maxRunSamples: 20000, maxConcurrency: 32, defaultConcurrency: 6, defaultProviderConcurrency: 3 },
    });
    vi.spyOn(BenchmarkApi, "suites").mockResolvedValue([
      { id: "builtin.smoke", name: "Smoke test", caseCount: 11, source: { kind: "builtin" }, scorers: [], tools: { mode: "none" }, workspace: false, tags: [], caseTags: [] },
      { id: "builtin.reasoning", name: "Reasoning & math", caseCount: 16, source: { kind: "builtin" }, scorers: [], tools: { mode: "none" }, workspace: false, tags: [], caseTags: [] },
    ] as never);
    vi.spyOn(BenchmarkApi, "lineups").mockResolvedValue([]);
  });

  it("prefills the quick check, estimates, and starts the run", async () => {
    const { useSearchParams, useRouter } = await import("next/navigation");
    const push = vi.fn();
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("preset=quick") as never);
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn() } as never);
    const estimate = vi.spyOn(BenchmarkApi, "estimate").mockResolvedValue({
      samples: 27,
      battles: 0,
      cases: 27,
      perContestant: { c_a: { label: "Alpha", low: 0.01, high: 0.05, basis: "pricing" } },
      judge: { low: 0, high: 0 },
      total: { low: 0.01, high: 0.05 },
      detectableDifference: null,
      minutes: { low: 0.5, high: 2 },
      warnings: ["A warning worth reading."],
      contestants: [{ key: "c_a", label: "Alpha" }],
      suites: [],
      settings: { epochs: 1 } as never,
    });
    const start = vi.spyOn(BenchmarkApi, "startRun").mockResolvedValue({ id: "run-9" } as never);

    render(<RunBuilderComponent />);
    await waitFor(() => expect(screen.getByText("1 · What to test")).toBeInTheDocument());
    // The quick check picks the built-in suites that exist, and the recommended model.
    await waitFor(() => expect(screen.getByText("27 cases selected in total")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    await waitFor(() => expect(estimate).toHaveBeenCalled(), { timeout: 3000 });
    const body = estimate.mock.calls[0][0];
    expect(body.suiteIds).toEqual(["builtin.smoke", "builtin.reasoning"]);
    expect(body.contestants).toEqual([{ kind: "model", provider: "google", model: "alpha" }]);
    await waitFor(() => expect(screen.getByText("A warning worth reading.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Start run/ }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/benchmarks/runs/run-9"));
  });
});
