/**
 * useConversationGraphData.test.tsx
 *
 * The Nodes view's data hook, driven through its real effects with the
 * services mocked:
 *  - a conversation switch clears the previous graph at once (it used to
 *    stay on screen until the new one loaded),
 *  - a rebuild still in flight when the user switches never lands on the
 *    new conversation (its refs used to survive the switch),
 *  - rebuilds send the request fingerprint as the graph cache version,
 *  - dragged (pinned) nodes keep their place; everything else takes the
 *    server layout, and restoreServerLayout releases the pins.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLayoutEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { GraphData, GraphNode } from "@rodrigo-barraza/utilities-library/graph";

const iris = vi.hoisted(() => ({
  getAgentConversation: vi.fn(),
  getConversationRunStats: vi.fn(),
  getConversationRequests: vi.fn(),
  getConversationGraph: vi.fn(),
  getRequest: vi.fn(),
  subscribeCollectionChanges: vi.fn(),
}));
const prism = vi.hoisted(() => ({ getBuiltInToolSchemas: vi.fn() }));

vi.mock("../../services/IrisService", () => ({ default: iris }));
vi.mock("../../services/PrismService", () => ({ default: prism }));

import useConversationGraphData, { graphContentVersion } from "../useConversationGraphData";

type ChangeHandler = (event: Record<string, unknown>) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function graphNode(id: string, x: number, y: number): GraphNode {
  return { id, label: id, category: "request", radius: 24, x, y, velocityX: 0, velocityY: 0, sequenceNumber: 1, metadata: { agentDepth: 0 } };
}

function graphOf(...nodes: GraphNode[]): GraphData {
  return { nodes, edges: [], subAgentTree: [] };
}

const requestRow = (id: string, status = "completed") => ({ _id: id, agentConversationId: "agent-a", status, success: true, toolApiNames: [] });

let changeHandlers: ChangeHandler[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  changeHandlers = [];
  iris.getAgentConversation.mockImplementation(async (id: string) => ({ id }));
  iris.getConversationRunStats.mockResolvedValue({ requestCount: 1 });
  iris.getConversationRequests.mockResolvedValue({ requests: [requestRow("req-1")] });
  iris.getRequest.mockImplementation(async (id: string) => requestRow(id, "pending"));
  iris.subscribeCollectionChanges.mockImplementation(({ onChange }: { onChange: ChangeHandler }) => {
    changeHandlers.push(onChange);
    return { close: vi.fn() };
  });
  prism.getBuiltInToolSchemas.mockResolvedValue([]);
});

/** A request row inserted for `conversationId`, as the change stream sends it. */
function emitRequestInsert(conversationId: string, documentId: string) {
  for (const handler of changeHandlers) {
    handler({ type: "change", collection: "requests", operationType: "insert", documentId, conversationId });
  }
}

