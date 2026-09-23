/**
 * Replay harness for the agent chat's characterization suite.
 *
 * Mounts the REAL AgentChatComponent in jsdom and feeds it recorded event
 * transcripts (src/__fixtures__/sse-transcripts/*.jsonl) through its two
 * transports:
 *
 *   - the SSE the chat drives itself: the composer sends, `fetch("/agent")`
 *     answers with a stream the test writes one event at a time;
 *   - the live-viewer WebSocket it opens for a turn driven elsewhere: a
 *     fake `WebSocket` the test opens, acks and writes frames into.
 *
 * Everything below the component is the real code: the transport
 * (services/agentStream.ts — the SSE reader, liveViewerSocket and its
 * cursor) and the conversation reducer. Only the network is fake.
 *
 * What the suite reads:
 *   - state — `utils/chatDebugProbe` publishes the chat's state after every
 *     commit; `normalizeState` makes it snapshot-stable;
 *   - DOM — `regionText` digests the visible text of key regions, which
 *     survives a component split that keeps what the user sees;
 *   - renders — `noteMessageRowRender` counts message-row renders.
 *
 * Time is a manual clock: `Date` and `performance.now()` move only when the
 * harness advances them (CLOCK_STEP_MILLISECONDS per replayed event), so
 * timestamps, stream bursts and the status bar's "chunks flowing" check are
 * deterministic. Timers themselves are real.
 *
 * Each test file must declare the module mocks itself (vi.mock is hoisted per
 * file) — copy the block from an existing *.characterization.test.tsx. The
 * block also pins TZ=UTC in vi.hoisted: formatters built at module load keep
 * the zone they saw, so it must be set before the chat is imported.
 */
import { act, fireEvent, render, type RenderResult } from "@testing-library/react";
import { Profiler } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";
import AgentChatComponent, { type AgentChatComponentProps } from "../../AgentChatComponent";
import {
  installChatDebugProbe,
  installMessageRowRenderProbe,
  type ChatDebugState,
} from "../../../utils/chatDebugProbe";
import { resetAllCursors } from "../../../utils/liveTurnCursor";

export const SERVICE_ORIGIN = "http://prism.test";
export const SOCKET_ORIGIN = "ws://prism.test";
/** 2026-09-22T12:00:00.000Z — the manual clock's epoch. */
export const CLOCK_EPOCH = Date.UTC(2026, 8, 22, 12, 0, 0);
export const CLOCK_STEP_MILLISECONDS = 25;

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

export type WireEvent = Record<string, unknown> & { type: string };

const TRANSCRIPT_DIRECTORY = resolve(__dirname, "../../../__fixtures__/sse-transcripts");

/** One JSON event per line, in the exact wire shape prism-service emits. */
export function loadTranscript(name: string): WireEvent[] {
  return readFileSync(resolve(TRANSCRIPT_DIRECTORY, name), "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as WireEvent);
}

// ---------------------------------------------------------------------------
// Manual clock
// ---------------------------------------------------------------------------

export class ManualClock {
  private performanceMilliseconds = 1_000;

  install(): void {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(CLOCK_EPOCH);
    vi.spyOn(performance, "now").mockImplementation(() => this.performanceMilliseconds);
  }

  advance(milliseconds: number): void {
    this.performanceMilliseconds += milliseconds;
    vi.setSystemTime(Date.now() + milliseconds);
  }

  uninstall(): void {
    vi.useRealTimers();
  }
}

// ---------------------------------------------------------------------------
// Fake network
// ---------------------------------------------------------------------------

export interface RecordedRequest {
  method: string;
  /** Path and query, without the origin. */
  path: string;
  body: unknown;
}

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  body?: { getReader: () => { read: () => Promise<ReadableStreamReadResult<Uint8Array>> } } | null;
}

function jsonResponse(status: number, body: unknown): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

type RouteHandler = (_request: RecordedRequest, _match: RegExpMatchArray) => unknown;

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}

/** A route's answer: plain data is a 200 JSON body; `respond()` sets the status. */
export function respond(status: number, body: unknown): { __status: number; body: unknown } {
  return { __status: status, body };
}

const encoder = new TextEncoder();

/**
 * The body of one `/agent` (or `/chat`) response. `push` writes one event and
 * resolves once the reader has dispatched it and asked for the next frame —
 * the point where every callback it triggered has run.
 */
