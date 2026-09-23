/**
 * BenchmarkApi — prism-service's /benchmark API (docs/benchmarks.md there).
 *
 * Plain requests go through PrismService._request (headers, errors with a
 * status). The two streams — a run's progress and a live arena battle —
 * are this API's own event framing, not the turn protocol, so they are
 * read here with a small SSE reader.
 */
import { HTTP_METHODS } from "@/constants";
import { PRISM_SERVICE_URL } from "@/config";
import PrismService from "./PrismService";
import { getBaseHeaders } from "./serviceHeaders";
import type {
  ArenaReport,
  Battle,
  BattleWinner,
  BenchmarkRun,
  BenchmarkSample,
  BenchmarkSuite,
  CatalogEntry,
  ContestantLineup,
  ContestantSpec,
  CostEstimate,
  Leaderboard,
  RunComparison,
  RunListItem,
  RunProgress,
  RunReport,
  RunSettings,
  RunStatus,
  SampleStatus,
  SuiteSummary,
} from "../types/benchmarks";

const request = PrismService._request.bind(PrismService) as typeof PrismService._request;
const get = <T>(path: string) => request<T>(`/benchmark${path}`, { method: HTTP_METHODS.GET });
const post = <T>(path: string, body: unknown = {}) => request<T>(`/benchmark${path}`, { method: HTTP_METHODS.POST, body });
const put = <T>(path: string, body: unknown) => request<T>(`/benchmark${path}`, { method: HTTP_METHODS.PUT, body });
const patch = <T>(path: string, body: unknown) => request<T>(`/benchmark${path}`, { method: HTTP_METHODS.PATCH, body });
const remove = <T>(path: string) => request<T>(`/benchmark${path}`, { method: HTTP_METHODS.DELETE });
const query = (params: Record<string, string | number | boolean | null | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return entries.length > 0 ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}` : "";
};

export interface BenchmarkOptions {
  agents: Array<{ id: string; name: string; description?: string; custom?: boolean }>;
  defaultJudge: string | null;
  limits: {
    maxEpochs: number;
    maxRunCases: number;
    maxRunSamples: number;
    maxConcurrency: number;
    defaultConcurrency: number;
    defaultProviderConcurrency: number;
  };
}

export type PairwiseRequest = Partial<RunSettings["pairwise"]> & { baselineIndex?: number | null };

export interface RunRequest {
  name?: string | null;
  notes?: string | null;
  suiteIds: string[];
  contestants: ContestantSpec[];
  settings?: Partial<Omit<RunSettings, "pairwise">> & { pairwise?: PairwiseRequest };
}

export interface EstimateResponse extends CostEstimate {
  contestants: Array<{ key: string; label: string }>;
  suites: Array<{ id: string; name: string; cases: number; totalCases: number }>;
  settings: RunSettings;
}

export type RunDetail = BenchmarkRun & { live: boolean };
export type SuiteDetail = BenchmarkSuite & { scorerLabels?: string[] };

export interface BlindPair {
  runId: string;
  suiteId: string;
  caseId: string;
  epoch: number;
  prompt: string;
  systemPrompt: string | null;
  a: { sampleId: string; output: string };
  b: { sampleId: string; output: string };
  remaining: number;
}

export interface Vote {
  battle: Battle;
  reveal: { a: string; b: string };
}

export interface ScheduleRequest {
  name: string;
  suiteIds: string[];
  contestants: ContestantSpec[];
  settings?: RunRequest["settings"];
  threshold?: number | null;
  alert?: { webhook?: boolean; ntfyTopic?: string | null } | null;
  scheduleType: "hourly" | "daily" | "weekly" | "cron";
  scheduleTime?: string;
  scheduleDay?: number;
  cronExpression?: string;
}

export interface BenchmarkSchedule {
  id: string;
  name: string;
  enabled: boolean;
  scheduleType: string;
  scheduleTime?: string | null;
  cronExpression?: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  benchmark?: { suiteIds: string[]; contestants: ContestantSpec[]; threshold?: number | null };
}

// ── Streams ─────────────────────────────────────────────────

/** Read an SSE response's `data:` frames as JSON objects until it ends or `signal` aborts. */
async function* readEvents<Event>(response: Response, signal?: AbortSignal): AsyncGenerator<Event> {
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error((error as { error?: string }).error || `Prism API error: ${response.status}`), { status: response.status });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            yield JSON.parse(line.slice(6)) as Event;
          } catch {
            /* a malformed frame is skipped */
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export type RunStreamEvent =
  | { type: "snapshot"; runId: string; status: RunStatus; statusReason: string | null; progress: RunProgress; live: boolean }
  | { type: "status"; runId: string; status: RunStatus; statusReason?: string | null; progress: RunProgress }
  | { type: "progress"; runId: string; progress: RunProgress }
  | {
      type: "sample";
      runId: string;
      sample: Pick<BenchmarkSample, "id" | "suiteId" | "caseId" | "contestantKey" | "epoch" | "status" | "score" | "passed" | "cost" | "judgeCost" | "latencyMs" | "error">;
    }
  | { type: "battle"; runId: string; battle: { id: string; suiteId?: string | null; caseId?: string | null; epoch?: number | null; winner: BattleWinner; a: string; b: string } }
  | { type: "end"; runId: string; status: RunStatus };

export type LiveBattleEvent =
  | { type: "side"; side: "a" | "b"; kind: "text" | "thinking"; content: string }
  | { type: "side_tool"; side: "a" | "b"; name: string; status: string }
  | { type: "side_done"; side: "a" | "b"; latencyMs: number; cost: number | null; error: string | null }
  | { type: "ready"; token: string }
  | { type: "error"; message: string };

const BenchmarkApi = {
  options: () => get<BenchmarkOptions>("/options"),
  catalog: () => get<{ entries: CatalogEntry[] }>("/catalog").then((body) => body.entries),

  // Suites
  suites: () => get<{ suites: SuiteSummary[] }>("/suites").then((body) => body.suites),
  suite: (id: string) => get<SuiteDetail>(`/suites/${encodeURIComponent(id)}`),
  createSuite: (suite: Partial<BenchmarkSuite>) => post<BenchmarkSuite>("/suites", suite),
  updateSuite: (id: string, fields: Partial<BenchmarkSuite>) => put<BenchmarkSuite>(`/suites/${encodeURIComponent(id)}`, fields),
  duplicateSuite: (id: string, name?: string) => post<BenchmarkSuite>(`/suites/${encodeURIComponent(id)}/duplicate`, { name }),
  deleteSuite: (id: string) => remove<{ success: boolean }>(`/suites/${encodeURIComponent(id)}`),
  importSuite: (catalogId: string, { limit, seed, name }: { limit?: number | null; seed?: number | null; name?: string | null } = {}) =>
    post<SuiteSummary>("/suites/import", { catalogId, limit, seed, name }),

  // Lineups
  lineups: () => get<{ lineups: ContestantLineup[] }>("/lineups").then((body) => body.lineups),
  saveLineup: (lineup: { id?: string; name: string; contestants: ContestantSpec[] }) => post<ContestantLineup>("/lineups", lineup),
  deleteLineup: (id: string) => remove<{ success: boolean }>(`/lineups/${encodeURIComponent(id)}`),

  // Runs
  estimate: (run: RunRequest) => post<EstimateResponse>("/estimate", run),
  startRun: (run: RunRequest) => post<RunListItem>("/runs", run),
  runs: (params: { scheduleId?: string; limit?: number } = {}) =>
    get<{ runs: RunListItem[] }>(`/runs${query(params)}`).then((body) => body.runs),
  run: (id: string) => get<RunDetail>(`/runs/${encodeURIComponent(id)}`),
  report: (id: string, errors: "fail" | "exclude" = "fail") => get<RunReport>(`/runs/${encodeURIComponent(id)}/report${query({ errors })}`),
  samples: (
    id: string,
    filter: { suiteId?: string; caseId?: string; contestantKey?: string; status?: SampleStatus; full?: boolean } = {},
  ) =>
    get<{ samples: BenchmarkSample[] }>(`/runs/${encodeURIComponent(id)}/samples${query({ ...filter, full: filter.full ? 1 : undefined })}`).then(
      (body) => body.samples,
    ),
  sample: (runId: string, sampleId: string) => get<BenchmarkSample>(`/runs/${encodeURIComponent(runId)}/samples/${encodeURIComponent(sampleId)}`),
  overrideSample: (runId: string, sampleId: string, override: { passed: boolean; note?: string } | null) =>
    patch<BenchmarkSample>(`/runs/${encodeURIComponent(runId)}/samples/${encodeURIComponent(sampleId)}`, { override }),
  cancelRun: (id: string) => post<{ success: boolean }>(`/runs/${encodeURIComponent(id)}/cancel`),
  resumeRun: (id: string, options: { retryErrors?: boolean; budgetUsd?: number | null } = {}) =>
    post<{ success: boolean }>(`/runs/${encodeURIComponent(id)}/resume`, options),
  regradeRun: (id: string, useCurrentScorers = true) => post<{ success: boolean }>(`/runs/${encodeURIComponent(id)}/regrade`, { useCurrentScorers }),
  judgePairwise: (id: string, body: { mode: "all_pairs" | "vs_baseline"; baselineKey?: string | null; judges?: string[] | null }) =>
    post<{ success: boolean }>(`/runs/${encodeURIComponent(id)}/pairwise`, body),
  rerun: (id: string, name?: string) => post<RunListItem>(`/runs/${encodeURIComponent(id)}/rerun`, { name }),
  deleteRun: (id: string) => remove<{ success: boolean }>(`/runs/${encodeURIComponent(id)}`),
  exportUrl: (id: string, format: "json" | "csv") => `${PRISM_SERVICE_URL}/benchmark/runs/${encodeURIComponent(id)}/export${format === "csv" ? "?format=csv" : ""}`,
  compare: (baseId: string, headId: string) => get<RunComparison>(`/compare${query({ base: baseId, head: headId })}`),
  leaderboard: () => get<Leaderboard>("/leaderboard"),

  /** Follow a run's progress; resolves when the stream ends. */
  async followRun(id: string, onEvent: (event: RunStreamEvent) => void, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${PRISM_SERVICE_URL}/benchmark/runs/${encodeURIComponent(id)}/events`, {
      headers: getBaseHeaders(),
      cache: "no-store",
      signal,
    });
    for await (const event of readEvents<RunStreamEvent>(response, signal)) onEvent(event);
  },

  /** Download a run export with the service headers (the project scopes it). */
  async downloadExport(id: string, format: "json" | "csv"): Promise<Blob> {
    const response = await fetch(BenchmarkApi.exportUrl(id, format), { headers: getBaseHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    return response.blob();
  },

  // Arena
  arena: (params: { source?: "human" | "judge" | "all"; runId?: string; suiteId?: string; styleControl?: boolean } = {}) =>
    get<ArenaReport & { source: string }>(`/arena${query({ ...params, styleControl: params.styleControl ? 1 : undefined })}`),
  battles: (params: { source?: "human" | "judge"; runId?: string; limit?: number } = {}) =>
    get<{ battles: Battle[] }>(`/arena/battles${query(params)}`).then((body) => body.battles),
  deleteBattle: (id: string) => remove<{ success: boolean }>(`/arena/battles/${encodeURIComponent(id)}`),
  nextBlindPair: (runId: string) => get<{ pair: BlindPair | null }>(`/runs/${encodeURIComponent(runId)}/arena/next`).then((body) => body.pair),
  voteBlind: (runId: string, vote: { aSampleId: string; bSampleId: string; winner: BattleWinner }) =>
    post<Vote>(`/runs/${encodeURIComponent(runId)}/arena/votes`, vote),
  voteLive: (token: string, winner: BattleWinner) => post<Vote>(`/arena/live/${encodeURIComponent(token)}/vote`, { winner }),

  /** Two contestants answer a prompt side by side; events arrive as they stream. */
  async liveBattle(
    body: { prompt: string; systemPrompt?: string | null; contestants: [ContestantSpec, ContestantSpec] },
    onEvent: (event: LiveBattleEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${PRISM_SERVICE_URL}/benchmark/arena/live`, {
      method: HTTP_METHODS.POST,
      headers: getBaseHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    for await (const event of readEvents<LiveBattleEvent>(response, signal)) onEvent(event);
  },

  // Schedules
  schedules: () => get<{ schedules: BenchmarkSchedule[] }>("/schedules").then((body) => body.schedules),
  createSchedule: (schedule: ScheduleRequest) => post<BenchmarkSchedule>("/schedules", schedule),
  deleteSchedule: (id: string) => remove<{ success: boolean }>(`/schedules/${encodeURIComponent(id)}`),
};

export default BenchmarkApi;
