/**
 * Characterization: the turn THIS chat drives — composer → `POST /agent` →
 * SSE — replayed from recorded transcripts through the real component.
 *
 * Each scenario snapshots the per-event trace, the final state (through
 * utils/chatDebugProbe), the visible text of the key regions and, where the
 * user acts mid-turn, the requests that action sent. These snapshots are the
 * behaviour a refactor must keep (docs/chat-characterization.md): a changed
 * snapshot is either a bug or an intentional difference to document.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, within } from "@testing-library/react";

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
  REGION_SELECTORS,
  domDigest,
  loadTranscript,
  mountChat,
  normalize,
  normalizeState,
  requestBodies,
  respond,
  sendAndReplay,
  waitUntil,
  type ChatHarness,
  type WireEvent,
} from "./chatHarness";

let harness: ChatHarness | null = null;
afterEach(() => {
  harness?.unmount();
  harness = null;
});

function outcome(chat: ChatHarness, trace: string[], extra: Record<string, unknown> = {}) {
  return {
    trace,
    state: normalizeState(chat.state()),
    toasts: normalize(chat.toastLog),
    dom: domDigest(chat.view.container),
    ...extra,
  };
}

/** A mid-turn look: the named state slices and the visible regions. */
function checkpoint(chat: ChatHarness, keys: string[]) {
  const state = normalizeState(chat.state());
  return {
    state: Object.fromEntries(keys.map((key) => [key, state[key]])),
    dom: domDigest(chat.view.container),
  };
}

