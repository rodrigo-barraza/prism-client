/**
 * conversationGraphModel.test.ts
 *
 * Topology helpers behind the Nodes view: the flow a selection lights
 * up, the live target, collapse/hide, keyboard navigation and colour
 * buckets. The graph mirrors the server's shape — a main chain whose #2
 * spawns two sub-agents, one of which spawns a nested sub-agent.
 */

import { describe, it, expect } from "vitest";
import type { GraphData, GraphEdge, GraphNode, NodeCategory } from "@rodrigo-barraza/utilities-library/graph";
import {
  NODE_COLORS,
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  buildGraphIndex,
  buildSubAgentDescendantCounts,
  computeHiddenNodeIds,
  computeNodeFlow,
  edgeKey,
  findNavigationTarget,
  isFailedRequest,
  isPendingRequest,
  resolveLatestActivityNode,
  resolveLegendKey,
  resolveLiveTargetId,
  resolveNodeBaseColor,
} from "../conversationGraphModel";

function makeNode(id: string, category: NodeCategory, x: number, y: number, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, category, radius: 24, x, y, velocityX: 0, velocityY: 0, ...extra };
}

const request = (id: string, sequenceNumber: number, x: number, y: number, agentDepth = 0, metadata: Record<string, unknown> = {}) =>
  makeNode(id, "request", x, y, { sequenceNumber, metadata: { agentDepth, ...metadata } });

const edge = (source: string, target: string): GraphEdge => ({ source, target, strength: 0.5 });

function buildFixture(): GraphData {
  const nodes: GraphNode[] = [
    makeNode("project:p", "project", 80, 80),
    makeNode("user:u", "user", 80, 160),
    makeNode("session:s", "session", 320, 80),
    makeNode("agent:root", "agent", 560, 80, { depth: 0 }),
    makeNode("turn:0", "turn", 800, 80),
    request("request:r1", 1, 800, 160),
    request("request:r2", 2, 800, 240, 0, { toolNames: ["create_subagents"] }),
    request("request:r3", 7, 800, 320),
    makeNode("agent:subA", "subagent", 1040, 240, { depth: 1 }),
    request("request:a1", 3, 1280, 240, 1, { toolNames: ["create_subagent"] }),
    request("request:a2", 5, 1280, 320, 1),
    makeNode("agent:subA1", "subagent", 1520, 240, { depth: 2 }),
    request("request:n1", 6, 1760, 240, 2),
    makeNode("agent:subB", "subagent", 1040, 440, { depth: 1 }),
    request("request:b1", 4, 1280, 440, 1, { success: false }),
  ];
  const edges: GraphEdge[] = [
    edge("project:p", "session:s"),
    edge("user:u", "session:s"),
    edge("session:s", "agent:root"),
    edge("agent:root", "turn:0"),
    edge("turn:0", "request:r1"),
    edge("request:r1", "request:r2"),
    edge("request:r2", "request:r3"),
    edge("request:r2", "agent:subA"),
    edge("agent:subA", "request:a1"),
    edge("request:a1", "request:a2"),
    edge("request:a1", "agent:subA1"),
    edge("agent:subA1", "request:n1"),
    edge("request:r2", "agent:subB"),
    edge("agent:subB", "request:b1"),
  ];
  return {
    nodes,
    edges,
    subAgentTree: [
      { nodeId: "agent:subA", agentConversationId: "subA", children: [{ nodeId: "agent:subA1", agentConversationId: "subA1", children: [] }] },
      { nodeId: "agent:subB", agentConversationId: "subB", children: [] },
    ],
  };
}

describe("computeNodeFlow", () => {
  const graph = buildFixture();
  const index = buildGraphIndex(graph);

  it("lights a sub-agent request's path back to the roots, through its spawner", () => {
    const flow = computeNodeFlow(index, "request:a2")!;
    for (const nodeId of ["request:a2", "request:a1", "agent:subA", "request:r2", "request:r1", "turn:0", "agent:root", "session:s", "project:p", "user:u"]) {
      expect(flow.nodeIds, nodeId).toContain(nodeId);
    }
    expect(flow.edgeKeys).toContain(edgeKey(edge("request:r2", "agent:subA")));
    // A sibling branch is not part of the explanation.
    expect(flow.nodeIds).not.toContain("agent:subB");
    expect(flow.nodeIds).not.toContain("request:b1");
  });

  it("includes a request's immediate downstream — its next step and what it spawned", () => {
    const flow = computeNodeFlow(index, "request:r2")!;
    expect(flow.nodeIds).toContain("request:r3");
    expect(flow.nodeIds).toContain("agent:subA");
    expect(flow.nodeIds).toContain("agent:subB");
    expect(flow.nodeIds).not.toContain("request:a1");
  });

  it("returns null for the project and user roots", () => {
    expect(computeNodeFlow(index, "project:p")).toBeNull();
    expect(computeNodeFlow(index, "user:u")).toBeNull();
    expect(computeNodeFlow(index, "missing")).toBeNull();
  });
});

