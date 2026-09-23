/* ═══════════════════════════════════════════════════════════════════
   Conversation graph model — pure topology helpers for the Nodes view
   ═══════════════════════════════════════════════════════════════════
   Everything here is keyed through a GraphIndex (id → node, id → edges)
   so the renderer never scans the node list once per edge. */

import type {
  GraphData,
  GraphEdge,
  GraphNode,
  NodeCategory,
  SubAgentTreeNode,
} from "@rodrigo-barraza/utilities-library/graph";

export const PROACTIVE_PENDING_REQUEST_NODE_ID = "request:proactive-pending";
export const PROACTIVE_PENDING_TURN_NODE_ID = "turn:proactive-pending";

export const NODE_COLORS: Record<NodeCategory, string> = {
  project: "oklch(0.72 0.15 120)",
  user: "oklch(0.72 0.14 330)",
  session: "oklch(0.72 0.18 280)",
  agent: "oklch(0.72 0.16 300)",
  subagent: "oklch(0.68 0.14 270)",
  request: "oklch(0.66 0.13 222)",
  tool: "oklch(0.72 0.16 45)",
  turn: "oklch(0.78 0.12 170)",
};

export const NODE_LABELS: Record<NodeCategory, string> = {
  project: "Project",
  user: "User",
  session: "Conversation",
  agent: "Agent",
  subagent: "Sub-Agent",
  request: "Request",
  tool: "Tool",
  turn: "Turn",
};

export const AGENT_DEPTH_COLORS: readonly string[] = [
  "oklch(0.72 0.16 300)",
  "oklch(0.68 0.14 270)",
  "oklch(0.64 0.12 240)",
  "oklch(0.60 0.10 210)",
  "oklch(0.56 0.08 190)",
];

export const FAILED_COLOR = "oklch(0.64 0.21 25)";

export function resolveAgentColorByDepth(depth: number): string {
  return AGENT_DEPTH_COLORS[Math.min(Math.max(depth, 0), AGENT_DEPTH_COLORS.length - 1)];
}

/* ── Node facts ────────────────────────────────────────────────────── */

export function isAgentNode(node: GraphNode): boolean {
  return node.category === "agent" || node.category === "subagent";
}

export function requestToolNames(node: GraphNode): string[] {
  const toolNames = node.metadata?.toolNames;
  return Array.isArray(toolNames) ? (toolNames as string[]) : [];
}

export function isPendingRequest(node: GraphNode): boolean {
  return node.category === "request" && node.metadata?.status === "pending";
}

export function isFailedRequest(node: GraphNode): boolean {
  return node.category === "request" && node.metadata?.success === false;
}

/** The node's own colour, before live/phase tinting. */
export function resolveNodeBaseColor(node: GraphNode): string {
  if (isAgentNode(node)) return resolveAgentColorByDepth(node.depth ?? 0);
  if (node.category === "request" && requestToolNames(node).length > 0) return NODE_COLORS.tool;
  return NODE_COLORS[node.category] ?? NODE_COLORS.request;
}

/** Legend bucket — requests that called tools are drawn (and counted) apart. */
export function resolveLegendKey(node: GraphNode): NodeCategory {
  if (node.category === "request" && requestToolNames(node).length > 0) return "tool";
  return node.category;
}

/* ── Index ─────────────────────────────────────────────────────────── */

export interface GraphIndex {
  nodeById: Map<string, GraphNode>;
  outgoing: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
}

export function edgeKey(edge: Pick<GraphEdge, "source" | "target">): string {
  return `${edge.source}→${edge.target}`;
}

export function buildGraphIndex(graph: Pick<GraphData, "nodes" | "edges">): GraphIndex {
  const nodeById = new Map<string, GraphNode>();
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const node of graph.nodes) nodeById.set(node.id, node);
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge);
  }
  return { nodeById, outgoing, incoming };
}

export function neighborIds(index: GraphIndex, nodeId: string): Set<string> {
  const neighbors = new Set<string>();
  for (const edge of index.outgoing.get(nodeId) ?? []) neighbors.add(edge.target);
  for (const edge of index.incoming.get(nodeId) ?? []) neighbors.add(edge.source);
  return neighbors;
}

/* ── Flows ─────────────────────────────────────────────────────────── */