function onlyOne(container: HTMLElement, selector: string): HTMLElement {
  const matches = container.querySelectorAll<HTMLElement>(selector);
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** The persisted document the service holds for a finished turn. */
function persistedTurn(conversationId: string, prompt: string, reply: string) {
  return {
    id: conversationId,
    title: prompt,
    project: "coding",
    updatedAt: "2026-09-22T12:00:01.000Z",
    displayMessages: [
      { role: "user", content: prompt, timestamp: "2026-09-22T12:00:00.000Z" },
      {
        role: "assistant",
        content: reply,
        timestamp: "2026-09-22T12:00:00.500Z",
        provider: "anthropic",
        model: "claude-test",
        usage: { inputTokens: 1500, outputTokens: 60 },
      },
    ],
  };
}

describe("SSE-driven turn (characterization)", { timeout: 60_000 }, () => {
  it("a turn with tools and a sub-agent", async () => {
    harness = await mountChat();
    const { trace } = await sendAndReplay(
      harness,
      "What port does the dev server use?",
      loadTranscript("agent-turn-with-tools.jsonl"),
    );
    expect(outcome(harness, trace)).toMatchSnapshot();
  });

  it("a turn's side channels: checklist, brief, sources, code runs", async () => {
    harness = await mountChat();
    const { trace } = await sendAndReplay(
      harness,
      "Which port, and show your work.",
      loadTranscript("turn-side-channels.jsonl"),
    );
    expect(outcome(harness, trace)).toMatchSnapshot();
  });

  it("the request a send makes, and the refresh from the persisted turn after done", async () => {
    const chat = (harness = await mountChat());
    const prompt = "What port does the dev server use?";
    const events = loadTranscript("agent-turn-reconnect.jsonl");
    let requestsBeforeDone = 0;
    const { stream, trace } = await sendAndReplay(chat, prompt, events, {
      onEvent: (event) => {
        // The service persists the turn before it emits `done`.
        if (event.type === "chunk" && event.content === ", documented.") {
          const conversationId = chat.state().conversationId;
          chat.persisted.set(
            conversationId,
            persistedTurn(conversationId, prompt, "Checking the config — port 3000, documented."),
          );
          requestsBeforeDone = chat.network.requests.length;
        }
      },
    });
    const afterDone = chat.network.requests
      .slice(requestsBeforeDone)
      .map((request) => `${request.method} ${request.path}`);
    const conversationDocument = `GET /conversations/${chat.state().conversationId}?project=coding`;
    expect(
      outcome(chat, trace, {
        agentRequest: normalize(stream.request.body),
        // Which endpoints, not how often: the memory poll after `done`
        // repeats on a real 2 s timer. The document is fetched a fixed
        // number of times — conversation stats and the post-stream refresh.
        requestsAfterDone: normalize([...new Set(afterDone)].sort()),
        documentFetchesAfterDone: afterDone.filter((line) => line === conversationDocument).length,
      }),
    ).toMatchSnapshot();
  });

  it("approvals: two cards in one batch, one allowed from its card, one denied elsewhere", async () => {
    const chat = (harness = await mountChat());
    const events = loadTranscript("agent-turn-approval.jsonl");
    const lastApproval = events.map((event) => event.type).lastIndexOf("approval_required");
    let pending: unknown = null;
    const { trace } = await sendAndReplay(chat, "Add a README and a LICENSE.", events, {
      onEvent: async (_event, index) => {
        if (index !== lastApproval) return;
        pending = checkpoint(chat, ["pendingApprovals", "isGenerating"]);
        const cards = [...chat.view.container.querySelectorAll<HTMLElement>(REGION_SELECTORS.approvalCard)];
        expect(cards).toHaveLength(2);
        const readmeCard = cards.find((card) => card.textContent?.includes("README.md"));
        if (!readmeCard) throw new Error("no approval card for README.md");
        await chat.settle(() =>
          fireEvent.click(within(readmeCard).getByRole("button", { name: /^Allow$/ })),
        );
      },
    });
    expect(
      outcome(chat, trace, {
        pending,
        approveRequests: requestBodies(chat, "POST", /^\/agent\/approve$/),
      }),
    ).toMatchSnapshot();
  });

  it("plan mode: a plan the user executes", async () => {
    const chat = (harness = await mountChat());
    const events = loadTranscript("agent-turn-plan.jsonl");
    const planIndex = events.findIndex((event) => event.type === "plan_proposal");
    let proposed: unknown = null;
    const { trace } = await sendAndReplay(chat, "Change the dev port to 4000.", events, {
      onEvent: async (_event, index) => {
        if (index !== planIndex) return;
        proposed = checkpoint(chat, ["planProposal"]);
        // The chat area's `.messages-list` holds MessageList's own one.
        const transcript = chat.view.container.querySelector<HTMLElement>(REGION_SELECTORS.transcript)!;
        await chat.settle(() =>
          fireEvent.click(within(transcript).getByRole("button", { name: /Execute Plan/ })),
        );
      },
    });
    expect(
      outcome(chat, trace, {
        proposed,
        approveRequests: requestBodies(chat, "POST", /^\/agent\/approve$/),
      }),
    ).toMatchSnapshot();
  });

  it("a blocking question, answered from its card", async () => {
    const chat = (harness = await mountChat());
    const events = loadTranscript("agent-turn-question-blocking.jsonl");
    const questionIndex = events.findIndex((event) => event.type === "user_question");
    let asked: unknown = null;
    const { trace } = await sendAndReplay(chat, "Set up the database layer.", events, {
      onEvent: async (_event, index) => {
        if (index !== questionIndex) return;
        asked = checkpoint(chat, ["pendingUserQuestion", "nonBlockingQuestions"]);
        const card = onlyOne(chat.view.container, REGION_SELECTORS.questionCard);
        await chat.settle(() =>
          fireEvent.click(within(card).getByRole("button", { name: /Postgres/ })),
        );
      },
    });
    expect(
      outcome(chat, trace, {
        asked,
        answerRequests: requestBodies(chat, "POST", /^\/agent\/answer$/),
      }),
    ).toMatchSnapshot();
  });

  it("a non-blocking question: the agent keeps working, the answer comes back as a turn input", async () => {
    const chat = (harness = await mountChat());
    const events = loadTranscript("agent-turn-question-nonblocking.jsonl");
    const pendingIndex = events.findIndex(
      (event) => event.type === "status" && event.message === "question_pending",
    );
    let asked: unknown = null;
    let answered: unknown = null;
    const { trace } = await sendAndReplay(chat, "Set up the database layer.", events, {
      onEvent: async (_event, index) => {
        if (index !== pendingIndex) return;
        asked = checkpoint(chat, ["pendingUserQuestion", "nonBlockingQuestions"]);
        const list = onlyOne(chat.view.container, REGION_SELECTORS.nonBlockingQuestions);
        await chat.settle(() =>
          fireEvent.click(within(list).getByRole("button", { name: /Postgres/ })),
        );
        answered = checkpoint(chat, ["nonBlockingQuestions"]);
      },
    });
    expect(
      outcome(chat, trace, {
        asked,
        answered,
        answerRequests: requestBodies(chat, "POST", /^\/agent\/answer$/),
      }),
    ).toMatchSnapshot();
  });

  it("sub-agents: two spawned, one completes, one fails", async () => {
    const chat = (harness = await mountChat());
    const events = loadTranscript("agent-turn-subagents.jsonl");
    const secondSpawn = events.findIndex(
      (event) => event.type === "sub_agent_status" && event.subAgentId === "agent-2-7c1d",
    );
    let spawned: unknown = null;
    const { trace } = await sendAndReplay(chat, "Audit auth and billing in parallel.", events, {
      onEvent: (_event, index) => {
        if (index === secondSpawn) {
          spawned = checkpoint(chat, ["subAgentToolActivity", "conversations", "generatingConversationIds"]);
        }
      },
    });
    expect(outcome(chat, trace, { spawned })).toMatchSnapshot();
  });

  it("compaction, then the turn: context budget estimated, then reported", async () => {
    const chat = (harness = await mountChat());
    const events = loadTranscript("agent-turn-compaction.jsonl");
    let compacting: unknown = null;
    const { trace } = await sendAndReplay(chat, "Keep going with the refactor.", events, {
      onEvent: (event) => {
        if (event.type === "status" && event.message === "compaction_started") {
          compacting = checkpoint(chat, ["messages"]);
        }
      },
    });
    expect(outcome(chat, trace, { compacting })).toMatchSnapshot();
  });

  it("an error before the loop: `error` alone", async () => {
    harness = await mountChat();
    const { trace } = await sendAndReplay(
      harness,
      "Summarize the logs.",
      loadTranscript("agent-turn-error-before-loop.jsonl"),
    );
    expect(outcome(harness, trace)).toMatchSnapshot();
  });

  it("an error in the loop: `done`, then `error`", async () => {
    harness = await mountChat();
    const { trace } = await sendAndReplay(
      harness,
      "Summarize the logs.",
      loadTranscript("agent-turn-error-in-loop.jsonl"),
    );
    expect(outcome(harness, trace)).toMatchSnapshot();
  });

  it("the loop gives up: iteration limit, with command output on the way", async () => {
    harness = await mountChat();
    const { trace } = await sendAndReplay(
      harness,
      "Fix every lint warning.",
      loadTranscript("agent-turn-iteration-limit.jsonl"),
    );
    expect(outcome(harness, trace)).toMatchSnapshot();
  });

  it("steering: an update sent mid-turn is applied at the next boundary", async () => {
    const chat = (harness = await mountChat({}, {
      configureNetwork: (network) => {
        network.on("POST", /^\/agent\/input$/, () => ({ inputId: "input-5e6f7a8b", position: 1 }));
      },
    }));
    const events = loadTranscript("agent-turn-steering.jsonl");
    const toolCalling = events.findIndex(
      (event) => event.type === "tool_execution" && event.status === "calling",
    );
    let sent: unknown = null;
    const { trace } = await sendAndReplay(chat, "Check the config.", events, {
      onEvent: async (_event, index) => {
        if (index !== toolCalling) return;
        await chat.typeAndSend("Also check the tests.");
        sent = checkpoint(chat, ["messages", "queuedTurns"]);
      },
    });
    expect(
      outcome(chat, trace, {
        sent,
        inputRequests: requestBodies(chat, "POST", /^\/agent\/input$/),
      }),
    ).toMatchSnapshot();
  });

  it("steering refused (409, no running turn): the update is queued and sent when the turn ends", async () => {
    const chat = (harness = await mountChat({}, {
      configureNetwork: (network) => {
        network.on("POST", /^\/agent\/input$/, () =>
          respond(409, { error: "No running turn", reason: "no_running_turn" }),
        );
      },
    }));
    const events = loadTranscript("agent-turn-steering.jsonl").filter(
      (event) =>
        event.type !== "turn_input" &&
        !(event.type === "status" && event.message === "turn_input_applied"),
    );
    const toolCalling = events.findIndex(
      (event) => event.type === "tool_execution" && event.status === "calling",
    );
    let queued: unknown = null;
    const nextTurn = new Promise<void>((resolveNextTurn) => {
      void chat.network.nextStream().then(() => chat.network.nextStream().then(() => resolveNextTurn()));
    });
    const { trace } = await sendAndReplay(chat, "Check the config.", events, {
      onEvent: async (_event, index) => {
        if (index !== toolCalling) return;
        await chat.typeAndSend("Also check the tests.");
        queued = checkpoint(chat, ["messages", "queuedTurns", "toasts"]);
      },
    });
    // The queue drains once the turn has ended: a second /agent send.
    await nextTurn;
    const queuedTurnStream = chat.network.streams[1];
    await chat.replay(queuedTurnStream, [
      { type: "chunk", content: "Tests pass.", outputCharacters: 11 },
      { type: "done" },
    ]);
    await chat.settle(() => queuedTurnStream.close());
    expect(
      outcome(chat, trace, {
        queued,
        queuedTurnRequest: normalize(
          (queuedTurnStream.request.body as { messages: unknown[] }).messages,
        ),
      }),
    ).toMatchSnapshot();
  });

  it("goals: set, progress, then completed after done", async () => {
    harness = await mountChat();
    const { trace } = await sendAndReplay(
      harness,
      "Ship the port change end to end.",
      loadTranscript("agent-turn-goal.jsonl"),
    );
    expect(outcome(harness, trace)).toMatchSnapshot();
  });

  it("reconnect: the SSE ends mid-turn; the live socket resumes after the SSE's last seq", async () => {
    const chat = (harness = await mountChat());
    const prompt = "What port does the dev server use?";
    const events = loadTranscript("agent-turn-reconnect.jsonl");
    // The SSE delivers through the read_file call, then the body ends.
    const dropAfter = events.findIndex(
      (event) => event.type === "tool_execution" && event.status === "calling",
    );
    const { trace } = await sendAndReplay(chat, prompt, events.slice(0, dropAfter + 1));
    await waitUntil(chat, () => chat.sockets().length > 0);
    const socket = chat.latestSocket();
    await chat.settle(() => socket.open());
    const subscribe = normalize(socket.subscriptions());
    const lastSseSeq = events[dropAfter].seq as number;
    // The service replays from two events back; the cursor drops the repeats.
    const replayFrom = dropAfter - 1;
    await chat.settle(() =>
      socket.receive({
        type: "subscribed",
        conversationId: chat.state().conversationId,
        lastSeq: events[events.length - 2].seq,
        replayedCount: events.length - 1 - replayFrom,
        droppedCount: 0,
      }),
    );
    const recovered: string[] = [];
    for (const event of events.slice(replayFrom, -1)) {
      await chat.settle(() => socket.receive(event));
      recovered.push(`${event.type}${event.seq === undefined ? "" : `#${Number(event.seq) - lastSseSeq}`}`);
    }
    const streamed = checkpoint(chat, ["messages", "liveConnectionState"]);
    const conversationId = chat.state().conversationId;
    chat.persisted.set(
      conversationId,
      persistedTurn(conversationId, prompt, "Checking the config — port 3000, documented."),
    );
    const done = events[events.length - 1] as WireEvent;
    await chat.settle(() => socket.receive(done));
    await chat.settle();
    expect(
      outcome(chat, trace, { subscribe, recovered, streamed, socketsOpened: chat.sockets().length }),
    ).toMatchSnapshot();
  });
});