describe("resolveLiveTargetId", () => {
  it("prefers the proactive placeholder, then the newest request, and is null when idle", () => {
    const graph = buildFixture();
    expect(resolveLiveTargetId(graph.nodes, false)).toBeNull();
    // Highest sequence wins, whatever its depth.
    expect(resolveLiveTargetId(graph.nodes, true)).toBe("request:r3");

    const withPlaceholder = [...graph.nodes, request(PROACTIVE_PENDING_REQUEST_NODE_ID, 8, 800, 400)];
    expect(resolveLiveTargetId(withPlaceholder, true)).toBe(PROACTIVE_PENDING_REQUEST_NODE_ID);
    // The placeholder outlives generation until real requests land.
    expect(resolveLiveTargetId(withPlaceholder, false)).toBe(PROACTIVE_PENDING_REQUEST_NODE_ID);
  });
});

describe("resolveLatestActivityNode", () => {
  it("is the newest MAIN-chain request, not a sub-agent's higher sequence", () => {
    const graph = buildFixture();
    graph.nodes.push(request("request:a9", 99, 1280, 400, 1));
    expect(resolveLatestActivityNode(graph.nodes)?.id).toBe("request:r3");
  });

  it("falls back to the last turn, then the agent", () => {
    const nodes = [makeNode("agent:root", "agent", 0, 0), makeNode("turn:0", "turn", 0, 80), makeNode("turn:1", "turn", 0, 160)];
    expect(resolveLatestActivityNode(nodes)?.id).toBe("turn:1");
    expect(resolveLatestActivityNode([nodes[0]])?.id).toBe("agent:root");
  });
});

describe("sub-agent collapse", () => {
  const graph = buildFixture();
  const index = buildGraphIndex(graph);

  it("counts every descendant for the root agent and each parent sub-agent", () => {
    const counts = buildSubAgentDescendantCounts(graph.subAgentTree, "agent:root");
    expect(counts.get("agent:root")).toBe(3);
    expect(counts.get("agent:subA")).toBe(1);
    expect(counts.has("agent:subB")).toBe(false);
  });

  it("collapsing the root agent hides every sub-agent and its whole request chain", () => {
    const hidden = computeHiddenNodeIds(graph, index, new Set(["agent:root"]));
    expect([...hidden].sort()).toEqual([
      "agent:subA", "agent:subA1", "agent:subB",
      "request:a1", "request:a2", "request:b1", "request:n1",
    ]);
  });

  it("collapsing a sub-agent hides only its descendants, not itself or its own chain", () => {
    const hidden = computeHiddenNodeIds(graph, index, new Set(["agent:subA"]));
    expect([...hidden].sort()).toEqual(["agent:subA1", "request:n1"]);
  });

  it("hides nothing when nothing is collapsed", () => {
    expect(computeHiddenNodeIds(graph, index, new Set()).size).toBe(0);
  });
});

describe("findNavigationTarget", () => {
  const graph = buildFixture();
  const index = buildGraphIndex(graph);

  it("moves up and down within a column", () => {
    expect(findNavigationTarget(graph.nodes, index, "request:r1", "ArrowDown")?.id).toBe("request:r2");
    expect(findNavigationTarget(graph.nodes, index, "request:r1", "ArrowUp")?.id).toBe("turn:0");
    expect(findNavigationTarget(graph.nodes, index, "turn:0", "ArrowUp")).toBeNull();
  });

  it("moves sideways only to a CONNECTED node, the nearest by row", () => {
    expect(findNavigationTarget(graph.nodes, index, "request:r2", "ArrowRight")?.id).toBe("agent:subA");
    // r3 has no neighbour in the sub-agent column.
    expect(findNavigationTarget(graph.nodes, index, "request:r3", "ArrowRight")).toBeNull();
    expect(findNavigationTarget(graph.nodes, index, "agent:subB", "ArrowLeft")?.id).toBe("request:r2");
  });
});

describe("node facts", () => {
  it("draws and counts requests that called tools apart from plain ones", () => {
    const graph = buildFixture();
    const withTools = graph.nodes.find((node) => node.id === "request:r2")!;
    const plain = graph.nodes.find((node) => node.id === "request:r1")!;
    expect(resolveLegendKey(withTools)).toBe("tool");
    expect(resolveNodeBaseColor(withTools)).toBe(NODE_COLORS.tool);
    expect(resolveLegendKey(plain)).toBe("request");
    expect(resolveNodeBaseColor(plain)).toBe(NODE_COLORS.request);
  });

  it("reads pending and failed from the server's status and success fields", () => {
    expect(isPendingRequest(request("r", 1, 0, 0, 0, { status: "pending" }))).toBe(true);
    expect(isPendingRequest(request("r", 1, 0, 0, 0, { status: "completed" }))).toBe(false);
    expect(isFailedRequest(request("r", 1, 0, 0, 0, { success: false }))).toBe(true);
    expect(isFailedRequest(request("r", 1, 0, 0, 0, { success: null }))).toBe(false);
  });
});