export interface NodeFlow {
  nodeIds: Set<string>;
  edgeKeys: Set<string>;
}

/** The path that explains a node: everything upstream of it back to the
    project/user roots, plus its immediate downstream (a request's next
    step and what it spawned; an agent's first requests). Roots have no
    meaningful upstream and return null. */
export function computeNodeFlow(index: GraphIndex, nodeId: string): NodeFlow | null {
  const node = index.nodeById.get(nodeId);
  if (!node) return null;
  if (node.category === "project" || node.category === "user") return null;

  const nodeIds = new Set<string>([nodeId]);
  const edgeKeys = new Set<string>();
  const include = (edge: GraphEdge) => {
    if (!index.nodeById.has(edge.source) || !index.nodeById.has(edge.target)) return;
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
    edgeKeys.add(edgeKey(edge));
  };

  const walkUpstream = (startId: string) => {
    const visited = new Set<string>([startId]);
    const queue = [startId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const edge of index.incoming.get(currentId) ?? []) {
        if (visited.has(edge.source) || !index.nodeById.has(edge.source)) continue;
        include(edge);
        visited.add(edge.source);
        queue.push(edge.source);
      }
    }
  };

  const outgoing = index.outgoing.get(nodeId) ?? [];
  const incoming = index.incoming.get(nodeId) ?? [];

  if (node.category === "session") {
    outgoing.forEach(include);
    incoming.forEach(include);
  } else if (isAgentNode(node)) {
    for (const edge of outgoing) {
      if (index.nodeById.get(edge.target)?.category === "request") include(edge);
    }
    walkUpstream(nodeId);
  } else if (node.category === "request" || node.category === "turn") {
    outgoing.forEach(include);
    incoming.forEach(include);
    walkUpstream(nodeId);
  } else {
    incoming.forEach(include);
    walkUpstream(nodeId);
  }

  return { nodeIds, edgeKeys };
}

/** The node the live camera and the flowing edges follow while a turn
    runs: the proactive placeholder, else the newest request, else any
    request still pending. */
export function resolveLiveTargetId(nodes: readonly GraphNode[], isGenerating: boolean): string | null {
  const proactiveNode = nodes.find((node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID);
  if (!isGenerating && !proactiveNode) return null;
  if (proactiveNode) return proactiveNode.id;
  let latestRequest: GraphNode | null = null;
  for (const node of nodes) {
    if (node.category !== "request") continue;
    if (!latestRequest || (node.sequenceNumber ?? 0) > (latestRequest.sequenceNumber ?? 0)) latestRequest = node;
  }
  if (latestRequest) return latestRequest.id;
  return nodes.find(isPendingRequest)?.id ?? null;
}

/** Where the conversation currently ends: the newest main-chain request,
    else the last turn, else the agent. */
export function resolveLatestActivityNode(nodes: readonly GraphNode[]): GraphNode | null {
  let latestRequest: GraphNode | null = null;
  for (const node of nodes) {
    if (node.category !== "request" || ((node.metadata?.agentDepth as number) ?? 0) !== 0) continue;
    if (!latestRequest || (node.sequenceNumber ?? 0) > (latestRequest.sequenceNumber ?? 0)) latestRequest = node;
  }
  return latestRequest
    ?? nodes.filter((node) => node.category === "turn").at(-1)
    ?? nodes.find((node) => node.category === "agent")
    ?? nodes[0]
    ?? null;
}

/* ── Sub-agent tree ────────────────────────────────────────────────── */

function countDescendants(treeNodes: readonly SubAgentTreeNode[]): number {
  let total = 0;
  for (const treeNode of treeNodes) total += 1 + countDescendants(treeNode.children);
  return total;
}

/** Descendant count per agent node that has sub-agents. The root agent is
    not in subAgentTree — its descendants are the whole tree. */
export function buildSubAgentDescendantCounts(
  subAgentTree: readonly SubAgentTreeNode[],
  rootAgentId: string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  const tree = subAgentTree ?? [];
  if (rootAgentId && tree.length > 0) counts.set(rootAgentId, countDescendants(tree));
  const walk = (treeNodes: readonly SubAgentTreeNode[]) => {
    for (const treeNode of treeNodes) {
      if (treeNode.children.length > 0) counts.set(treeNode.nodeId, countDescendants(treeNode.children));
      walk(treeNode.children);
    }
  };
  walk(tree);
  return counts;
}

/** Nodes hidden because an ancestor agent is collapsed: the collapsed
    agent's sub-agents and, transitively, their request chains (an agent
    links only to its FIRST request; later ones chain request→request). */
export function computeHiddenNodeIds(
  graph: Pick<GraphData, "nodes" | "subAgentTree">,
  index: GraphIndex,
  collapsedIds: ReadonlySet<string>,
): Set<string> {
  const hidden = new Set<string>();
  if (collapsedIds.size === 0) return hidden;

  const hideRequestChain = (agentNodeId: string) => {
    const visited = new Set<string>([agentNodeId]);
    const queue = [agentNodeId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const edge of index.outgoing.get(currentId) ?? []) {
        if (visited.has(edge.target)) continue;
        const target = index.nodeById.get(edge.target);
        if (!target || (target.category !== "request" && target.category !== "tool")) continue;
        visited.add(edge.target);
        hidden.add(edge.target);
        queue.push(edge.target);
      }
    }
  };

  const hideDescendants = (treeNodes: readonly SubAgentTreeNode[]) => {
    for (const treeNode of treeNodes) {
      hidden.add(treeNode.nodeId);
      hideRequestChain(treeNode.nodeId);
      hideDescendants(treeNode.children);
    }
  };

  const walkAndCollapse = (treeNodes: readonly SubAgentTreeNode[]) => {
    for (const treeNode of treeNodes) {
      if (collapsedIds.has(treeNode.nodeId)) hideDescendants(treeNode.children);
      else walkAndCollapse(treeNode.children);
    }
  };

  const tree = graph.subAgentTree ?? [];
  const rootAgent = graph.nodes.find((node) => node.category === "agent");
  if (rootAgent && collapsedIds.has(rootAgent.id)) hideDescendants(tree);
  else walkAndCollapse(tree);
  return hidden;
}