export class SseStream {
  readonly request: RecordedRequest;
  private queued: Uint8Array[] = [];
  private isClosed = false;
  private pendingRead: ((_result: ReadableStreamReadResult<Uint8Array>) => void) | null = null;
  private readWaiters: Array<() => void> = [];
  readCount = 0;

  constructor(request: RecordedRequest) {
    this.request = request;
  }

  reader() {
    return {
      read: (): Promise<ReadableStreamReadResult<Uint8Array>> => {
        this.readCount += 1;
        const waiters = this.readWaiters;
        this.readWaiters = [];
        for (const waiter of waiters) waiter();
        const next = this.queued.shift();
        if (next) return Promise.resolve({ done: false, value: next });
        if (this.isClosed) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolveRead) => {
          this.pendingRead = resolveRead;
        });
      },
    };
  }

  private nextRead(): Promise<void> {
    return new Promise((resolveWaiter) => this.readWaiters.push(resolveWaiter));
  }

  private deliver(bytes: Uint8Array | null): Promise<void> {
    const nextRead = this.nextRead();
    const pending = this.pendingRead;
    this.pendingRead = null;
    if (bytes === null) {
      this.isClosed = true;
      pending?.({ done: true, value: undefined });
    } else if (pending) {
      pending({ done: false, value: bytes });
    } else {
      this.queued.push(bytes);
    }
    return nextRead;
  }

  /** Write one event as an SSE frame; resolves when it has been dispatched. */
  push(event: WireEvent): Promise<void> {
    return this.deliver(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  /** End the body (EOF). Resolves at once — nothing reads after EOF. */
  close(): void {
    if (this.isClosed) return;
    void this.deliver(null);
  }
}

export class FakeNetwork {
  readonly requests: RecordedRequest[] = [];
  readonly streams: SseStream[] = [];
  readonly unrouted: string[] = [];
  private routes: Route[] = [];
  private streamWaiters: Array<(_stream: SseStream) => void> = [];

  /** Later registrations win over earlier ones. */
  on(method: string, pattern: RegExp, handler: RouteHandler): this {
    this.routes.unshift({ method, pattern, handler });
    return this;
  }

  /** Resolves with the next `/agent` or `/chat` stream the chat opens. */
  nextStream(): Promise<SseStream> {
    return new Promise((resolveStream) => this.streamWaiters.push(resolveStream));
  }

  requestsMatching(method: string, pattern: RegExp): RecordedRequest[] {
    return this.requests.filter(
      (request) => request.method === method && pattern.test(request.path),
    );
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<FakeResponse> => {
    const url = String(input);
    const path = url.startsWith(SERVICE_ORIGIN) ? url.slice(SERVICE_ORIGIN.length) : url;
    const method = (init?.method || "GET").toUpperCase();
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const request: RecordedRequest = { method, path, body };
    this.requests.push(request);

    if (method === "POST" && /^\/(agent|chat)(\?|$)/.test(path)) {
      const stream = new SseStream(request);
      this.streams.push(stream);
      const waiters = this.streamWaiters;
      this.streamWaiters = [];
      for (const waiter of waiters) waiter(stream);
      return { ...jsonResponse(200, {}), body: { getReader: () => stream.reader() } };
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;
      const answer = await route.handler(request, match);
      if (answer && typeof answer === "object" && "__status" in answer) {
        const { __status, body: answerBody } = answer as { __status: number; body: unknown };
        return jsonResponse(__status, answerBody);
      }
      return jsonResponse(200, answer);
    }
    this.unrouted.push(`${method} ${path}`);
    return jsonResponse(404, { error: `not routed: ${method} ${path}` });
  };
}

// ---------------------------------------------------------------------------
// Fake sockets
// ---------------------------------------------------------------------------

export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readyState = 0;
  readonly sent: Array<Record<string, unknown>> = [];
  onopen: ((_event: Event) => void) | null = null;
  onmessage: ((_event: MessageEvent) => void) | null = null;
  onerror: ((_event: Event) => void) | null = null;
  onclose: ((_event: CloseEvent) => void) | null = null;
  private listeners = new Map<string, Set<(_event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (_event: Event) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (_event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  /** The server accepted the connection. */
  open(): void {
    this.readyState = 1;
    this.onopen?.({} as Event);
    for (const listener of this.listeners.get("open") ?? []) listener({} as Event);
  }

  receive(frame: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  /** The connection dropped (network, server restart). */
  drop(): void {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  subscriptions(): Array<Record<string, unknown>> {
    return this.sent.filter((frame) => frame.type === "subscribe");
  }
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  onmessage: ((_event: MessageEvent) => void) | null = null;
  onerror: ((_event: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close(): void {}
}

// ---------------------------------------------------------------------------
// jsdom gaps the chat needs
// ---------------------------------------------------------------------------

/** Any property is a callable no-op that returns the stub again; never thenable. */
function inertStub(): unknown {
  const stub: unknown = new Proxy(function inert() {}, {
    get: (_target, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub),
    set: () => true,
    apply: () => stub,
    construct: () => stub as object,
  });
  return stub;
}

class InertAudioContext {
  constructor() {
    return inertStub() as InertAudioContext;
  }
}

function installDomPolyfills(): () => void {
  const restorers: Array<() => void> = [];
  const define = (target: object, key: string, value: unknown) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
    restorers.push(() => {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete (target as Record<string, unknown>)[key];
    });
  };
  class NoopObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): unknown[] {
      return [];
    }
  }
  define(globalThis, "ResizeObserver", NoopObserver);
  define(globalThis, "IntersectionObserver", NoopObserver);
  define(Element.prototype, "scrollIntoView", function scrollIntoView() {});
  define(Element.prototype, "scrollTo", function scrollTo() {});
  define(HTMLCanvasElement.prototype, "getContext", () => null);
  // SoundService's chimes: an inert Web Audio graph.
  define(window, "AudioContext", InertAudioContext);
  define(globalThis, "WebSocket", FakeWebSocket);
  define(globalThis, "EventSource", FakeEventSource);
  return () => {
    for (const restore of restorers.reverse()) restore();
  };
}

// ---------------------------------------------------------------------------
// Default service answers for a mounted chat
// ---------------------------------------------------------------------------

export const TEST_PROVIDER = "anthropic";
export const TEST_MODEL = "claude-test";

export const TEST_CONFIG = {
  providerList: [TEST_PROVIDER],
  textToText: {
    models: {
      [TEST_PROVIDER]: [
        {
          name: TEST_MODEL,
          label: "Claude Test",
          tools: ["Tool Calling"],
          inputTypes: ["text", "image"],
          thinking: false,
          defaultTemperature: 1,
          contextLength: 200_000,
        },
      ],
    },
    recommendedDefault: { provider: TEST_PROVIDER, model: TEST_MODEL, temperature: 1 },
    recommendedAgenticDefault: { provider: TEST_PROVIDER, model: TEST_MODEL, temperature: 1 },
  },
};

function registerDefaultRoutes(network: FakeNetwork, persisted: Map<string, unknown>): void {
  network
    .on("GET", /^\/config\?includeLocal=true$/, () => TEST_CONFIG)
    .on("GET", /^\/config\/tools(\?|$)/, () => [])
    .on("POST", /^\/config\/system-prompt-preview$/, () => ({ systemPrompt: "" }))
    .on("POST", /^\/config\/tools\/refresh/, () => ({ ok: true, count: 0 }))
    .on("GET", /^\/favorites(\?|$)/, () => [])
    .on("GET", /^\/stats\/models$/, () => [])
    .on("GET", /^\/config\/locales$/, () => [])
    .on("GET", /^\/settings$/, () => ({}))
    .on("GET", /^\/skills(\?|$)/, () => [])
    .on("GET", /^\/rules(\?|$)/, () => [])
    .on("GET", /^\/hooks(\?|$)/, () => [])
    .on("GET", /^\/project-instructions(\?|$)/, () => ({}))
    .on("GET", /^\/agent-memories(\?|$)/, () => ({ items: [], total: 0 }))
    .on("GET", /^\/memories(\?|$)/, () => ({ items: [], total: 0 }))
    .on("GET", /^\/workflow-memories(\?|$)/, () => ({ items: [], total: 0 }))
    .on("GET", /^\/workspaces(\?|$)/, () => [])
    .on("GET", /^\/conversations\?/, () => ({ items: [], hasMore: false, nextCursor: null }))
    .on("GET", /^\/conversations\/([^/?]+)(\?|$)/, (_request, match) => {
      const document = persisted.get(decodeURIComponent(match[1]));
      return document ?? respond(404, { error: "Conversation not found" });
    })
    .on("GET", /^\/conversations\/([^/?]+)\/goal$/, () => ({ goal: null }))
    .on("GET", /^\/conversations\/([^/?]+)\/status$/, () => ({
      isActive: false,
      pendingBackgroundTasks: 0,
    }))
    .on("GET", /^\/conversations\/([^/?]+)\/live-status$/, () => ({ active: false }))
    .on("GET", /^\/orchestrator\/sub-agents(\?|$)/, () => ({ subAgents: [] }))
    .on("POST", /^\/orchestrator\/sub-agents\/(.+\/)?stop$/, () => ({ ok: true }))
    .on("GET", /^\/api\/tools\/agentic\/task\/list-all/, () => ({ tasks: [], total: 0 }))
    .on("POST", /^\/api\/tools\/agentic\/datastore\/query$/, () => ({ rows: [], total: 0 }))
    .on("POST", /^\/agent\/input$/, () => ({ inputId: "input-1", position: 1 }))
    .on("POST", /^\/agent\/approve$/, () => ({ ok: true }))
    .on("POST", /^\/agent\/(stop|question|answer)/, () => ({ ok: true }));
}

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

export interface ChatHarness {
  readonly view: RenderResult;
  readonly network: FakeNetwork;
  readonly clock: ManualClock;
  /** Persisted conversation documents served at GET /conversations/:id. */
  readonly persisted: Map<string, unknown>;
  /** The chat's state as of the last commit. */
  state(): ChatDebugState;
  /** Type into the composer and press Enter. */
  typeAndSend(_text: string): Promise<void>;
  /** Replay `events` through `stream`, one dispatched frame per clock step. */
  replay(_stream: SseStream, _events: WireEvent[], _onEach?: (_event: WireEvent) => void): Promise<void>;
  /** Run `work` inside act() and let effects and promises settle. */
  settle(_work?: () => unknown): Promise<void>;
  /** The newest fake WebSocket (the chat's live-viewer / recovery socket). */
  latestSocket(): FakeWebSocket;
  sockets(): FakeWebSocket[];
  /** Rows rendered since the counter was last reset, keyed by row index. */
  rowRenders: { total: number; byIndex: Map<number, number>; reset(): void };
  /** React commits of the chat tree (Profiler onRender calls). */
  commits: { total: number };
  /** Every toast the chat has shown, in order (see normalizeState). */
  toastLog: ReadonlyArray<{ message: string; type: string }>;
  /** Render the chat again with new props (the page's agent personas arriving, say). */
  rerender(_props: AgentChatComponentProps): Promise<void>;
  unmount(): void;
}

/** Let promise chains and zero-delay timers run to quiescence. */
async function flushAsyncWork(rounds = 6): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolveTick) => setTimeout(resolveTick, 0));
  }
}