describe("useConversationGraphData", () => {
  it("clears the previous conversation's graph the moment the conversation changes", async () => {
    const graphB = deferred<GraphData>();
    iris.getConversationGraph.mockImplementation(async (id: string) =>
      (id === "conv-a" ? graphOf(graphNode("request:a", 800, 160)) : graphB.promise));

    const { result, rerender } = renderHook(({ id }) => useConversationGraphData(id, false), { initialProps: { id: "conv-a" } });
    await waitFor(() => expect(result.current.graphData?.nodes[0].id).toBe("request:a"));

    rerender({ id: "conv-b" });
    expect(result.current.graphData).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => { graphB.resolve(graphOf(graphNode("request:b", 800, 160))); });
    await waitFor(() => expect(result.current.graphData?.nodes[0].id).toBe("request:b"));
  });

  it("never lets a rebuild for the conversation the user left land on the new one", async () => {
    const lateRebuildForA = deferred<GraphData>();
    let conversationAGraphCalls = 0;
    iris.getConversationGraph.mockImplementation(async (id: string) => {
      if (id === "conv-b") return graphOf(graphNode("request:b", 800, 160));
      conversationAGraphCalls += 1;
      return conversationAGraphCalls === 1 ? graphOf(graphNode("request:a", 800, 160)) : lateRebuildForA.promise;
    });

    // Every COMMITTED render (a render React discards is never painted).
    const seen: string[] = [];
    const { result, rerender } = renderHook(({ id }) => {
      const state = useConversationGraphData(id, false);
      const entry = `${id}:${state.graphData?.nodes.map((node) => node.id).join(",") ?? "∅"}`;
      useLayoutEffect(() => { seen.push(entry); });
      return state;
    }, { initialProps: { id: "conv-a" } });
    await waitFor(() => expect(result.current.graphData?.nodes[0].id).toBe("request:a"));

    act(() => { emitRequestInsert("conv-a", "req-2"); });
    await waitFor(() => expect(conversationAGraphCalls).toBe(2));

    rerender({ id: "conv-b" });
    await waitFor(() => expect(result.current.graphData?.nodes[0].id).toBe("request:b"));
    await act(async () => { lateRebuildForA.resolve(graphOf(graphNode("request:a-late", 800, 240))); });

    expect(result.current.graphData?.nodes.map((node) => node.id)).toEqual(["request:b"]);
    expect(seen.filter((entry) => entry.startsWith("conv-b:") && entry.includes("request:a"))).toEqual([]);
  });

  it("sends a fresh version on first load and the rows' fingerprint on a rebuild", async () => {
    iris.getConversationGraph.mockResolvedValue(graphOf(graphNode("request:a", 800, 160)));
    const { result } = renderHook(() => useConversationGraphData("conv-a", false));
    await waitFor(() => expect(result.current.graphData).not.toBeNull());
    expect(iris.getConversationGraph.mock.calls[0][3]).toMatch(/^load-/);

    act(() => { emitRequestInsert("conv-a", "req-2"); });
    await waitFor(() => expect(iris.getConversationGraph).toHaveBeenCalledTimes(2));
    expect(iris.getConversationGraph.mock.calls[1][3]).toBe(
      graphContentVersion([requestRow("req-1"), requestRow("req-2", "pending")] as never),
    );
  });

  it("keeps dragged nodes where the user put them and moves the rest to the server layout", async () => {
    iris.getConversationGraph
      .mockResolvedValueOnce(graphOf(graphNode("request:pinned", 800, 160), graphNode("request:free", 800, 240)))
      .mockResolvedValueOnce(graphOf(graphNode("request:pinned", 800, 160), graphNode("request:free", 800, 320), graphNode("request:new", 800, 400)));
    const { result } = renderHook(() => useConversationGraphData("conv-a", false));
    await waitFor(() => expect(result.current.graphData?.nodes).toHaveLength(2));

    act(() => {
      result.current.setGraphData((previous) => previous && {
        ...previous,
        nodes: previous.nodes.map((node) => ({ ...node, x: node.x + 300, y: node.y + 300 })),
      });
      result.current.setPinnedNodeIds(new Set(["request:pinned"]));
    });
    act(() => { emitRequestInsert("conv-a", "req-2"); });
    await waitFor(() => expect(result.current.graphData?.nodes).toHaveLength(3));

    const positionOf = (nodeId: string) => {
      const node = result.current.graphData!.nodes.find((candidate) => candidate.id === nodeId)!;
      return { x: node.x, y: node.y };
    };
    expect(positionOf("request:pinned")).toEqual({ x: 1100, y: 460 });
    expect(positionOf("request:free")).toEqual({ x: 800, y: 320 });
    expect(result.current.enteringNodeIds.has("request:new")).toBe(true);

    act(() => { result.current.restoreServerLayout(); });
    expect(positionOf("request:pinned")).toEqual({ x: 800, y: 160 });
    expect(result.current.pinnedNodeIds.size).toBe(0);
  });
});

describe("graphContentVersion", () => {
  it("changes when a pending request completes, though the count does not", () => {
    const pending = graphContentVersion([requestRow("req-1", "pending")] as never);
    const completed = graphContentVersion([requestRow("req-1", "completed")] as never);
    expect(pending).not.toBe(completed);
    expect(graphContentVersion([requestRow("req-1", "pending")] as never)).toBe(pending);
  });
});

describe("tool emoji map", () => {
  it("is fetched once per page, and never by an instance with no conversation", async () => {
    vi.resetModules();
    const { default: freshHook } = await import("../useConversationGraphData");
    iris.getConversationGraph.mockResolvedValue(graphOf(graphNode("request:a", 800, 160)));
    prism.getBuiltInToolSchemas.mockResolvedValue([{ name: "read_file", emoji: "📄" }]);

    const idle = renderHook(() => freshHook(null, false));
    expect(prism.getBuiltInToolSchemas).not.toHaveBeenCalled();

    const first = renderHook(() => freshHook("conv-a", false));
    const second = renderHook(() => freshHook("conv-a", false));
    await waitFor(() => expect(first.result.current.toolEmojiMap.get("read_file")).toBe("📄"));
    await waitFor(() => expect(second.result.current.toolEmojiMap.get("read_file")).toBe("📄"));
    expect(prism.getBuiltInToolSchemas).toHaveBeenCalledTimes(1);
    idle.unmount();
  });
});
