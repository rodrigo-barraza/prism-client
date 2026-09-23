/**
 * A turn paused at its cost cap (prism-service prompt 13, Landing 3), through
 * the REAL AgentChatComponent (the chat-characterization harness: only the
 * network is fake).
 *
 * `budget_reached` puts up a card with the spend against the cap and a
 * "Raise budget" action; the status bar says the turn waits for the user.
 * Raising sends PATCH /conversations/:id/budget with the new cap and the card
 * goes; Stop stops the turn. A conversation loaded while paused brings the
 * card back from its `pendingBudget`.
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
  loadTranscript,
  mountChat,
  requestBodies,
  respond,
  sendAndReplay,
  visibleText,
  type ChatHarness,
} from "./chat-characterization/chatHarness";

const BUDGET_CARD = "[role='group'][aria-label='Budget reached']";
const BUDGET_PATCH = /^\/conversations\/([^/]+)\/budget$/;

/** The conversation the chat sent its turn for (it mints its own id). */
function turnConversationId(chat: ChatHarness): string {
  const [turn] = chat.network.requestsMatching("POST", /^\/agent(\?|$)/);
  return String((turn?.body as { conversationId?: unknown })?.conversationId);
}

let harness: ChatHarness | null = null;
afterEach(() => {
  harness?.unmount();
  harness = null;
});

function budgetCard(chat: ChatHarness): HTMLElement | null {
  return chat.view.container.querySelector<HTMLElement>(BUDGET_CARD);
}

function statusBarText(chat: ChatHarness): string {
  const bar = chat.view.container.querySelector(REGION_SELECTORS.statusBar);
  return bar ? visibleText(bar) : "";
}

