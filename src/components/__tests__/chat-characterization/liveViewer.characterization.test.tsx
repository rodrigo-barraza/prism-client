/**
 * Characterization: a turn driven ELSEWHERE (another tab or device, a
 * scheduled run) that this chat follows over the live-viewer WebSocket —
 * `/ws/chat` subscribe → ack → frames — replayed from the same recorded
 * transcripts as the SSE suite.
 *
 * The viewer has its own handler set today, and it diverges from the SSE
 * one (no sub-agent activity, no usage or context budget, no approval
 * cards). These snapshots pin that divergence; unifying the two
 * (docs/prompts/26 Landing 2) changes them on purpose, and each changed
 * line is a difference to document.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.TZ = "UTC";
});
vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  PRISM_SERVICE_URL: "http://prism.test",
  PRISM_WEBSOCKET_URL: "ws://prism.test",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Test", email: "test@example.test" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: unknown }) => children,
}));

import {
  domDigest,
  loadTranscript,
  mountChat,
  normalize,
  normalizeState,
  receiveAndTrace,
  waitUntil,
  type ChatHarness,
  type WireEvent,
} from "./chatHarness";

const LIVE_CONVERSATION_ID = "conv-live";
const EARLIER_TURN = [
  { role: "user", content: "Earlier question", timestamp: "2026-09-22T11:58:00.000Z" },
  {
    role: "assistant",
    content: "Earlier answer.",
    timestamp: "2026-09-22T11:58:05.000Z",
    provider: "anthropic",
    model: "claude-test",
  },
];

let harness: ChatHarness | null = null;
afterEach(() => {
  harness?.unmount();
  harness = null;
});

/**
 * Open a conversation whose turn is running elsewhere: the list says it is
 * active, the document holds the turns before it. The chat opens its viewer
 * socket; the test accepts it and acks the subscription.
 */
async function openRunningConversation(ack: Record<string, unknown> = {}) {
  const persisted = new Map<string, unknown>([
    [
      LIVE_CONVERSATION_ID,
      {
        id: LIVE_CONVERSATION_ID,
        title: "Live turn",
        project: "coding",
        updatedAt: "2026-09-22T11:59:00.000Z",
        displayMessages: EARLIER_TURN,
      },
    ],
  ]);
  const chat = await mountChat(
    { initialConversationId: LIVE_CONVERSATION_ID },
    {
      persisted,
      configureNetwork: (network) => {
        network.on("GET", /^\/conversations\?/, () => ({
          items: [
            {
              id: LIVE_CONVERSATION_ID,
              title: "Live turn",
              isActive: true,
              updatedAt: "2026-09-22T11:59:00.000Z",
            },
          ],
          hasMore: false,
          nextCursor: null,
        }));
      },
    },
  );
  const socket = chat.latestSocket();
  await chat.settle(() => socket.open());
  await chat.settle(() =>
    socket.receive({
      type: "subscribed",
      conversationId: LIVE_CONVERSATION_ID,
      lastSeq: 0,
      replayedCount: 0,
      droppedCount: 0,
      ...ack,
    }),
  );
  return { chat, socket, persisted };
}

/** The document the service holds once the viewed turn has finalized. */
function finalizedDocument(prompt: string, reply: string) {
  return {
    id: LIVE_CONVERSATION_ID,
    title: "Live turn",
    project: "coding",
    updatedAt: "2026-09-22T12:00:01.000Z",
    displayMessages: [
      ...EARLIER_TURN,
      { role: "user", content: prompt, timestamp: "2026-09-22T12:00:00.000Z" },
      {
        role: "assistant",
        content: reply,
        timestamp: "2026-09-22T12:00:00.500Z",
        provider: "anthropic",
        model: "claude-test",
      },
    ],
  };
}

function outcome(chat: ChatHarness, trace: string[], extra: Record<string, unknown> = {}) {
  return {
    trace,
    state: normalizeState(chat.state()),
    toasts: normalize(chat.toastLog),
    dom: domDigest(chat.view.container),
    ...extra,
  };
}

/** The reply a transcript streams: its chunks, as the service persists them. */
function replyOf(events: WireEvent[]): string {
  return events
    .filter((event) => event.type === "chunk")
    .map((event) => String(event.content))
    .join("")
    .trim();
}

/**
 * View a whole transcript: frames up to `done` stream live, the service
 * finalizes (persists the turn), then `done` and anything after it arrive.
 */
async function viewTranscript(name: string) {
  const { chat, socket, persisted } = await openRunningConversation();
  harness = chat;
  let events = loadTranscript(name);
  const prompt = String(
    events.find((event) => event.type === "user_message")?.content ?? "What port does the dev server use?",
  );
  if (!events.some((event) => event.type === "user_message")) {
    events = [{ type: "user_message", content: prompt, timestamp: Date.now() }, ...events];
  }
  const [running, done] = splitAtDone(events);
  const trace = await receiveAndTrace(chat, socket, running);
  const streamed = { dom: domDigest(chat.view.container), state: normalizeState(chat.state()) };
  persisted.set(LIVE_CONVERSATION_ID, finalizedDocument(prompt, replyOf(events)));
  trace.push(...(await receiveAndTrace(chat, socket, done)));
  return outcome(chat, trace, { streamed });
}