export async function mountChat(
  props: AgentChatComponentProps = {},
  {
    persisted = new Map<string, unknown>(),
    configureNetwork,
  }: {
    persisted?: Map<string, unknown>;
    configureNetwork?: (_network: FakeNetwork) => void;
  } = {},
): Promise<ChatHarness> {
  const network = new FakeNetwork();
  registerDefaultRoutes(network, persisted);
  configureNetwork?.(network);

  localStorage.clear();
  const clock = new ManualClock();
  clock.install();
  const restorePolyfills = installDomPolyfills();
  FakeWebSocket.instances = [];
  FakeEventSource.instances = [];
  resetAllCursors();
  vi.stubGlobal("fetch", network.fetch);
  for (const method of ["debug", "info", "log"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }

  let latestState: ChatDebugState | null = null;
  // Toasts dismiss themselves on a real timer, so the snapshots read this
  // log of every toast shown instead of the ones still up.
  const toastLog: Array<{ message: string; type: string }> = [];
  const loggedToastIds = new Set<unknown>();
  const uninstallStateProbe = installChatDebugProbe((state) => {
    latestState = state;
    for (const toast of state.toasts as Array<{ id?: unknown; message?: unknown; type?: unknown }>) {
      if (loggedToastIds.has(toast.id)) continue;
      loggedToastIds.add(toast.id);
      toastLog.push({ message: String(toast.message), type: String(toast.type) });
    }
  });
  const rowRenders = {
    total: 0,
    byIndex: new Map<number, number>(),
    reset() {
      this.total = 0;
      this.byIndex = new Map();
    },
  };
  const uninstallRowProbe = installMessageRowRenderProbe((_message, index) => {
    rowRenders.total += 1;
    rowRenders.byIndex.set(index, (rowRenders.byIndex.get(index) ?? 0) + 1);
  });

  const commits = { total: 0 };
  const chatElement = (chatProps: AgentChatComponentProps) => (
    <Profiler id="agent-chat" onRender={() => (commits.total += 1)}>
      <AgentChatComponent {...chatProps} />
    </Profiler>
  );
  let view: RenderResult | null = null;
  await act(async () => {
    view = render(chatElement(props));
    await flushAsyncWork();
  });

  const settle = async (work?: () => unknown) => {
    await act(async () => {
      await work?.();
      await flushAsyncWork();
    });
  };

  const harness: ChatHarness = {
    view: view!,
    network,
    clock,
    persisted,
    state() {
      if (!latestState) throw new Error("the chat has not published its state");
      return latestState;
    },
    async typeAndSend(text: string) {
      const composer = view!.container.querySelector<HTMLElement>("[contenteditable][role='textbox']");
      if (!composer) throw new Error("composer not found");
      await settle(() => {
        composer.textContent = text;
        fireEvent.input(composer);
      });
      await settle(() => {
        fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
      });
    },
    async replay(stream, events, onEach) {
      for (const event of events) {
        clock.advance(CLOCK_STEP_MILLISECONDS);
        await act(async () => {
          await stream.push(event);
        });
        onEach?.(event);
      }
      await settle();
    },
    settle,
    latestSocket() {
      const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
      if (!socket) throw new Error("the chat opened no WebSocket");
      return socket;
    },
    sockets: () => FakeWebSocket.instances,
    rowRenders,
    commits,
    toastLog,
    async rerender(nextProps) {
      await settle(() => view!.rerender(chatElement(nextProps)));
    },
    unmount() {
      for (const stream of network.streams) stream.close();
      view?.unmount();
      uninstallStateProbe();
      uninstallRowProbe();
      restorePolyfills();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      clock.uninstall();
    },
  };
  return harness;
}

// ---------------------------------------------------------------------------
// Snapshot normalization
// ---------------------------------------------------------------------------

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Ids the chat mints from Date.now() (+ Math.random()) when an event has none. */
const RANDOM_ID_PATTERN = /\b(w?tc)-\d{12,}(-0\.\d+)?/g;

/**
 * A plain, stable copy of any value: Maps and Sets become objects and sorted
 * arrays, minted UUIDs become `<uuid:N>` in order of first appearance, ids
 * minted from the clock become `tc-<minted>`, `undefined` fields are dropped
 * (JSON semantics — a reducer may omit what useState spread as `undefined`).
 */
export function normalize<T = unknown>(value: unknown): T {
  const uuids = new Map<string, string>();
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Map) return Object.fromEntries(item.entries());
    // Sorted after the ids are replaced — a raw UUID sorts at random.
    if (item instanceof Set) return { [SET_MARKER]: [...item].map(String) };
    return item;
  });
  if (text === undefined) return undefined as T;
  const replaced = text
    .replace(UUID_PATTERN, (uuid) => {
      const lower = uuid.toLowerCase();
      if (!uuids.has(lower)) uuids.set(lower, `<uuid:${uuids.size + 1}>`);
      return uuids.get(lower)!;
    })
    .replace(RANDOM_ID_PATTERN, "$1-<minted>");
  return JSON.parse(replaced, (_key, item: unknown) =>
    item && typeof item === "object" && SET_MARKER in item
      ? [...(item as Record<string, string[]>)[SET_MARKER]].sort()
      : item,
  ) as T;
}