describe("a turn paused at its cost cap", { timeout: 60_000 }, () => {
  it("shows the spend against the cap with a Raise budget action; raising sends the new cap and the card goes", async () => {
    const chat = (harness = await mountChat());
    chat.network.on("PATCH", BUDGET_PATCH, () =>
      respond(200, { status: "raised", pauseId: "pause-1", maxCostDollars: 5, spentDollars: 2, delivered: true }),
    );
    const events = loadTranscript("agent-turn-budget-pause.jsonl");
    const pausedAt = events.findIndex((event) => event.type === "status" && event.message === "budget_reached");
    let whilePaused: { card: string; statusBar: string } | null = null;

    await sendAndReplay(chat, "Read a and b.", events, {
      onEvent: async (_event, index) => {
        if (index !== pausedAt) return;
        const card = budgetCard(chat);
        if (!card) throw new Error("no budget card while paused");
        whilePaused = { card: visibleText(card), statusBar: statusBarText(chat) };
        const input = within(card).getByLabelText("New cost cap in dollars");
        await chat.settle(() => fireEvent.change(input, { target: { value: "5" } }));
        await chat.settle(() => fireEvent.click(within(card).getByRole("button", { name: "Raise budget" })));
        expect(budgetCard(chat), "the card goes as soon as the raise is taken").toBeNull();
      },
    });

    expect(whilePaused).not.toBeNull();
    expect(whilePaused!.card).toContain("Budget reached");
    expect(whilePaused!.card).toContain("This turn spent $2.00 of its $1.50 cap");
    expect(whilePaused!.statusBar).toContain("Waiting for you");
    expect(requestBodies(chat, "PATCH", BUDGET_PATCH)).toEqual([{ maxCostDollars: 5 }]);
    const [raise] = chat.network.requestsMatching("PATCH", BUDGET_PATCH);
    expect(raise.path).toBe(`/conversations/${encodeURIComponent(turnConversationId(chat))}/budget`);
    expect(budgetCard(chat)).toBeNull();
    expect(chat.network.unrouted.filter((line) => line.includes("/budget"))).toEqual([]);
  });

  it("a cap no higher than the spend is not sent; the server's refusal is shown on the card", async () => {
    const chat = (harness = await mountChat());
    chat.network.on("PATCH", BUDGET_PATCH, () =>
      respond(409, { status: "stale", error: "This budget pause was already settled" }),
    );
    const events = loadTranscript("agent-turn-budget-pause.jsonl");
    const pausedAt = events.findIndex((event) => event.type === "status" && event.message === "budget_reached");

    await sendAndReplay(chat, "Read a and b.", events.slice(0, pausedAt + 1), {
      endStream: false,
      onEvent: async (_event, index) => {
        if (index !== pausedAt) return;
        const card = budgetCard(chat)!;
        const input = within(card).getByLabelText("New cost cap in dollars");
        await chat.settle(() => fireEvent.change(input, { target: { value: "1.99" } }));
        await chat.settle(() => fireEvent.click(within(card).getByRole("button", { name: "Raise budget" })));
        expect(within(card).getByRole("alert").textContent).toContain("Enter more than $2.00");

        await chat.settle(() => fireEvent.change(input, { target: { value: "3" } }));
        await chat.settle(() => fireEvent.click(within(card).getByRole("button", { name: "Raise budget" })));
      },
    });

    expect(requestBodies(chat, "PATCH", BUDGET_PATCH)).toEqual([{ maxCostDollars: 3 }]);
    const card = budgetCard(chat);
    expect(card, "a refused raise leaves the turn paused").not.toBeNull();
    expect(within(card!).getByRole("alert").textContent).toContain("already settled");
  });

  it("Stop on the card stops the turn", async () => {
    const chat = (harness = await mountChat());
    const events = loadTranscript("agent-turn-budget-pause.jsonl");
    const pausedAt = events.findIndex((event) => event.type === "status" && event.message === "budget_reached");

    await sendAndReplay(chat, "Read a and b.", events.slice(0, pausedAt + 1), {
      endStream: false,
      onEvent: async (_event, index) => {
        if (index !== pausedAt) return;
        await chat.settle(() =>
          fireEvent.click(within(budgetCard(chat)!).getByRole("button", { name: "Stop" })),
        );
      },
    });

    expect(chat.network.requestsMatching("POST", /stop/).length).toBeGreaterThan(0);
    expect(budgetCard(chat)).toBeNull();
  });

  it("a conversation loaded while paused brings its card back (pendingBudget) — the goal's budget raised on the goal", async () => {
    const persisted = new Map<string, unknown>([
      [
        "conv-paused",
        {
          id: "conv-paused",
          title: "Paused turn",
          project: "coding",
          updatedAt: "2026-09-22T11:59:00.000Z",
          displayMessages: [{ role: "user", content: "Keep reading", timestamp: "2026-09-22T11:58:00.000Z" }],
          pendingBudget: {
            isPending: true,
            pauseId: "pause-goal",
            spentDollars: 2,
            maxCostDollars: 1.5,
            limitedBy: "goal",
            turnCapDollars: null,
            goalMaxCostDollars: 2.5,
            iteration: 2,
            since: "2026-09-22T11:59:00.000Z",
          },
        },
      ],
    ]);
    const chat = (harness = await mountChat({ initialConversationId: "conv-paused" }, { persisted }));
    chat.network.on("PATCH", /^\/conversations\/conv-paused\/goal$/, (request) => ({
      goal: { budget: (request.body as { budget: unknown }).budget },
      budgetPause: { status: "raised", pauseId: "pause-goal", maxCostDollars: 8.5, spentDollars: 2, delivered: true },
    }));
    await chat.settle();

    const card = budgetCard(chat);
    expect(card, "the loaded conversation shows its pause").not.toBeNull();
    expect(visibleText(card!)).toContain("all of the $1.50 left in the goal's $2.50 budget");
    const input = within(card!).getByLabelText("New goal budget in dollars");
    await chat.settle(() => fireEvent.change(input, { target: { value: "10" } }));
    await chat.settle(() => fireEvent.click(within(card!).getByRole("button", { name: "Raise budget" })));

    expect(requestBodies(chat, "PATCH", /^\/conversations\/conv-paused\/goal$/)).toEqual([
      { budget: { maxCostDollars: 10 } },
    ]);
    expect(requestBodies(chat, "PATCH", BUDGET_PATCH)).toEqual([]);
    expect(budgetCard(chat)).toBeNull();
  });

  it("a viewer of a turn driven elsewhere gets the card from the live socket, and loses it on budget_resolved", async () => {
    const persisted = new Map<string, unknown>([
      [
        "conv-live",
        {
          id: "conv-live",
          title: "Live turn",
          project: "coding",
          updatedAt: "2026-09-22T11:59:00.000Z",
          displayMessages: [{ role: "user", content: "Earlier question", timestamp: "2026-09-22T11:58:00.000Z" }],
        },
      ],
    ]);
    const chat = (harness = await mountChat(
      { initialConversationId: "conv-live" },
      {
        persisted,
        configureNetwork: (network) => {
          network.on("GET", /^\/conversations\?/, () => ({
            items: [{ id: "conv-live", title: "Live turn", isActive: true, updatedAt: "2026-09-22T11:59:00.000Z" }],
            hasMore: false,
            nextCursor: null,
          }));
        },
      },
    ));
    const socket = chat.latestSocket();
    await chat.settle(() => socket.open());
    await chat.settle(() =>
      socket.receive({ type: "subscribed", conversationId: "conv-live", lastSeq: 0, replayedCount: 0, droppedCount: 0 }),
    );
    const events = loadTranscript("agent-turn-budget-pause.jsonl");
    const pausedAt = events.findIndex((event) => event.type === "status" && event.message === "budget_reached");
    for (const event of events.slice(0, pausedAt + 1)) {
      await chat.settle(() => socket.receive({ ...event, conversationId: "conv-live" }));
    }
    expect(budgetCard(chat), "the viewer shows the pause").not.toBeNull();
    await chat.settle(() => socket.receive({ ...events[pausedAt + 1], conversationId: "conv-live" }));
    expect(budgetCard(chat), "budget_resolved takes it down").toBeNull();
  });
});