/** Everything before `done`, and `done` itself. */
function splitAtDone(events: WireEvent[]): [WireEvent[], WireEvent[]] {
  const doneIndex = events.findIndex((event) => event.type === "done");
  if (doneIndex < 0) return [events, []];
  return [events.slice(0, doneIndex), events.slice(doneIndex)];
}

describe("live-viewer turn (characterization)", { timeout: 60_000 }, () => {
  it("subscribes to the running conversation on open", async () => {
    const { chat, socket } = await openRunningConversation();
    harness = chat;
    expect({
      socketUrl: socket.url,
      sent: socket.sent,
      state: normalizeState(chat.state()),
      dom: domDigest(chat.view.container),
    }).toMatchSnapshot();
  });

  it.each([
    ["a turn with tools and a sub-agent", "agent-turn-with-tools.jsonl"],
    ["a turn's side channels: checklist, brief, sources, code runs", "turn-side-channels.jsonl"],
    ["approvals: two cards in one batch, decided elsewhere", "agent-turn-approval.jsonl"],
    ["plan mode: a plan decided elsewhere", "agent-turn-plan.jsonl"],
    ["a blocking question (the driving client's to answer)", "agent-turn-question-blocking.jsonl"],
    ["a non-blocking question, answered as a turn input", "agent-turn-question-nonblocking.jsonl"],
    ["sub-agents: two spawned, one completes, one fails", "agent-turn-subagents.jsonl"],
    ["compaction, then the turn", "agent-turn-compaction.jsonl"],
    ["an error before the loop", "agent-turn-error-before-loop.jsonl"],
    ["an error in the loop: done, then error", "agent-turn-error-in-loop.jsonl"],
    ["the loop gives up: iteration limit", "agent-turn-iteration-limit.jsonl"],
    ["steering: an update from another tab", "agent-turn-steering.jsonl"],
    ["goals: set, progress, then completed after done", "agent-turn-goal.jsonl"],
  ])("%s", async (_title, transcript) => {
    expect(await viewTranscript(transcript)).toMatchSnapshot();
  });

  it("reconnect: a dropped socket resubscribes after its last seq; the cursor drops the repeats", async () => {
    const { chat, socket, persisted } = await openRunningConversation();
    harness = chat;
    const events = loadTranscript("agent-turn-reconnect.jsonl");
    const dropAfter = events.findIndex(
      (event) => event.type === "tool_execution" && event.status === "calling",
    );
    const trace = await receiveAndTrace(chat, socket, events.slice(0, dropAfter + 1));
    await chat.settle(() => socket.drop());
    const whileDown = normalizeState(chat.state()).liveConnectionState;
    // liveViewerSocket's backoff runs on a real timer (≤ 500 ms first).
    await waitUntil(chat, () => chat.sockets().length === 2);
    const resumed = chat.latestSocket();
    await chat.settle(() => resumed.open());
    const replayFrom = dropAfter - 1;
    await chat.settle(() =>
      resumed.receive({
        type: "subscribed",
        conversationId: LIVE_CONVERSATION_ID,
        lastSeq: events[events.length - 2].seq,
        replayedCount: events.length - 1 - replayFrom,
        droppedCount: 0,
      }),
    );
    const [replayed, done] = splitAtDone(events.slice(replayFrom));
    trace.push(...(await receiveAndTrace(chat, resumed, replayed)));
    persisted.set(LIVE_CONVERSATION_ID, finalizedDocument(String(events[0].content), replyOf(events)));
    trace.push(...(await receiveAndTrace(chat, resumed, done)));
    expect(
      outcome(chat, trace, {
        whileDown,
        subscriptions: [socket.subscriptions(), resumed.subscriptions()],
      }),
    ).toMatchSnapshot();
  });

  it("a replay the service had to truncate says so", async () => {
    const { chat } = await openRunningConversation({ lastSeq: 1790078400009, replayedCount: 2, droppedCount: 7 });
    harness = chat;
    expect(normalize(chat.toastLog)).toMatchSnapshot();
  });

  it("a resubscribe that finds the service restarted ends the turn and reloads the document", async () => {
    const { chat, socket, persisted } = await openRunningConversation();
    harness = chat;
    const events = loadTranscript("agent-turn-reconnect.jsonl");
    const trace = await receiveAndTrace(chat, socket, events.slice(0, 4));
    await chat.settle(() => socket.drop());
    await waitUntil(chat, () => chat.sockets().length === 2);
    const resumed = chat.latestSocket();
    await chat.settle(() => resumed.open());
    // The restarted service lost the turn: nothing to replay. Its document
    // holds what was persisted before the restart.
    persisted.set(LIVE_CONVERSATION_ID, finalizedDocument(String(events[0].content), "Checking the config"));
    await chat.settle(() =>
      resumed.receive({
        type: "subscribed",
        conversationId: LIVE_CONVERSATION_ID,
        lastSeq: 0,
        replayedCount: 0,
        droppedCount: 0,
      }),
    );
    await chat.settle();
    expect(outcome(chat, trace, { subscriptions: resumed.subscriptions() })).toMatchSnapshot();
  });
});
