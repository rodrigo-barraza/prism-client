/**
 * Characterization: how many transcript rows re-render per streamed token.
 *
 * Opens a long conversation, sends a message and streams chunks one SSE
 * frame at a time, counting message-row renders (utils/chatDebugProbe's
 * `noteMessageRowRender`, called once per row the list renders) and, for
 * information, React commits of the chat tree per token.
 *
 * Today every row renders inline in MessageList's map, and the list
 * re-renders on every `messages` change, so each token re-renders EVERY
 * row once. The assertions are ceilings at that baseline: a refactor may
 * lower them (docs/prompts/26 Landing 3 aims at 0 old rows per token) but
 * not raise them. Commits are not asserted — a real timer (the status
 * bar's ticker) lands an extra one now and then. Baseline numbers:
 * docs/chat-characterization.md.
 *
 * PRISM_ROW_RENDER_MESSAGES / PRISM_ROW_RENDER_TOKENS size the run (defaults
 * 200 / 10 keep it fast); PRISM_ROW_RENDER_REPORT=1 prints the numbers.
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

import { mountChat, transcriptRows, type ChatHarness } from "./chatHarness";

const MESSAGE_COUNT = Number(process.env.PRISM_ROW_RENDER_MESSAGES) || 200;
const TOKEN_COUNT = Number(process.env.PRISM_ROW_RENDER_TOKENS) || 10;
const LONG_CONVERSATION_ID = "conv-long";

let harness: ChatHarness | null = null;
afterEach(() => {
  harness?.unmount();
  harness = null;
});

function longConversation(messageCount: number) {
  const displayMessages = Array.from({ length: messageCount }, (_unused, index) =>
    index % 2 === 0
      ? { role: "user", content: `Question ${index / 2}: what does step ${index / 2} do?` }
      : {
          role: "assistant",
          content: `Step ${(index - 1) / 2} reads the config and **checks the port**.`,
          provider: "anthropic",
          model: "claude-test",
        },
  ).map((message, index) => ({
    ...message,
    timestamp: new Date(Date.UTC(2026, 8, 22, 10, 0, index)).toISOString(),
  }));
  return {
    id: LONG_CONVERSATION_ID,
    title: "A long conversation",
    project: "coding",
    updatedAt: "2026-09-22T11:00:00.000Z",
    displayMessages,
  };
}

describe("row renders per streamed token (characterization)", { timeout: 600_000 }, () => {
  it(`${MESSAGE_COUNT}-message conversation, ${TOKEN_COUNT} tokens`, async () => {
    harness = await mountChat(
      { initialConversationId: LONG_CONVERSATION_ID },
      { persisted: new Map([[LONG_CONVERSATION_ID, longConversation(MESSAGE_COUNT)]]) },
    );
    expect(transcriptRows(harness.view.container)).toHaveLength(MESSAGE_COUNT);

    const nextStream = harness.network.nextStream();
    await harness.typeAndSend("One more question.");
    const stream = await nextStream;
    // The first chunk opens the streaming bubble; count from the second.
    await harness.replay(stream, [{ type: "chunk", content: "Streaming", outputCharacters: 9 }]);

    const perToken: Array<{ rows: number; oldRows: number; commits: number; milliseconds: number }> = [];
    for (let token = 0; token < TOKEN_COUNT; token += 1) {
      harness.rowRenders.reset();
      const commitsBefore = harness.commits.total;
      const started = process.hrtime.bigint();
      await harness.replay(stream, [{ type: "chunk", content: ` t${token}`, outputCharacters: 12 + token * 3 }]);
      const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;
      const oldRows = [...harness.rowRenders.byIndex.entries()]
        .filter(([index]) => index < MESSAGE_COUNT)
        .reduce((sum, [, count]) => sum + count, 0);
      perToken.push({
        rows: harness.rowRenders.total,
        oldRows,
        commits: harness.commits.total - commitsBefore,
        milliseconds,
      });
    }
    await harness.replay(stream, [{ type: "done" }]);

    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const summary = {
      messages: MESSAGE_COUNT,
      tokens: TOKEN_COUNT,
      rowRendersPerToken: mean(perToken.map((token) => token.rows)),
      oldRowRendersPerToken: mean(perToken.map((token) => token.oldRows)),
      commitsPerToken: mean(perToken.map((token) => token.commits)),
      // jsdom wall time, dev React — relative, not a browser frame time.
      millisecondsPerToken: Math.round(mean(perToken.map((token) => token.milliseconds))),
    };
    if (process.env.PRISM_ROW_RENDER_REPORT) {
      process.stdout.write(`\n[row renders] ${JSON.stringify(summary)}\n${JSON.stringify(perToken)}\n`);
    }

    // Ceilings at today's baseline (docs/chat-characterization.md): one
    // list render per token, which renders every row on screen — the old
    // ones, the sent prompt and the streaming reply. A refactor may only
    // lower these.
    const rowsOnScreen = MESSAGE_COUNT + 2;
    expect(summary.rowRendersPerToken).toBeGreaterThan(0);
    expect(summary.oldRowRendersPerToken).toBeLessThanOrEqual(MESSAGE_COUNT);
    expect(summary.rowRendersPerToken).toBeLessThanOrEqual(rowsOnScreen);
  });
});