const SET_MARKER = "__normalizedSet";

/**
 * The chat's state, normalized for a snapshot. `toasts` is left out: toasts
 * dismiss on a real timer, so what is still up depends on how fast the run
 * was — ChatHarness.toastLog has every toast shown.
 */
export function normalizeState(state: ChatDebugState): Record<string, unknown> {
  const { toasts: _toasts, ...snapshotted } = state;
  return normalize<Record<string, unknown>>(snapshotted);
}

/** Bodies of the requests matching `method` and `pattern`, normalized. */
export function requestBodies(harness: ChatHarness, method: string, pattern: RegExp): unknown[] {
  return normalize(harness.network.requestsMatching(method, pattern).map((request) => request.body));
}

/** One line per replayed event: what changed where, compactly. */
export function digestState(state: ChatDebugState): string {
  const messages = state.messages as Array<Record<string, unknown>>;
  const last = messages[messages.length - 1];
  const lastSummary = last
    ? `${String(last.role)}(${String(last.content ?? "").length}ch${
        last.statusPhase ? ` ${String(last.statusPhase)}` : ""
      }${Array.isArray(last.toolCalls) ? ` tools:${last.toolCalls.length}` : ""})`
    : "-";
  const tools = (state.toolActivity as Array<Record<string, unknown>>)
    .map((tool) => `${String(tool.name)}:${String(tool.status)}`)
    .join(",");
  const subAgents = Object.entries(state.subAgentToolActivity)
    .map(([id, entry]) => `${id}:${String((entry as Record<string, unknown>).phase ?? "-")}`)
    .join(",");
  return [
    `msgs=${messages.length}`,
    `last=${lastSummary}`,
    `gen=${state.isGenerating ? 1 : 0}`,
    tools ? `tools=[${tools}]` : "",
    subAgents ? `subs=[${subAgents}]` : "",
    state.pendingApprovals.length ? `approvals=${state.pendingApprovals.length}` : "",
    state.pendingUserQuestion ? "question" : "",
    state.nonBlockingQuestions.length ? `nbq=${state.nonBlockingQuestions.length}` : "",
    state.planProposal ? "plan" : "",
    state.goal ? `goal=${String((state.goal as Record<string, unknown>).status ?? "?")}` : "",
    state.queuedTurns.length ? `queued=${state.queuedTurns.length}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// DOM digests
// ---------------------------------------------------------------------------

/**
 * Where each key region lives today. A component split that moves a region
 * updates its selector here — the digests themselves are visible text only.
 */
export const REGION_SELECTORS = {
  transcript: ".messages-list",
  // Every message row, continuations included (those carry no
  // data-navigation-target).
  transcriptRow: "[data-message-index]",
  statusBar: ".status-bar-component",
  approvalCard: "[role='group'][aria-label^='Approval for']",
  questionCard: ".question-block",
  nonBlockingQuestions: ".non-blocking-questions-component",
  goal: "section[aria-label='Conversation goal']",
  turnActivity: "section[aria-label='Turn activity']",
  liveConnection: "[role='status'][aria-label^='Live stream']",
  queuedTurns: ".queued-turn-chips-component",
  contextBudget: ".context-budget-indicator",
  composer: "[contenteditable][role='textbox']",
  sendButton: "button[aria-label='Send'], button[aria-label='Stop']",
} as const;

/**
 * Animation-only text, blanked in the digests: the streaming cursor's random
 * "scramble" glyph, and the status bar's percentage, which a real-time
 * interval moves along an asymptotic curve (so it reads 0% or 100% depending
 * on whether a tick landed before the look). The phase label next to it stays.
 */
const VOLATILE_TEXT_SELECTOR = ".scramble-char, .status-bar-progress";

export function visibleText(element: Element): string {
  let source = element;
  if (element.querySelector(VOLATILE_TEXT_SELECTOR)) {
    source = element.cloneNode(true) as Element;
    for (const volatile of source.querySelectorAll(VOLATILE_TEXT_SELECTOR)) volatile.textContent = "";
  }
  return (source.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Visible text of each transcript row, in order. */
export function transcriptRows(container: HTMLElement): string[] {
  const transcript = container.querySelector(REGION_SELECTORS.transcript);
  if (!transcript) return [];
  return [...transcript.querySelectorAll(REGION_SELECTORS.transcriptRow)].map(visibleText);
}

function texts(container: HTMLElement, selector: string, outside?: Element | null): string[] {
  return [...container.querySelectorAll(selector)]
    .filter((element) => !outside || !outside.contains(element))
    .map(visibleText)
    .filter(Boolean);
}

/**
 * What the user sees in each key region: transcript rows, the chat's own
 * status bar (not the sub-agent bars inside tool blocks), the cards, the
 * panels under the transcript, the live-stream badge and the send button.
 */
export function domDigest(container: HTMLElement): Record<string, unknown> {
  const transcript = container.querySelector(REGION_SELECTORS.transcript);
  const sendButton = container.querySelector(REGION_SELECTORS.sendButton);
  return {
    rows: transcriptRows(container),
    statusBar: texts(container, REGION_SELECTORS.statusBar, transcript),
    approvalCards: texts(container, REGION_SELECTORS.approvalCard),
    questionCard: texts(container, REGION_SELECTORS.questionCard),
    nonBlockingQuestions: texts(container, REGION_SELECTORS.nonBlockingQuestions),
    goal: texts(container, REGION_SELECTORS.goal),
    turnActivity: texts(container, REGION_SELECTORS.turnActivity),
    liveConnection: [...container.querySelectorAll(REGION_SELECTORS.liveConnection)].map(
      (element) => element.getAttribute("aria-label"),
    ),
    queuedTurns: texts(container, REGION_SELECTORS.queuedTurns),
    contextBudget: texts(container, REGION_SELECTORS.contextBudget),
    sendButton: sendButton?.getAttribute("aria-label") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

export interface ReplayedTurn {
  stream: SseStream;
  /** `<event type>: <digestState>` after each replayed event. */
  trace: string[];
}

/**
 * Send `prompt` from the composer, then replay `events` on the `/agent`
 * stream the send opened. `onEvent` runs after each event is dispatched
 * (checkpoints, user actions mid-turn); it may be async. The body ends
 * after the last event, as the service ends the response after `done` —
 * `endStream: false` leaves it open.
 */
export async function sendAndReplay(
  harness: ChatHarness,
  prompt: string,
  events: WireEvent[],
  {
    onEvent,
    endStream = true,
  }: {
    onEvent?: (_event: WireEvent, _index: number) => void | Promise<void>;
    endStream?: boolean;
  } = {},
): Promise<ReplayedTurn> {
  const nextStream = harness.network.nextStream();
  await harness.typeAndSend(prompt);
  const stream = await nextStream;
  const trace: string[] = [];
  for (const [index, event] of events.entries()) {
    await harness.replay(stream, [event]);
    trace.push(`${event.type}${eventLabel(event)}: ${digestState(harness.state())}`);
    await onEvent?.(event, index);
  }
  if (endStream) await harness.settle(() => stream.close());
  await harness.settle();
  return { stream, trace };
}

/** Replay `events` as live-socket frames, with the same trace as sendAndReplay. */
export async function receiveAndTrace(
  harness: ChatHarness,
  socket: FakeWebSocket,
  events: WireEvent[],
  onEvent?: (_event: WireEvent, _index: number) => void | Promise<void>,
): Promise<string[]> {
  const trace: string[] = [];
  for (const [index, event] of events.entries()) {
    harness.clock.advance(CLOCK_STEP_MILLISECONDS);
    await harness.settle(() => socket.receive(event));
    trace.push(`${event.type}${eventLabel(event)}: ${digestState(harness.state())}`);
    await onEvent?.(event, index);
  }
  await harness.settle();
  return trace;
}

/** `status` and `sub_agent_status` say what they are in `message`. */
function eventLabel(event: WireEvent): string {
  const detail = event.message ?? event.status;
  return typeof detail === "string" ? `(${detail})` : "";
}

/** Wait (real time) until `predicate` holds — for backoff timers the chat owns. */
export async function waitUntil(
  harness: ChatHarness,
  predicate: () => boolean,
  timeoutMilliseconds = 3_000,
): Promise<void> {
  // Date and performance.now() are the manual clock; hrtime is real.
  const started = process.hrtime.bigint();
  while (!predicate()) {
    const elapsedMilliseconds = Number((process.hrtime.bigint() - started) / 1_000_000n);
    if (elapsedMilliseconds > timeoutMilliseconds) throw new Error("waitUntil: timed out");
    await harness.settle(() => new Promise<void>((resolveTick) => setTimeout(resolveTick, 25)));
  }
}