/* ── Keyboard navigation ───────────────────────────────────────────── */

export type NavigationKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Next node for an arrow key: up/down within the node's column (nodes
    within 40 px horizontally), left/right to the nearest CONNECTED node
    in the adjacent column. */
export function findNavigationTarget(
  visibleNodes: readonly GraphNode[],
  index: GraphIndex,
  currentNodeId: string,
  key: NavigationKey,
): GraphNode | null {
  const currentNode = visibleNodes.find((node) => node.id === currentNodeId);
  if (!currentNode) return null;

  const columnTolerance = 40;
  const sortedByX = [...visibleNodes].sort((nodeA, nodeB) => nodeA.x - nodeB.x);
  const columns: GraphNode[][] = [];
  let currentColumn: GraphNode[] = [];
  let columnAnchorX = sortedByX[0]?.x ?? 0;
  for (const node of sortedByX) {
    if (currentColumn.length === 0 || Math.abs(node.x - columnAnchorX) <= columnTolerance) {
      currentColumn.push(node);
    } else {
      columns.push(currentColumn.sort((nodeA, nodeB) => nodeA.y - nodeB.y));
      currentColumn = [node];
      columnAnchorX = node.x;
    }
  }
  if (currentColumn.length > 0) columns.push(currentColumn.sort((nodeA, nodeB) => nodeA.y - nodeB.y));

  const columnIndex = columns.findIndex((column) => column.some((node) => node.id === currentNodeId));
  if (columnIndex === -1) return null;

  if (key === "ArrowUp" || key === "ArrowDown") {
    const column = columns[columnIndex];
    const rowIndex = column.findIndex((node) => node.id === currentNodeId);
    return column[rowIndex + (key === "ArrowUp" ? -1 : 1)] ?? null;
  }

  const adjacentColumn = columns[columnIndex + (key === "ArrowLeft" ? -1 : 1)];
  if (!adjacentColumn) return null;
  const connected = neighborIds(index, currentNodeId);
  let bestNode: GraphNode | null = null;
  let bestDistance = Infinity;
  for (const candidate of adjacentColumn) {
    if (!connected.has(candidate.id)) continue;
    const distance = Math.abs(candidate.y - currentNode.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNode = candidate;
    }
  }
  return bestNode;
}
