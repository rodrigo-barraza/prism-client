/**
 * conversationGraphPendingChain.test.ts
 *
 * Regression tests for the proactive pending-chain helpers:
 *  - the pending node must always chain off the MAIN agent chain (depth 0),
 *    never a sub-agent request that happens to hold the highest global
 *    sequence number during an orchestrator run
 *  - the turn boundary node must be included ahead of the pending request
 *    on subsequent turns, and survive graph rebuild re-injection
 *  - new-request detection must be snapshot-based (IDs), not count-based,
 *    so a request that lands before the bootstrap graph loads still counts
 *    as new for the current generation cycle
 */

import { describe, it, expect } from "vitest";
import {
  buildPendingChainAdditions,
  hasNewRequestNodesSince,
} from "../useConversationGraphData";
import {
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  PROACTIVE_PENDING_TURN_NODE_ID,
} from "../../components/ChatConversationGraphComponent";
import type { GraphData, GraphNode } from "@rodrigo-barraza/utilities-library/graph";

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, "id" | "category">): GraphNode {
  return {
    label: overrides.id,
    radius: 24,
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  } as GraphNode;
}

function makeGraph(nodes: GraphNode[], edges: GraphData["edges"] = []): GraphData {
  return { nodes, edges, subAgentTree: [] };
}

describe("buildPendingChainAdditions", () => {
  it("chains the pending node to the last MAIN-chain request, not a sub-agent request", () => {
    const graph = makeGraph([
      makeNode({ id: "agent:root:omni", category: "agent", x: 200, y: 300 }),
      makeNode({ id: "request:main-1", category: "request", sequenceNumber: 1, metadata: { agentDepth: 0 }, x: 400, y: 300 }),
      // Sub-agent requests hold the highest global sequence numbers
      makeNode({ id: "request:sub-2", category: "request", sequenceNumber: 2, metadata: { agentDepth: 1 }, x: 600, y: 500 }),
      makeNode({ id: "request:sub-3", category: "request", sequenceNumber: 3, metadata: { agentDepth: 1 }, x: 600, y: 560 }),
    ]);

    const additions = buildPendingChainAdditions(graph, false);

    expect(additions.nodes).toHaveLength(1);
    expect(additions.nodes[0].id).toBe(PROACTIVE_PENDING_REQUEST_NODE_ID);
    // Sequence number stays global (max across all requests + 1)
    expect(additions.nodes[0].sequenceNumber).toBe(4);
    // But the edge anchors to the main chain's tail, not request:sub-3
    expect(additions.edges).toEqual([
      { source: "request:main-1", target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 },
    ]);
    // Positioned relative to the main-chain tail
    expect(additions.nodes[0].x).toBe(400);
  });

  it("falls back to the agent node when no main-chain requests exist", () => {
    const graph = makeGraph([
      makeNode({ id: "agent:root:omni", category: "agent", x: 200, y: 300 }),
    ]);

    const additions = buildPendingChainAdditions(graph, false);

    expect(additions.nodes[0].sequenceNumber).toBe(1);
    expect(additions.edges).toEqual([
      { source: "agent:root:omni", target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 },
    ]);
  });

  it("includes a turn boundary node ahead of the pending request when requested", () => {
    const graph = makeGraph([
      makeNode({ id: "agent:root:omni", category: "agent", x: 200, y: 300 }),
      makeNode({ id: "turn:0", category: "turn", x: 300, y: 300 }),
      makeNode({ id: "request:main-1", category: "request", sequenceNumber: 1, metadata: { agentDepth: 0 }, x: 400, y: 300 }),
    ], [
      { source: "turn:0", target: "request:main-1", strength: 0.5 },
    ]);

    const additions = buildPendingChainAdditions(graph, true);

    expect(additions.nodes.map((node) => node.id)).toEqual([
      PROACTIVE_PENDING_TURN_NODE_ID,
      PROACTIVE_PENDING_REQUEST_NODE_ID,
    ]);
    // One real turn exists, so the proactive turn is "Turn 2"
    expect(additions.nodes[0].label).toBe("Turn 2");
    expect(additions.nodes[0].metadata?.turnIndex).toBe(1);
    expect(additions.edges).toEqual([
      { source: "request:main-1", target: PROACTIVE_PENDING_TURN_NODE_ID, strength: 0.5 },
      { source: PROACTIVE_PENDING_TURN_NODE_ID, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 },
    ]);
  });

  it("prefers a trailing turn node without request children as the chain tail", () => {
    const graph = makeGraph([
      makeNode({ id: "agent:root:omni", category: "agent", x: 200, y: 300 }),
      makeNode({ id: "request:main-1", category: "request", sequenceNumber: 1, metadata: { agentDepth: 0 }, x: 400, y: 300 }),
      makeNode({ id: "turn:1", category: "turn", x: 400, y: 380 }),
    ], [
      { source: "request:main-1", target: "turn:1", strength: 0.5 },
    ]);

    const additions = buildPendingChainAdditions(graph, false);

    expect(additions.edges).toEqual([
      { source: "turn:1", target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 },
    ]);
  });
});

describe("hasNewRequestNodesSince", () => {
  it("treats every request as new when the baseline is empty (pre-bootstrap generation start)", () => {
    const nodes = [
      makeNode({ id: "request:first", category: "request", sequenceNumber: 1 }),
    ];
    expect(hasNewRequestNodesSince(nodes, new Set())).toBe(true);
  });

  it("ignores requests captured in the baseline snapshot", () => {
    const nodes = [
      makeNode({ id: "request:old", category: "request", sequenceNumber: 1 }),
    ];
    expect(hasNewRequestNodesSince(nodes, new Set(["request:old"]))).toBe(false);
  });

  it("never counts the proactive pending node as a new request", () => {
    const nodes = [
      makeNode({ id: PROACTIVE_PENDING_REQUEST_NODE_ID, category: "request", sequenceNumber: 2 }),
    ];
    expect(hasNewRequestNodesSince(nodes, new Set())).toBe(false);
  });

  it("ignores non-request node categories", () => {
    const nodes = [
      makeNode({ id: "agent:root:omni", category: "agent" }),
      makeNode({ id: "turn:0", category: "turn" }),
    ];
    expect(hasNewRequestNodesSince(nodes, new Set())).toBe(false);
  });
});
