/** agentStream without a WebSocket URL: the socket transports say so instead of failing silently. */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  PRISM_SERVICE_URL: "http://prism.test",
  PRISM_WEBSOCKET_URL: undefined,
}));

import { followTurn, liveSocketUrl, watchConversation, type AgentStreamItem } from "../agentStream";

describe("agentStream without a WebSocket URL", () => {
  it("reports the unconfigured state, and a follow ends at once", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(liveSocketUrl()).toBeNull();

    const viewer = watchConversation("conv-1");
    const iterator = viewer[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ kind: "connection", state: "unconfigured" });
    viewer.close();
    expect((await iterator.next()).done).toBe(true);

    const recovery = followTurn("conv-1", { isTurnRunning: async () => true, timeoutMilliseconds: 1_000 });
    const items: AgentStreamItem[] = [];
    for await (const item of recovery) items.push(item);
    await expect(recovery.outcome).resolves.toBe("unconfigured");
    expect(items).toEqual([{ kind: "connection", state: "unconfigured" }]);
  });
});
