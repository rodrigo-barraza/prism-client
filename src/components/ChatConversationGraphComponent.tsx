"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import useConversationGraphData from "../hooks/useConversationGraphData";
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronDown,
  ChevronRight,
  Loader2,
  Image as ImageIcon,
  FileText,
  Wrench,
  MessageSquare,
  X,
} from "lucide-react";
import IrisService, {
  type IrisRequestEntry,
} from "../services/IrisService";
import type { AgentConversation, ConversationStats, ToolCallEvent } from "../types/types";
import { cleanModelName } from "./BadgeComponent";
import ProviderLogo, { resolveProviderLabel, resolveProviderLogoKey } from "./ProviderLogosComponent";
import StarfieldComponent from "./StarfieldComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import {
  resolveSubAgentEmoji,
  AGENT_EMOJI,
  CONVERSATION_EMOJI,
  PROJECT_EMOJI,
} from "../utils/subAgentEmojis";
import {
  formatNumber,
  formatCost,
  formatElapsedTime,
  timeAgo as formatTimeAgo,
} from "@rodrigo-barraza/utilities-library";
import { AGENT_IDS, TOPOLOGIES, DEFAULT_TOPOLOGY, DEFAULT_USERNAME } from "@rodrigo-barraza/utilities-library/taxonomy";

import graphStyles from "./ConversationGraphPageComponent.module.css";
import styles from "./ChatConversationGraphComponent.module.css";

/* ═══════════════════════════════════════════════════════════════════
   Node Graph Data Structures (mirrored from ConversationGraphPageComponent)
   ═══════════════════════════════════════════════════════════════════ */

export type NodeCategory =
  | "session"
  | "tool"
  | "request"
  | "user"
  | "project"
  | "agent"
  | "subagent"
  | "turn";

export interface GraphNode {
  id: string;
  label: string;
  category: NodeCategory;
  radius: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  sequenceNumber?: number;
  metadata?: Record<string, unknown>;
  depth?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  strength?: number;
  isCurved?: boolean;
}

interface SubAgentTreeNode {
  nodeId: string;
  agentConversationId: string;
  children: SubAgentTreeNode[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  subAgentTree: SubAgentTreeNode[];
}

const NODE_COLORS: Record<NodeCategory, string> = {
  project: "oklch(0.72 0.15 120)",
  user: "oklch(0.72 0.14 330)",
  session: "oklch(0.72 0.18 280)",
  agent: "oklch(0.72 0.16 300)",
  subagent: "oklch(0.68 0.14 270)",
  request: "oklch(0.65 0.12 220)",
  tool: "oklch(0.72 0.16 45)",
  turn: "oklch(0.78 0.12 170)",
};

export const PROACTIVE_PENDING_REQUEST_NODE_ID = "request:proactive-pending";
export const PROACTIVE_PENDING_TURN_NODE_ID = "turn:proactive-pending";

const AGENT_DEPTH_COLORS: string[] = [
  "oklch(0.72 0.16 300)",
  "oklch(0.68 0.14 270)",
  "oklch(0.64 0.12 240)",
  "oklch(0.60 0.10 210)",
  "oklch(0.56 0.08 190)",
];

function resolveAgentColorByDepth(depth: number): string {
  return AGENT_DEPTH_COLORS[Math.min(depth, AGENT_DEPTH_COLORS.length - 1)];
}

const NODE_LABELS: Record<NodeCategory, string> = {
  project: "Project",
  user: "User",
  session: "Conversation",
  agent: "Agent",
  subagent: "Sub-Agent",
  request: "Request",
  tool: "Tool",
  turn: "Turn",
};

// Dynamically computes the column tier for a node based on its agent depth.
// The pattern repeats: agent → request → tool → subagent → request → tool → ...
// Depth 0 (root agent): agent=2, request=3, tool=4
// Depth N (sub-agent):  subagent=2+N*3, request=3+N*3, tool=4+N*3
function computeNodeTier(node: GraphNode): number {
  switch (node.category) {
    case "project":
    case "user":
      return 0;
    case "session":
      return 1;
    case "agent":
      return 2;
    case "subagent": {
      const subagentDepth = node.depth ?? 1;
      return 2 + subagentDepth * 3;
    }
    case "turn":
      return 3;
    case "request": {
      const requestAgentDepth = (node.metadata?.agentDepth as number) ?? 0;
      return 3 + requestAgentDepth * 3;
    }
    case "tool": {
      const toolAgentDepth = (node.metadata?.agentDepth as number) ?? 0;
      return 4 + toolAgentDepth * 3;
    }
    default:
      return 3;
  }
}

function straightEdgePath(
  sourceX: number,
  sourceY: number,
  sourceRadius: number,
  targetX: number,
  targetY: number,
  targetRadius: number,
): string {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1;

  const unitX = deltaX / distance;
  const unitY = deltaY / distance;

  const startX = sourceX + unitX * sourceRadius;
  const startY = sourceY + unitY * sourceRadius;
  const endX = targetX - unitX * targetRadius;
  const endY = targetY - unitY * targetRadius;

  return `M ${startX} ${startY} L ${endX} ${endY}`;
}

function curvedEdgePath(
  sourceX: number,
  sourceY: number,
  sourceRadius: number,
  targetX: number,
  targetY: number,
  targetRadius: number,
): string {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1;

  const unitX = deltaX / distance;
  const unitY = deltaY / distance;

  const startX = sourceX + unitX * sourceRadius;
  const startY = sourceY + unitY * sourceRadius;
  const endX = targetX - unitX * targetRadius;
  const endY = targetY - unitY * targetRadius;

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const curvatureOffset = distance * 0.15;
  const controlX = midX + (-unitY) * curvatureOffset;
  const controlY = midY + unitX * curvatureOffset;

  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

export function buildGraphFromConversation(
  conversation: AgentConversation,
  conversationStats: ConversationStats | null,
  conversationRequests: IrisRequestEntry[],
): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIdSet = new Set<string>();
  const edgeKeySet = new Set<string>();

  const addNode = (
    id: string,
    label: string,
    category: NodeCategory,
    radius: number,
    metadata?: Record<string, unknown>,
    sequenceNumber?: number,
    depth?: number,
  ) => {
    if (nodeIdSet.has(id)) return;
    nodeIdSet.add(id);
    nodes.push({ id, label, category, radius, x: 0, y: 0, velocityX: 0, velocityY: 0, metadata, sequenceNumber, depth });
  };

  const addEdge = (source: string, target: string, strength = 1, isCurved = false) => {
    const edgeKey = `${source}→${target}`;
    if (edgeKeySet.has(edgeKey)) return;
    edgeKeySet.add(edgeKey);
    edges.push({ source, target, strength, isCurved });
  };

  const conversationId = conversation.id || conversation._id;
  const conversationNodeId = `session:${conversationId}`;

  addNode(conversationNodeId, conversation.title || "Conversation", "session", 24, {
    conversationId,
    status: conversation.status,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    totalCost: conversationStats?.totalCost,
    requestCount: conversationStats?.requestCount,
    totalTokens: conversationStats?.totalTokens,
    totalElapsedTime: conversationStats?.totalElapsedTime,
  });

  if (conversation.project) {
    const projectNodeId = `project:${conversation.project}`;
    addNode(projectNodeId, conversation.project, "project", 24, { project: conversation.project });
    addEdge(projectNodeId, conversationNodeId, 0.8);
  }

  let mainAgentConversationId = conversationId;
  // Pick the first agentConversationId that has no parent as the canonical main agent ID.
  // Sub-agent detection does NOT rely on comparing agentConversationId values — it uses
  // parentAgentConversationId as the authoritative signal. This avoids false positives
  // when multi-turn conversations generate a different agentConversationId per turn.
  for (const request of conversationRequests) {
    if (!request.parentAgentConversationId && request.agentConversationId) {
      mainAgentConversationId = request.agentConversationId;
      break;
    }
  }

  const parentAgentNodeId = conversation.agent
    ? `agent:${mainAgentConversationId}:${conversation.agent}`
    : `agent:${mainAgentConversationId}:default`;
  if (conversation.agent) {
    addNode(parentAgentNodeId, conversation.agent, "agent", 24, { agent: conversation.agent, depth: 0 }, undefined, 0);
  } else {
    addNode(parentAgentNodeId, "Default Agent", "agent", 24, { agent: "default", depth: 0 }, undefined, 0);
  }
  addEdge(conversationNodeId, parentAgentNodeId, 0.9);

  const userSet = new Set<string>();

  const sortedRequests = [...conversationRequests].sort((requestA, requestB) => {
    const timestampA = requestA.timestamp ? new Date(requestA.timestamp).getTime() : 0;
    const timestampB = requestB.timestamp ? new Date(requestB.timestamp).getTime() : 0;
    return timestampA - timestampB;
  });

  // First pass: discover all sub-agent nodes and their parent relationships.
  // An agentConversationId is a sub-agent if ANY request with that ID has parentAgentConversationId set.
  const subAgentParentMap = new Map<string, string>();
  const subAgentNodeIdList: string[] = [];
  const knownSubAgentConversationIds = new Set<string>();

  for (const request of sortedRequests) {
    const requestAgentConversationId = request.agentConversationId || mainAgentConversationId;
    const isSubAgent = !!request.parentAgentConversationId;

    if (isSubAgent) {
      knownSubAgentConversationIds.add(requestAgentConversationId);
      if (!subAgentParentMap.has(requestAgentConversationId)) {
        subAgentParentMap.set(requestAgentConversationId, request.parentAgentConversationId!);
      }
    }
  }

  // Collect ALL agentConversationId values belonging to the main agent.
  // Multi-turn conversations generate a new agentConversationId per turn, but they
  // all represent the same top-level agent. Sub-agents reference the specific turn ID
  // as their parentAgentConversationId, so we must recognize all of them.
  // Exclude IDs that are known sub-agents (some sub-agent requests may lack
  // parentAgentConversationId due to server-side logging inconsistencies).
  const mainAgentConversationIds = new Set<string>([mainAgentConversationId]);
  for (const request of conversationRequests) {
    if (request.agentConversationId && !knownSubAgentConversationIds.has(request.agentConversationId)) {
      mainAgentConversationIds.add(request.agentConversationId);
    }
  }

  // Normalize parent references: if a sub-agent's parent is any main agent turn ID,
  // collapse it to the canonical mainAgentConversationId so tree traversal works.
  // Also build the node ID mapping and sub-agent node list.
  const agentConversationIdToNodeId = new Map<string, string>();
  for (const mainId of mainAgentConversationIds) {
    agentConversationIdToNodeId.set(mainId, parentAgentNodeId);
  }

  for (const [subAgentId, rawParentId] of subAgentParentMap) {
    const requestAgentConversationId = subAgentId;
    const matchingRequest = sortedRequests.find(
      (request) => request.agentConversationId === requestAgentConversationId && request.parentAgentConversationId,
    );
    const currentAgentNodeId = `agent:${requestAgentConversationId}:${matchingRequest?.agent || AGENT_IDS.OMNI}`;
    agentConversationIdToNodeId.set(requestAgentConversationId, currentAgentNodeId);
    const normalizedParentId = mainAgentConversationIds.has(rawParentId) ? mainAgentConversationId : rawParentId;
    subAgentParentMap.set(requestAgentConversationId, normalizedParentId);
    subAgentNodeIdList.push(currentAgentNodeId);
  }

  // Compute depth for each sub-agent by walking up the parent chain
  const subAgentDepthMap = new Map<string, number>();
  const computeDepth = (agentConversationId: string): number => {
    if (mainAgentConversationIds.has(agentConversationId)) return 0;
    if (subAgentDepthMap.has(agentConversationId)) return subAgentDepthMap.get(agentConversationId)!;
    const parentConversationId = subAgentParentMap.get(agentConversationId) || mainAgentConversationId;
    const depth = computeDepth(parentConversationId) + 1;
    subAgentDepthMap.set(agentConversationId, depth);
    return depth;
  };

  for (const agentConversationId of subAgentParentMap.keys()) {
    computeDepth(agentConversationId);
  }

  // Second pass: create nodes and edges for all requests.
  // Track the last request node per agent context for sequential chaining.
  const lastRequestNodeIdPerAgentContext = new Map<string, string>();

  // Extract user messages from the conversation for turn boundary labels.
  // Each user message corresponds to a new turn in the main agent context.
  const userMessages = conversation.messages
    ?.filter((message) => message.role === "user")
    .map((message) => {
      const messageText = (message.content || "").trim();
      return messageText.length > 30 ? `${messageText.slice(0, 28)}…` : messageText || "user message";
    }) ?? [];

  // Track turns: detect when agentConversationId changes for the main agent
  let currentMainAgentConversationId: string | null = null;
  let mainAgentTurnIndex = 0;

  for (let requestIndex = 0; requestIndex < sortedRequests.length; requestIndex++) {
    const request = sortedRequests[requestIndex];
    const sequenceNumber = requestIndex + 1;
    const operationLabel = request.operation || "unknown";
    const requestNodeId = `request:${request._id || requestIndex}`;
    const requestAgentConversationId = request.agentConversationId || mainAgentConversationId;
    // Use the consolidated sub-agent set rather than per-request parentAgentConversationId,
    // since some sub-agent requests lack parentAgentConversationId due to logging inconsistencies.
    const isSubAgent = knownSubAgentConversationIds.has(requestAgentConversationId);
    const agentDepth = isSubAgent ? (subAgentDepthMap.get(requestAgentConversationId) || 1) : 0;

    // Insert a turn boundary node when the main agent's agentConversationId changes.
    // This visually segments multi-turn conversations with user message nodes.
    if (!isSubAgent && requestAgentConversationId !== currentMainAgentConversationId) {
      currentMainAgentConversationId = requestAgentConversationId;

      const turnNodeId = `turn:${mainAgentTurnIndex}`;
      const turnLabel = userMessages[mainAgentTurnIndex] || `Turn ${mainAgentTurnIndex + 1}`;
      addNode(turnNodeId, turnLabel, "turn", 24, {
        turnIndex: mainAgentTurnIndex,
        agentConversationId: requestAgentConversationId,
      });

      // Chain: previous_request → turn_node (or agent → turn_node for the first turn)
      const previousRequestNodeId = lastRequestNodeIdPerAgentContext.get("__main_agent__");
      if (previousRequestNodeId) {
        addEdge(previousRequestNodeId, turnNodeId, 0.5);
      } else {
        addEdge(parentAgentNodeId, turnNodeId, 0.6);
      }

      // The turn node becomes the "last node" so the next request chains from it
      lastRequestNodeIdPerAgentContext.set("__main_agent__", turnNodeId);
      mainAgentTurnIndex++;
    }

    // Deduplicate tool names for this request (preserving order)
    const uniqueToolNames = request.toolApiNames
      ? [...new Set(request.toolApiNames)]
      : [];

    addNode(requestNodeId, `#${sequenceNumber} ${operationLabel}`, "request", 24, {
      operation: operationLabel,
      estimatedCost: request.estimatedCost,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      duration: request.duration,
      timestamp: request.timestamp,
      status: request.status,
      requestId: request.requestId || request._id,
      model: request.model || null,
      provider: request.provider || null,
      agentDepth,
      toolNames: uniqueToolNames,
    }, sequenceNumber);

    const currentAgentNodeId = isSubAgent
      ? `agent:${requestAgentConversationId}:${request.agent || AGENT_IDS.OMNI}`
      : parentAgentNodeId;

    if (isSubAgent) {
      const subAgentLabel = request.agent || AGENT_IDS.OMNI;
      const agentDepth = subAgentDepthMap.get(requestAgentConversationId) || 1;
      addNode(currentAgentNodeId, subAgentLabel, "subagent", 24, {
        agent: subAgentLabel,
        isSubagent: true,
        parentAgentConversationId: request.parentAgentConversationId || mainAgentConversationId,
        agentConversationId: requestAgentConversationId,
        depth: agentDepth,
      }, undefined, agentDepth);
    }

    // Trace-tree DAG edge topology: agent → first request → req2 → req3 → ...
    // Each agent context (main agent or individual sub-agent) connects to its
    // first request only. Subsequent requests chain to the previous one in the
    // same context, creating a clean causal flow without redundant hub-and-spoke edges.
    const agentContextKey = isSubAgent ? requestAgentConversationId : "__main_agent__";
    const previousRequestNodeId = lastRequestNodeIdPerAgentContext.get(agentContextKey);

    if (!previousRequestNodeId) {
      addEdge(currentAgentNodeId, requestNodeId, 0.6);
    } else {
      addEdge(previousRequestNodeId, requestNodeId, 0.5);
    }
    lastRequestNodeIdPerAgentContext.set(agentContextKey, requestNodeId);

    if (request.username && request.username !== DEFAULT_USERNAME && request.username !== "system") {
      userSet.add(request.username);
    }
  }

  for (const userName of userSet) {
    const userNodeId = `user:${userName}`;
    addNode(userNodeId, userName, "user", 24, { username: userName });
    addEdge(userNodeId, conversationNodeId, 0.5);
  }

  // Build the sub-agent tree from parentAgentConversationId hierarchy
  const buildSubAgentTree = (parentConversationId: string, visitedIds: Set<string>): SubAgentTreeNode[] => {
    const children: SubAgentTreeNode[] = [];
    for (const [childConversationId, childParentId] of subAgentParentMap.entries()) {
      if (childParentId === parentConversationId && !visitedIds.has(childConversationId)) {
        const childNodeId = agentConversationIdToNodeId.get(childConversationId);
        if (childNodeId) {
          const nextVisited = new Set(visitedIds);
          nextVisited.add(childConversationId);
          children.push({
            nodeId: childNodeId,
            agentConversationId: childConversationId,
            children: buildSubAgentTree(childConversationId, nextVisited),
          });
        }
      }
    }
    return children;
  };

  const subAgentTree = buildSubAgentTree(mainAgentConversationId, new Set([mainAgentConversationId]));

  // Create edges based on the tree structure.
  // Instead of parent_agent → sub_agent, connect the create_team tool → sub_agent.
  // This places sub-agents after the tool column that spawned them.
  const createTreeEdges = (treeNodes: SubAgentTreeNode[], parentAgentConvId: string) => {
    for (const treeNode of treeNodes) {
      // Find the create_team tool node in the parent agent's requests that spawned this sub-agent.
      // When the parent is the main agent, include requests from ALL main agent turn IDs
      // since the server generates a new agentConversationId per turn.
      const isParentMainAgent = mainAgentConversationIds.has(parentAgentConvId);
      const parentAgentRequests = sortedRequests.filter((sortedRequest) => {
        const sortedRequestConvId = sortedRequest.agentConversationId || mainAgentConversationId;
        const sortedRequestIsSubAgent = knownSubAgentConversationIds.has(sortedRequestConvId);
        if (sortedRequestIsSubAgent) {
          return sortedRequestConvId === parentAgentConvId;
        }
        return !sortedRequestIsSubAgent && isParentMainAgent;
      });

      let linkedToTool = false;
      for (const parentRequest of parentAgentRequests) {
        if (parentRequest.toolApiNames?.includes("create_team")) {
          // Link sub-agent from the request node that invoked create_team
          const requestNodeId = `request:${parentRequest._id || sortedRequests.indexOf(parentRequest)}`;
          if (nodeIdSet.has(requestNodeId)) {
            addEdge(requestNodeId, treeNode.nodeId, 0.9, false);
            linkedToTool = true;
            break;
          }
        }
      }

      // Fallback: connect to parent agent node if no create_team tool was found
      if (!linkedToTool) {
        const parentNodeId = agentConversationIdToNodeId.get(parentAgentConvId) || parentAgentNodeId;
        addEdge(parentNodeId, treeNode.nodeId, 0.9, false);
      }

      if (treeNode.children.length > 0) {
        createTreeEdges(treeNode.children, treeNode.agentConversationId);
      }
    }
  };

  const topology = conversation.settings?.agents?.topology || DEFAULT_TOPOLOGY;

  // For topologies that benefit from tree-aware edges, use the reconstructed tree
  if (subAgentTree.length > 0) {
    if (topology === TOPOLOGIES.SEQUENTIAL) {
      const flattenedNodes = flattenSubAgentTree(subAgentTree);
      if (flattenedNodes.length > 0) {
        addEdge(parentAgentNodeId, flattenedNodes[0], 0.9, false);
        for (let index = 1; index < flattenedNodes.length; index++) {
          addEdge(flattenedNodes[index - 1], flattenedNodes[index], 0.9, false);
        }
      }
    } else if (topology === TOPOLOGIES.PEER_TO_PEER) {
      createTreeEdges(subAgentTree, mainAgentConversationId);
      // Add cross-links between direct siblings
      for (let index = 0; index < subAgentTree.length; index++) {
        for (let nextIndex = index + 1; nextIndex < subAgentTree.length; nextIndex++) {
          addEdge(subAgentTree[index].nodeId, subAgentTree[nextIndex].nodeId, 0.4);
        }
      }
    } else if (topology === TOPOLOGIES.CRITIC_LOOP) {
      const flattenedNodes = flattenSubAgentTree(subAgentTree);
      if (flattenedNodes.length > 0) {
        addEdge(parentAgentNodeId, flattenedNodes[0], 0.9, false);
        for (let index = 1; index < flattenedNodes.length; index++) {
          addEdge(flattenedNodes[index - 1], flattenedNodes[index], 0.8, false);
        }
        if (flattenedNodes.length > 1) {
          addEdge(flattenedNodes[flattenedNodes.length - 1], flattenedNodes[0], 0.5, false);
        }
      }
    } else if (topology === TOPOLOGIES.HIERARCHICAL_AGGREGATION) {
      createTreeEdges(subAgentTree, mainAgentConversationId);
      // Add inter-sibling edges at depth 1
      for (let index = 0; index < subAgentTree.length; index++) {
        for (let nextIndex = index + 1; nextIndex < subAgentTree.length; nextIndex++) {
          addEdge(subAgentTree[index].nodeId, subAgentTree[nextIndex].nodeId, 0.4);
        }
      }
    } else {
      // Default: use tree-aware curved edges
      createTreeEdges(subAgentTree, mainAgentConversationId);
    }
  }

  return { nodes, edges, subAgentTree };
}

function flattenSubAgentTree(treeNodes: SubAgentTreeNode[]): string[] {
  const result: string[] = [];
  for (const treeNode of treeNodes) {
    result.push(treeNode.nodeId);
    result.push(...flattenSubAgentTree(treeNode.children));
  }
  return result;
}




function applyHierarchicalLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes, edges: graphEdges } = graphData;
  if (graphNodes.length === 0) return;

  const tierBuckets: Map<number, GraphNode[]> = new Map();
  for (const node of graphNodes) {
    const tier = computeNodeTier(node);
    if (!tierBuckets.has(tier)) tierBuckets.set(tier, []);
    tierBuckets.get(tier)!.push(node);
  }

  // Topologically sort nodes within each tier based on edge topology.
  // This ensures turn boundary nodes are correctly interleaved between
  // their request groups regardless of the node array insertion order.
  const nodeIdSet = new Set(graphNodes.map((node) => node.id));
  for (const [, tierNodes] of tierBuckets) {
    if (tierNodes.length <= 1) continue;

    const tierNodeIds = new Set(tierNodes.map((tierNode) => tierNode.id));
    // Build adjacency within this tier
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();
    for (const tierNode of tierNodes) {
      inDegree.set(tierNode.id, 0);
      outEdges.set(tierNode.id, []);
    }

    for (const edge of graphEdges) {
      if (tierNodeIds.has(edge.source) && tierNodeIds.has(edge.target)) {
        outEdges.get(edge.source)!.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      }
    }

    // Also consider edges from outside the tier to establish ordering.
    // If two tier nodes share a parent in a previous tier, the one whose
    // parent edge appears first in the edge list comes first.
    // More importantly, follow transitive chains: if A → B via edges
    // through intermediate nodes outside this tier, A should precede B.
    const incomingFromOutside = new Map<string, string[]>();
    for (const edge of graphEdges) {
      if (tierNodeIds.has(edge.target) && !tierNodeIds.has(edge.source) && nodeIdSet.has(edge.source)) {
        if (!incomingFromOutside.has(edge.target)) incomingFromOutside.set(edge.target, []);
        incomingFromOutside.get(edge.target)!.push(edge.source);
      }
    }

    // Kahn's algorithm (stable topological sort)
    const sortedNodes: GraphNode[] = [];
    const queue: string[] = [];
    const nodeMap = new Map(tierNodes.map((tierNode) => [tierNode.id, tierNode]));

    for (const tierNode of tierNodes) {
      if ((inDegree.get(tierNode.id) ?? 0) === 0) queue.push(tierNode.id);
    }

    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      sortedNodes.push(nodeMap.get(currentNodeId)!);
      for (const neighborId of (outEdges.get(currentNodeId) ?? [])) {
        const newDegree = (inDegree.get(neighborId) ?? 1) - 1;
        inDegree.set(neighborId, newDegree);
        if (newDegree === 0) queue.push(neighborId);
      }
    }

    // Append any remaining nodes not reached by the sort (disconnected)
    for (const tierNode of tierNodes) {
      if (!sortedNodes.includes(tierNode)) sortedNodes.push(tierNode);
    }

    // Replace tier contents with sorted order
    tierNodes.length = 0;
    tierNodes.push(...sortedNodes);
  }

  // Collect only populated tiers in ascending order so empty columns
  // (e.g. sub-agent depth tiers when no sub-agents exist) are collapsed
  // and downstream columns shift left to fill the gap.
  const populatedTierIndices = [...tierBuckets.keys()].sort((tierA, tierB) => tierA - tierB);
  const totalColumns = populatedTierIndices.length;
  const horizontalSpacing = Math.max(160, (canvasWidth - 100) / Math.max(totalColumns, 1));
  const startX = 80;

  const centerY = canvasHeight / 2;

  for (let columnIndex = 0; columnIndex < populatedTierIndices.length; columnIndex++) {
    const tierNodes = tierBuckets.get(populatedTierIndices[columnIndex])!;
    const tierX = startX + columnIndex * horizontalSpacing;
    // Compute the minimum spacing that prevents node overlap: the
    // largest node radius in this tier × 2 plus collision padding.
    // This guarantees nodes never stack on top of each other even
    // when the viewport is small or the column has many nodes.
    const largestTierRadius = Math.max(...tierNodes.map((tierNode) => tierNode.radius));
    const minimumNodeSpacing = largestTierRadius * 2 + 15;
    const proportionalSpacing = tierNodes.length > 1
      ? (canvasHeight * 0.9) / (tierNodes.length - 1)
      : canvasHeight * 0.9;
    const verticalSpacing = Math.max(minimumNodeSpacing, Math.min(80, proportionalSpacing));
    const totalTierHeight = (tierNodes.length - 1) * verticalSpacing;
    const tierStartY = centerY - totalTierHeight / 2;
    for (let nodeIndex = 0; nodeIndex < tierNodes.length; nodeIndex++) {
      tierNodes[nodeIndex].x = tierX;
      tierNodes[nodeIndex].y = tierStartY + nodeIndex * verticalSpacing;
    }
  }
}

function applySequentialLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes } = graphData;
  if (graphNodes.length === 0) return;

  const projectNode = graphNodes.find((graphNode) => graphNode.category === "project");
  const userNode = graphNodes.find((graphNode) => graphNode.category === "user");
  const sessionNode = graphNodes.find((graphNode) => graphNode.category === "session");
  const mainAgentNode = graphNodes.find((graphNode) => graphNode.category === "agent");
  
  // Root-agent-only request/tool nodes — sub-agent descendants are positioned by positionSubAgentBranch
  const otherNodes = graphNodes.filter((graphNode) => 
    graphNode.category !== "project" && 
    graphNode.category !== "user" && 
    graphNode.category !== "session" && 
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent" &&
    ((graphNode.metadata?.agentDepth as number) ?? 0) === 0
  );

  const centerY = canvasHeight / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  if (mainAgentNode) {
    mainAgentNode.x = 130;
    mainAgentNode.y = centerY;
  }

  const toolCounterByParent = new Map<string, number>();

  for (const node of otherNodes) {
    const edge = graphData.edges.find((edgeCandidate) => edgeCandidate.target === node.id);
    const parentNode = edge ? graphNodes.find((parentNodeCandidate) => parentNodeCandidate.id === edge.source) : null;

    if (parentNode) {
      if (node.category === "request") {
        node.x = parentNode.x;
        node.y = parentNode.y + 70 + (node.sequenceNumber || 1) * 30;
      } else if (node.category === "tool") {
        const toolIndex = toolCounterByParent.get(parentNode.id) || 0;
        toolCounterByParent.set(parentNode.id, toolIndex + 1);
        node.x = parentNode.x - 80 - toolIndex * 30;
        node.y = parentNode.y + (toolIndex % 3) * 35;
      } else {
        node.x = parentNode.x + (Math.random() - 0.5) * 80;
        node.y = parentNode.y + 80;
      }
    } else {
      node.x = Math.random() * canvasWidth;
      node.y = centerY + 100;
    }
  }
}

function applyPeerToPeerLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes } = graphData;
  if (graphNodes.length === 0) return;

  const projectNode = graphNodes.find((graphNode) => graphNode.category === "project");
  const userNode = graphNodes.find((graphNode) => graphNode.category === "user");
  const sessionNode = graphNodes.find((graphNode) => graphNode.category === "session");
  const mainAgentNode = graphNodes.find((graphNode) => graphNode.category === "agent");
  
  const otherNodes = graphNodes.filter((graphNode) => 
    graphNode.category !== "project" && 
    graphNode.category !== "user" && 
    graphNode.category !== "session" && 
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent" &&
    ((graphNode.metadata?.agentDepth as number) ?? 0) === 0
  );

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  if (mainAgentNode) {
    mainAgentNode.x = centerX;
    mainAgentNode.y = centerY;
  }

  const peerToolCounter = new Map<string, number>();

  for (const node of otherNodes) {
    const edge = graphData.edges.find((edgeCandidate) => edgeCandidate.target === node.id);
    const parentNode = edge ? graphNodes.find((parentNodeCandidate) => parentNodeCandidate.id === edge.source) : null;

    if (parentNode) {
      if (node.category === "request") {
        const deltaX = parentNode.x - centerX;
        const deltaY = parentNode.y - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1;
        const unitX = deltaX / distance;
        const unitY = deltaY / distance;
        node.x = parentNode.x + unitX * 50;
        node.y = parentNode.y + unitY * 50;
      } else if (node.category === "tool") {
        const toolIndex = peerToolCounter.get(parentNode.id) || 0;
        peerToolCounter.set(parentNode.id, toolIndex + 1);
        node.x = parentNode.x - 70 - toolIndex * 25;
        node.y = parentNode.y + (toolIndex % 3) * 30;
      } else {
        node.x = parentNode.x + (Math.random() - 0.5) * 60;
        node.y = parentNode.y + (Math.random() - 0.5) * 60;
      }
    } else {
      node.x = Math.random() * canvasWidth;
      node.y = Math.random() * canvasHeight;
    }
  }
}

function applyCriticLoopLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes } = graphData;
  if (graphNodes.length === 0) return;

  const projectNode = graphNodes.find((graphNode) => graphNode.category === "project");
  const userNode = graphNodes.find((graphNode) => graphNode.category === "user");
  const sessionNode = graphNodes.find((graphNode) => graphNode.category === "session");
  const mainAgentNode = graphNodes.find((graphNode) => graphNode.category === "agent");

  const otherNodes = graphNodes.filter((graphNode) =>
    graphNode.category !== "project" &&
    graphNode.category !== "user" &&
    graphNode.category !== "session" &&
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent" &&
    ((graphNode.metadata?.agentDepth as number) ?? 0) === 0
  );

  const centerX = canvasWidth / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  if (mainAgentNode) {
    mainAgentNode.x = centerX;
    mainAgentNode.y = 220;
  }

  const criticToolCounter = new Map<string, number>();

  for (const node of otherNodes) {
    const edge = graphData.edges.find((edgeCandidate) => edgeCandidate.target === node.id);
    const parentNode = edge ? graphNodes.find((parentNodeCandidate) => parentNodeCandidate.id === edge.source) : null;

    if (parentNode) {
      if (node.category === "request") {
        node.x = parentNode.x + 120;
        node.y = parentNode.y + (node.sequenceNumber || 1) * 28;
      } else if (node.category === "tool") {
        const toolIndex = criticToolCounter.get(parentNode.id) || 0;
        criticToolCounter.set(parentNode.id, toolIndex + 1);
        node.x = parentNode.x - 80 - toolIndex * 25;
        node.y = parentNode.y + (toolIndex % 3) * 30;
      } else {
        node.x = parentNode.x + (Math.random() - 0.5) * 80;
        node.y = parentNode.y + 60;
      }
    } else {
      node.x = Math.random() * canvasWidth;
      node.y = canvasHeight / 2 + 100;
    }
  }
}

function applyTournamentLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes } = graphData;
  if (graphNodes.length === 0) return;

  const projectNode = graphNodes.find((graphNode) => graphNode.category === "project");
  const userNode = graphNodes.find((graphNode) => graphNode.category === "user");
  const sessionNode = graphNodes.find((graphNode) => graphNode.category === "session");
  const mainAgentNode = graphNodes.find((graphNode) => graphNode.category === "agent");

  const otherNodes = graphNodes.filter((graphNode) =>
    graphNode.category !== "project" &&
    graphNode.category !== "user" &&
    graphNode.category !== "session" &&
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent" &&
    ((graphNode.metadata?.agentDepth as number) ?? 0) === 0
  );

  const centerX = canvasWidth / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  if (mainAgentNode) {
    mainAgentNode.x = centerX;
    mainAgentNode.y = 220;
  }

  const tournamentToolCounter = new Map<string, number>();

  for (const node of otherNodes) {
    const edge = graphData.edges.find((edgeCandidate) => edgeCandidate.target === node.id);
    const parentNode = edge ? graphNodes.find((parentNodeCandidate) => parentNodeCandidate.id === edge.source) : null;

    if (parentNode) {
      if (node.category === "request") {
        node.x = parentNode.x;
        node.y = parentNode.y + 70 + (node.sequenceNumber || 1) * 28;
      } else if (node.category === "tool") {
        const toolIndex = tournamentToolCounter.get(parentNode.id) || 0;
        tournamentToolCounter.set(parentNode.id, toolIndex + 1);
        node.x = parentNode.x - 80 - toolIndex * 25;
        node.y = parentNode.y + (toolIndex % 3) * 30;
      } else {
        node.x = parentNode.x + (Math.random() - 0.5) * 70;
        node.y = parentNode.y + 60;
      }
    } else {
      node.x = Math.random() * canvasWidth;
      node.y = canvasHeight / 2 + 100;
    }
  }
}

function applyMCTSLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes } = graphData;
  if (graphNodes.length === 0) return;

  const projectNode = graphNodes.find((graphNode) => graphNode.category === "project");
  const userNode = graphNodes.find((graphNode) => graphNode.category === "user");
  const sessionNode = graphNodes.find((graphNode) => graphNode.category === "session");
  const mainAgentNode = graphNodes.find((graphNode) => graphNode.category === "agent");

  const otherNodes = graphNodes.filter((graphNode) =>
    graphNode.category !== "project" &&
    graphNode.category !== "user" &&
    graphNode.category !== "session" &&
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent" &&
    ((graphNode.metadata?.agentDepth as number) ?? 0) === 0
  );

  const centerX = canvasWidth / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  if (mainAgentNode) {
    mainAgentNode.x = centerX;
    mainAgentNode.y = 220;
  }

  const mctsToolCounter = new Map<string, number>();

  for (const node of otherNodes) {
    const edge = graphData.edges.find((edgeCandidate) => edgeCandidate.target === node.id);
    const parentNode = edge ? graphNodes.find((parentNodeCandidate) => parentNodeCandidate.id === edge.source) : null;

    if (parentNode) {
      if (node.category === "request") {
        node.x = parentNode.x + 80;
        node.y = parentNode.y + (node.sequenceNumber || 1) * 28;
      } else if (node.category === "tool") {
        const toolIndex = mctsToolCounter.get(parentNode.id) || 0;
        mctsToolCounter.set(parentNode.id, toolIndex + 1);
        node.x = parentNode.x - 70 - toolIndex * 25;
        node.y = parentNode.y + (toolIndex % 3) * 28;
      } else {
        node.x = parentNode.x + (Math.random() - 0.5) * 60;
        node.y = parentNode.y + 50;
      }
    } else {
      node.x = Math.random() * canvasWidth;
      node.y = canvasHeight / 2 + 100;
    }
  }
}

export function applyTopologyLayout(
  graphData: GraphData,
  canvasWidth: number,
  canvasHeight: number,
  topology: string
): void {
  const resolvedTopology = topology || DEFAULT_TOPOLOGY;
  if (resolvedTopology === TOPOLOGIES.SEQUENTIAL) {
    applySequentialLayout(graphData, canvasWidth, canvasHeight);
  } else if (resolvedTopology === TOPOLOGIES.PEER_TO_PEER) {
    applyPeerToPeerLayout(graphData, canvasWidth, canvasHeight);
  } else if (resolvedTopology === TOPOLOGIES.CRITIC_LOOP) {
    applyCriticLoopLayout(graphData, canvasWidth, canvasHeight);
  } else if (resolvedTopology === TOPOLOGIES.TOURNAMENT) {
    applyTournamentLayout(graphData, canvasWidth, canvasHeight);
  } else if (resolvedTopology === TOPOLOGIES.DIVIDE_AND_CONQUER) {
    applyTournamentLayout(graphData, canvasWidth, canvasHeight);
  } else if (resolvedTopology === TOPOLOGIES.MCTS) {
    applyMCTSLayout(graphData, canvasWidth, canvasHeight);
  } else {
    applyHierarchicalLayout(graphData, canvasWidth, canvasHeight);
  }

  // After base layout, position sub-agent trees in columns after the request column.
  // The pattern is: ...request → subagent → request → subagent → ...
  if (graphData.subAgentTree && graphData.subAgentTree.length > 0) {
    const nodeMap = new Map(graphData.nodes.map((node) => [node.id, node]));
    const mainAgentNode = graphData.nodes.find(
      (graphNode) => graphNode.category === "agent"
    );

    if (mainAgentNode) {
      const columnSpacing = 200;

      // Find the rightmost root request X to position sub-agents after.
      // Since tools are now embedded as pill badges on request nodes,
      // sub-agents branch from the request column at depth 0.
      const rootRequestNodes = graphData.nodes.filter(
        (graphNode) => graphNode.category === "request" && ((graphNode.metadata?.agentDepth as number) ?? 0) === 0
      );
      const rightmostRootRequestX = rootRequestNodes.length > 0
        ? Math.max(...rootRequestNodes.map((requestNode) => requestNode.x))
        : mainAgentNode.x + columnSpacing;

      // ── Helper: collect request/tool nodes belonging to a specific sub-agent ──
      // With trace-tree DAG topology, only the first request has a direct edge
      // from the sub-agent node. Subsequent requests chain via request→request
      // edges. Walk the chain to collect all requests in this branch.
      const collectBranchNodes = (
        treeChild: SubAgentTreeNode,
        childNode: GraphNode,
        depth: number,
      ): GraphNode[] => {
        const requestNodes: GraphNode[] = [];
        const depthMatchedRequests = new Set(
          graphData.nodes
            .filter((graphNode) =>
              graphNode.category === "request" &&
              ((graphNode.metadata?.agentDepth as number) ?? 0) === depth
            )
            .map((graphNode) => graphNode.id)
        );

        // Find the first request (direct edge from sub-agent node)
        const firstRequestEdge = graphData.edges.find(
          (edge) => edge.source === childNode.id && depthMatchedRequests.has(edge.target)
        );
        if (firstRequestEdge) {
          const firstRequestNode = graphData.nodes.find((node) => node.id === firstRequestEdge.target);
          if (firstRequestNode) {
            requestNodes.push(firstRequestNode);
            // Walk the request→request chain
            let currentRequestId = firstRequestNode.id;
            while (true) {
              const nextChainEdge = graphData.edges.find(
                (edge) => edge.source === currentRequestId && depthMatchedRequests.has(edge.target)
              );
              if (!nextChainEdge) break;
              const nextRequestNode = graphData.nodes.find((node) => node.id === nextChainEdge.target);
              if (!nextRequestNode) break;
              requestNodes.push(nextRequestNode);
              currentRequestId = nextRequestNode.id;
            }
          }
        }

        return requestNodes;
      };

      // ── Pass 1: Measure vertical extent of each branch ──
      // Returns the total height this branch needs so siblings can be
      // spaced apart without overlapping.
      const REQUEST_SPACING = 60;
      const BRANCH_GAP = REQUEST_SPACING * 2;
      // Minimum branch height ensures a single-request sub-agent still
      // reserves enough vertical space that neighboring branches' nodes
      // are visually separated by at least two full node diameters.
      const MINIMUM_BRANCH_HEIGHT = REQUEST_SPACING * 2;

      const measureBranchHeight = (
        treeChild: SubAgentTreeNode,
        depth: number,
      ): number => {
        const childNode = nodeMap.get(treeChild.nodeId);
        if (!childNode) return MINIMUM_BRANCH_HEIGHT;

        const requestNodes = collectBranchNodes(treeChild, childNode, depth);

        const requestColumnHeight = requestNodes.length > 0
          ? (requestNodes.length - 1) * REQUEST_SPACING
          : 0;

        const ownContentHeight = Math.max(
          requestColumnHeight,
          MINIMUM_BRANCH_HEIGHT,
        );

        // If this sub-agent has nested children, measure their total stacked height
        if (treeChild.children.length > 0) {
          let nestedTotalHeight = 0;
          for (let nestedIndex = 0; nestedIndex < treeChild.children.length; nestedIndex++) {
            nestedTotalHeight += measureBranchHeight(treeChild.children[nestedIndex], depth + 1);
            if (nestedIndex < treeChild.children.length - 1) {
              nestedTotalHeight += BRANCH_GAP;
            }
          }
          return Math.max(ownContentHeight, nestedTotalHeight);
        }

        return ownContentHeight;
      };

      // ── Pass 2: Position sub-agent branches using measured heights ──
      const positionSubAgentBranch = (
        treeNodes: SubAgentTreeNode[],
        parentColumnX: number,
        parentY: number,
        depth: number,
      ) => {
        if (treeNodes.length === 0) return;

        // Measure each branch's height
        const branchHeights = treeNodes.map((treeChild) => measureBranchHeight(treeChild, depth));

        // Total height = sum of all branches + gaps between them
        const totalBranchesHeight = branchHeights.reduce((sum, height) => sum + height, 0)
          + (treeNodes.length - 1) * BRANCH_GAP;

        // Center the entire group around the parent Y
        let currentY = parentY - totalBranchesHeight / 2;

        for (let childIndex = 0; childIndex < treeNodes.length; childIndex++) {
          const treeChild = treeNodes[childIndex];
          const childNode = nodeMap.get(treeChild.nodeId);
          if (!childNode) continue;

          const branchHeight = branchHeights[childIndex];

          // Place sub-agent node at the vertical center of its allocated section
          const subAgentX = parentColumnX + columnSpacing;
          childNode.x = subAgentX;
          childNode.y = currentY + branchHeight / 2;

          // Position this sub-agent's request nodes in the next column
          const subAgentRequestX = subAgentX + columnSpacing;
          const subAgentRequestNodes = collectBranchNodes(treeChild, childNode, depth);

          const requestStartY = childNode.y - ((subAgentRequestNodes.length - 1) * REQUEST_SPACING) / 2;
          for (let requestIndex = 0; requestIndex < subAgentRequestNodes.length; requestIndex++) {
            subAgentRequestNodes[requestIndex].x = subAgentRequestX;
            subAgentRequestNodes[requestIndex].y = requestStartY + requestIndex * REQUEST_SPACING;
          }

          // Recurse for nested sub-agents
          if (treeChild.children.length > 0) {
            positionSubAgentBranch(
              treeChild.children,
              subAgentRequestX,
              childNode.y,
              depth + 1,
            );
          }

          // Advance currentY past this branch + gap
          currentY += branchHeight + BRANCH_GAP;
        }
      };

      positionSubAgentBranch(
        graphData.subAgentTree,
        rightmostRootRequestX,
        mainAgentNode.y,
        1,
      );
    }
  }
}

const MINIMUM_ZOOM = 0.02;
const MAXIMUM_ZOOM = 5;

function computeFitToGraphTransform(
  graphNodes: GraphNode[],
  viewportWidth: number,
  viewportHeight: number,
): { zoom: number; panOffset: { x: number; y: number } } {
  if (graphNodes.length === 0) return { zoom: 1, panOffset: { x: 0, y: 0 } };

  const maxNodeRadius = Math.max(...graphNodes.map((node) => node.radius));
  const boundingPadding = maxNodeRadius + 60;

  let minimumX = Infinity;
  let minimumY = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;

  for (const node of graphNodes) {
    minimumX = Math.min(minimumX, node.x - node.radius);
    minimumY = Math.min(minimumY, node.y - node.radius);
    maximumX = Math.max(maximumX, node.x + node.radius);
    maximumY = Math.max(maximumY, node.y + node.radius);
  }

  const graphWidth = maximumX - minimumX + boundingPadding * 2;
  const graphHeight = maximumY - minimumY + boundingPadding * 2;

  const horizontalZoom = viewportWidth / graphWidth;
  const verticalZoom = viewportHeight / graphHeight;
  // Cap auto-fit at 1.0 so the graph never appears zoomed-in beyond 1:1.
  // The user can manually zoom in for detail via scroll wheel.
  const fittedZoom = Math.max(MINIMUM_ZOOM, Math.min(1.0, Math.min(horizontalZoom, verticalZoom)));

  const graphCenterX = (minimumX + maximumX) / 2;
  const graphCenterY = (minimumY + maximumY) / 2;
  const viewportCenterX = viewportWidth / 2;
  const viewportCenterY = viewportHeight / 2;

  const fittedPanOffset = {
    x: viewportCenterX - graphCenterX,
    y: viewportCenterY - graphCenterY,
  };

  return { zoom: fittedZoom, panOffset: fittedPanOffset };
}

/* ═══════════════════════════════════════════════════════════════════
   Props Interface
   ═══════════════════════════════════════════════════════════════════ */

export interface ChatConversationGraphComponentProps {
  conversationId: string | null;
  toolActivity?: ToolCallEvent[];
  isGenerating?: boolean;
  compact?: boolean;
  graphState?: import("../hooks/useConversationGraphData").ConversationGraphDataState;
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function ChatConversationGraphComponent({ conversationId, toolActivity = [], isGenerating = false, compact = false, graphState: externalGraphState }: ChatConversationGraphComponentProps) {
  // When external graphState is provided, the internal hook is a no-op (null conversationId).
  // When standalone (no parent providing graphState), the hook manages its own SSE + data.
  const internalGraphState = useConversationGraphData(
    externalGraphState ? null : conversationId,
    isGenerating,
  );

  const resolvedGraphState = externalGraphState || internalGraphState;

  const {
    graphData,
    setGraphData,
    isLoading,
    isLiveConnected,
    enteringNodeIds,
    setEnteringNodeIds,
    toolEmojiMap,
    nodesRef,
    graphDataRef,
  } = resolvedGraphState;

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeKeys, setSelectedEdgeKeys] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [collapsedSubTreeIds, setCollapsedSubTreeIds] = useState<Set<string>>(new Set());

  const [phaseColor, setPhaseColor] = useState<string | null>(null);

  useEffect(() => {
    const readPhaseColorFromRoot = () => {
      const rawValue = document.documentElement.style.getPropertyValue("--generating-dot-phase-color").trim();
      setPhaseColor(rawValue || null);
    };
    readPhaseColorFromRoot();
    const intervalId = setInterval(readPhaseColorFromRoot, 400);
    return () => clearInterval(intervalId);
  }, []);



  const [selectedRequestDetail, setSelectedRequestDetail] = useState<IrisRequestEntry | null>(null);
  const [isRequestDetailLoading, setIsRequestDetailLoading] = useState(false);
  const [expandedPopoverSections, setExpandedPopoverSections] = useState<Set<string>>(new Set());

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panOffsetRef = useRef(panOffset);
  const zoomRef = useRef(zoom);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const fitAnimationFrameRef = useRef<number | null>(null);

  const lastMousePositionRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  const [draggedNode, setDraggedNode] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);



  // ResizeObserver for canvas dimensions
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: width || 800, height: height || 500 });
    });
    resizeObserver.observe(wrapper);
    return () => resizeObserver.disconnect();
  }, []);

  const draggingRef = useRef<{ id: string } | null>(null);
  const rafRef = useRef<number | null>(null);
  const settleCountRef = useRef<number>(0);
  const collisionTickRef = useRef<(() => void) | null>(null);
  const previousNodeCountRef = useRef<number>(0);

  useEffect(() => { draggingRef.current = draggedNode; }, [draggedNode]);

  useEffect(() => {
    const PUSH_FACTOR = 0.35;
    const MIN_PUSH = 0.5;
    const COLLISION_PADDING = 15;

    collisionTickRef.current = () => {
      const currentNodes = nodesRef.current;
      const dragId = draggingRef.current?.id || null;
      const updates: Record<string, { x: number; y: number }> = {};

      for (let indexA = 0; indexA < currentNodes.length; indexA++) {
        for (let indexB = indexA + 1; indexB < currentNodes.length; indexB++) {
          const nodeA = currentNodes[indexA];
          const nodeB = currentNodes[indexB];
          const posA = updates[nodeA.id] || { x: nodeA.x, y: nodeA.y };
          const posB = updates[nodeB.id] || { x: nodeB.x, y: nodeB.y };
          const deltaX = posB.x - posA.x;
          const deltaY = posB.y - posA.y;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1;
          const minDistance = nodeA.radius + nodeB.radius + COLLISION_PADDING;
          const overlap = minDistance - distance;

          if (overlap > MIN_PUSH) {
            const aIsDragged = nodeA.id === dragId;
            const bIsDragged = nodeB.id === dragId;
            const ux = deltaX / distance;
            const uy = deltaY / distance;
            const push = overlap * PUSH_FACTOR;
            if (aIsDragged) {
              if (!updates[nodeB.id]) updates[nodeB.id] = { x: nodeB.x, y: nodeB.y };
              updates[nodeB.id].x += ux * push;
              updates[nodeB.id].y += uy * push;
            } else if (bIsDragged) {
              if (!updates[nodeA.id]) updates[nodeA.id] = { x: nodeA.x, y: nodeA.y };
              updates[nodeA.id].x -= ux * push;
              updates[nodeA.id].y -= uy * push;
            } else {
              const halfPush = push / 2;
              if (!updates[nodeA.id]) updates[nodeA.id] = { x: nodeA.x, y: nodeA.y };
              if (!updates[nodeB.id]) updates[nodeB.id] = { x: nodeB.x, y: nodeB.y };
              updates[nodeA.id].x -= ux * halfPush;
              updates[nodeA.id].y -= uy * halfPush;
              updates[nodeB.id].x += ux * halfPush;
              updates[nodeB.id].y += uy * halfPush;
            }
          }
        }
      }

      const hasUpdates = Object.keys(updates).length > 0;
      if (hasUpdates) {
        setGraphData((previousGraphData) => {
          if (!previousGraphData) return null;
          return {
            ...previousGraphData,
            nodes: previousGraphData.nodes.map((node) =>
              updates[node.id] ? { ...node, x: updates[node.id].x, y: updates[node.id].y } : node
            ),
          };
        });
      }

      if (draggingRef.current) {
        settleCountRef.current = 10;
        rafRef.current = requestAnimationFrame(collisionTickRef.current as FrameRequestCallback);
      } else if (hasUpdates) {
        settleCountRef.current = 10;
        rafRef.current = requestAnimationFrame(collisionTickRef.current as FrameRequestCallback);
      } else if (settleCountRef.current > 0) {
        settleCountRef.current--;
        rafRef.current = requestAnimationFrame(collisionTickRef.current as FrameRequestCallback);
      } else {
        rafRef.current = null;
      }
    };

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fitAnimationFrameRef.current) cancelAnimationFrame(fitAnimationFrameRef.current);
    };
  }, []);

  const startCollisionLoop = useCallback((frames = 30) => {
    if (!rafRef.current && collisionTickRef.current) {
      settleCountRef.current = frames;
      rafRef.current = requestAnimationFrame(collisionTickRef.current as FrameRequestCallback);
    }
  }, []);

  useEffect(() => {
    if (draggedNode) startCollisionLoop(30);
  }, [draggedNode, startCollisionLoop]);

  // Start collision settlement when new graph data arrives from the hook
  useEffect(() => {
    if (graphData && graphData.nodes.length > 0) startCollisionLoop(40);
  }, [graphData?.nodes.length, startCollisionLoop]);

  // -- Animated viewport auto-fit --------------------------------
  // Smoothly transitions zoom + pan to keep all nodes visible
  // using rAF-driven ease-out cubic interpolation. Cancels any
  // in-flight animation so rapid SSE node arrivals don't stack up.
  const animateToFitTransform = useCallback(() => {
    const targetNodes = nodesRef.current;
    if (targetNodes.length === 0) return;

    const targetTransform = computeFitToGraphTransform(
      targetNodes,
      dimensions.width,
      dimensions.height,
    );

    // Cancel any running fit animation
    if (fitAnimationFrameRef.current) {
      cancelAnimationFrame(fitAnimationFrameRef.current);
      fitAnimationFrameRef.current = null;
    }

    const startZoom = zoomRef.current;
    const startPan = { ...panOffsetRef.current };
    const targetZoom = targetTransform.zoom;
    const targetPan = targetTransform.panOffset;

    // Skip animation if the delta is negligible (< 1px pan, < 0.5% zoom)
    const panDelta = Math.hypot(targetPan.x - startPan.x, targetPan.y - startPan.y);
    const zoomDelta = Math.abs(targetZoom - startZoom);
    if (panDelta < 1 && zoomDelta < 0.005) return;

    const animationDuration = 400;
    let animationStartTimestamp: number | null = null;

    const animationStep = (currentTimestamp: number) => {
      if (!animationStartTimestamp) animationStartTimestamp = currentTimestamp;
      const elapsedTime = currentTimestamp - animationStartTimestamp;
      const normalizedProgress = Math.min(elapsedTime / animationDuration, 1);
      // Ease-out cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - normalizedProgress, 3);

      const interpolatedZoom = startZoom + (targetZoom - startZoom) * easedProgress;
      const interpolatedPan = {
        x: startPan.x + (targetPan.x - startPan.x) * easedProgress,
        y: startPan.y + (targetPan.y - startPan.y) * easedProgress,
      };

      setZoom(interpolatedZoom);
      setPanOffset(interpolatedPan);

      if (normalizedProgress < 1) {
        fitAnimationFrameRef.current = requestAnimationFrame(animationStep);
      } else {
        fitAnimationFrameRef.current = null;
      }
    };

    fitAnimationFrameRef.current = requestAnimationFrame(animationStep);
  }, [dimensions.width, dimensions.height]);

  // -- Reactive auto-fit on node arrival -------------------------
  useEffect(() => {
    const currentNodeCount = graphData?.nodes.length ?? 0;
    if (currentNodeCount > previousNodeCountRef.current) {
      animateToFitTransform();
    }
    previousNodeCountRef.current = currentNodeCount;
  }, [graphData?.nodes.length, animateToFitTransform]);

  // -- Clear per-instance selection on conversation change --------
  useEffect(() => {
    setSelectedNodeIds(new Set());
    setSelectedEdgeKeys(new Set());
    setFocusedNodeId(null);
  }, [conversationId]);

  // -- Screen ↔ SVG coordinate helper ---------------------------
  const screenToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasWrapperRef.current?.getBoundingClientRect();
      if (!rect) return { x: clientX, y: clientY };
      const originX = dimensions.width / 2 - dimensions.width / (2 * zoom) - panOffset.x;
      const originY = dimensions.height / 2 - dimensions.height / (2 * zoom) - panOffset.y;
      return { x: originX + (clientX - rect.left) / zoom, y: originY + (clientY - rect.top) / zoom };
    },
    [dimensions.width, dimensions.height, zoom, panOffset],
  );

  // -- Canvas pan/zoom handlers ----------------------------------
  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if ((event.target as SVGElement).closest("[data-node-identifier]")) return;
    setIsPanning(true);
    lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleNodeMouseDown = useCallback(
    (event: React.MouseEvent<SVGGElement>, nodeId: string) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      hasDraggedRef.current = false;
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      const node = graphData?.nodes.find((graphNode) => graphNode.id === nodeId);
      if (!node) return;
      const svgPos = screenToSvg(event.clientX, event.clientY);
      setDraggedNode({ id: nodeId, offsetX: svgPos.x - node.x, offsetY: svgPos.y - node.y });
    },
    [graphData, screenToSvg],
  );

  const handleGlobalMouseMove = useCallback(
    (event: MouseEvent) => {
      if (draggedNode) {
        const deltaX = event.clientX - dragStartRef.current.x;
        const deltaY = event.clientY - dragStartRef.current.y;
        if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 3) hasDraggedRef.current = true;
        const svgPos = screenToSvg(event.clientX, event.clientY);
        setGraphData((previousGraphData) => {
          if (!previousGraphData) return null;
          return {
            ...previousGraphData,
            nodes: previousGraphData.nodes.map((node) =>
              node.id === draggedNode.id
                ? { ...node, x: svgPos.x - draggedNode.offsetX, y: svgPos.y - draggedNode.offsetY }
                : node
            ),
          };
        });
      }
      if (isPanning) {
        const deltaX = event.clientX - lastMousePositionRef.current.x;
        const deltaY = event.clientY - lastMousePositionRef.current.y;
        lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
        setPanOffset((previous) => ({ x: previous.x + deltaX / zoom, y: previous.y + deltaY / zoom }));
      }
    },
    [draggedNode, isPanning, screenToSvg, zoom],
  );

  const handleGlobalMouseUp = useCallback(() => {
    if (draggedNode) setDraggedNode(null);
    if (isPanning) setIsPanning(false);
  }, [draggedNode, isPanning]);

  useEffect(() => {
    if (draggedNode || isPanning) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [draggedNode, isPanning, handleGlobalMouseMove, handleGlobalMouseUp]);

  const handleCanvasWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
    setZoom((previousZoom) => Math.max(MINIMUM_ZOOM, Math.min(MAXIMUM_ZOOM, previousZoom * zoomFactor)));
  }, []);

  const handleZoomIn = useCallback(() => setZoom((currentZoom) => Math.min(MAXIMUM_ZOOM, currentZoom * 1.2)), []);
  const handleZoomOut = useCallback(() => setZoom((currentZoom) => Math.max(MINIMUM_ZOOM, currentZoom * 0.8)), []);
  const handleZoomFit = useCallback(() => {
    if (!graphData || graphData.nodes.length === 0) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      return;
    }
    // Sync nodesRef from current graphData before animating, since
    // animateToFitTransform reads positions from nodesRef
    nodesRef.current = graphData.nodes;
    animateToFitTransform();
  }, [graphData, animateToFitTransform]);

  const animateCenterOnNode = useCallback((targetNode: GraphNode) => {
    const viewportWidth = dimensions.width;
    const viewportHeight = dimensions.height;
    const currentPanOffset = panOffsetRef.current;

    const targetPanOffset = {
      x: viewportWidth / 2 - targetNode.x,
      y: viewportHeight / 2 - targetNode.y,
    };

    const startPanOffset = { ...currentPanOffset };
    const animationDuration = 350;
    let animationStartTimestamp: number | null = null;

    const animationStep = (currentTimestamp: number) => {
      if (!animationStartTimestamp) animationStartTimestamp = currentTimestamp;
      const elapsedTime = currentTimestamp - animationStartTimestamp;
      const normalizedProgress = Math.min(elapsedTime / animationDuration, 1);
      // Ease-out cubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - normalizedProgress, 3);

      const interpolatedPanOffset = {
        x: startPanOffset.x + (targetPanOffset.x - startPanOffset.x) * easedProgress,
        y: startPanOffset.y + (targetPanOffset.y - startPanOffset.y) * easedProgress,
      };
      setPanOffset(interpolatedPanOffset);

      if (normalizedProgress < 1) {
        requestAnimationFrame(animationStep);
      }
    };
    requestAnimationFrame(animationStep);
  }, [dimensions.width, dimensions.height]);

  // Compute the full ancestor flow for a given node: all upstream nodes and
  // edges leading from the root (project → session → agent) through sequential
  // request chains down to the selected node and its direct children (tools).
  const computeAncestorFlowForNode = useCallback((targetNodeId: string): { flowNodeIds: Set<string>; flowEdgeKeys: Set<string> } | null => {
    if (!graphData) return null;

    const targetNode = graphData.nodes.find((graphNode) => graphNode.id === targetNodeId);
    if (!targetNode) return null;

    // Project and user nodes are graph roots — no meaningful ancestor chain
    if (targetNode.category === "project" || targetNode.category === "user") return null;

    const flowNodeIds = new Set([targetNodeId]);
    const flowEdgeKeys = new Set<string>();

    const includeEdge = (edge: GraphEdge) => {
      flowNodeIds.add(edge.source);
      flowNodeIds.add(edge.target);
      flowEdgeKeys.add(`${edge.source}→${edge.target}`);
    };

    // Generic backward walk: follow any incoming edge up toward the
    // session/project root, traversing through ALL node categories
    // (request, agent, subagent, session, project, user).
    const walkBackwardToRoot = (startNodeId: string) => {
      const visited = new Set([startNodeId]);
      const queue = [startNodeId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;

        for (const edge of graphData.edges) {
          if (edge.target === currentId && !visited.has(edge.source)) {
            const sourceNode = graphData.nodes.find((graphNode) => graphNode.id === edge.source);
            if (!sourceNode) continue;

            includeEdge(edge);
            visited.add(edge.source);
            queue.push(edge.source);
          }
        }
      }
    };

    if (targetNode.category === "request") {
      // Include direct child edges (tools, sub-agents spawned by this request)
      for (const edge of graphData.edges) {
        if (edge.source === targetNodeId) {
          flowNodeIds.add(edge.target);
          flowEdgeKeys.add(`${edge.source}→${edge.target}`);
        }
        if (edge.target === targetNodeId) {
          flowNodeIds.add(edge.source);
          flowEdgeKeys.add(`${edge.source}→${edge.target}`);
        }
      }

      // Tool nodes belonging to this specific request (their IDs embed the request ID)
      const requestIdSegment = targetNodeId.replace("request:", "");
      const requestToolPrefix = `tool:${requestIdSegment}:`;
      for (const edge of graphData.edges) {
        if (edge.target.startsWith(requestToolPrefix)) {
          includeEdge(edge);
        }
      }

      // Walk backward from the request through the full chain to the root
      walkBackwardToRoot(targetNodeId);
    } else if (targetNode.category === "tool") {
      // For tool nodes, trace backward: tool ← request ← agent ← session ← project
      for (const edge of graphData.edges) {
        if (edge.target === targetNodeId) {
          includeEdge(edge);
        }
      }

      // Extract the owning request ID from the tool node ID (tool:REQUEST_ID:toolName)
      const toolIdParts = targetNodeId.replace("tool:", "").split(":");
      const owningRequestId = toolIdParts.length > 1 ? toolIdParts.slice(0, -1).join(":") : null;
      const owningRequestNodeId = owningRequestId ? `request:${owningRequestId}` : null;

      if (owningRequestNodeId && graphData.nodes.some((graphNode) => graphNode.id === owningRequestNodeId)) {
        flowNodeIds.add(owningRequestNodeId);
        walkBackwardToRoot(owningRequestNodeId);
      }
    } else if (targetNode.category === "subagent" || targetNode.category === "agent") {
      // For agent/subagent nodes: include all child requests and their tools,
      // then walk backward to the root from the agent itself
      for (const edge of graphData.edges) {
        if (edge.source === targetNodeId) {
          const childNode = graphData.nodes.find((graphNode) => graphNode.id === edge.target);
          if (childNode && childNode.category === "request") {
            includeEdge(edge);

            // Include tool children of each direct request
            const childRequestIdSegment = edge.target.replace("request:", "");
            const childToolPrefix = `tool:${childRequestIdSegment}:`;
            for (const toolEdge of graphData.edges) {
              if (toolEdge.source === edge.target && toolEdge.target.startsWith(childToolPrefix)) {
                includeEdge(toolEdge);
              }
            }
          }
        }
      }

      walkBackwardToRoot(targetNodeId);
    } else if (targetNode.category === "session") {
      // For session nodes: include direct children (agent, user, project edges)
      for (const edge of graphData.edges) {
        if (edge.source === targetNodeId || edge.target === targetNodeId) {
          includeEdge(edge);
        }
      }
    } else if (targetNode.category === "turn") {
      // For turn nodes: include forward edges to the next request(s) and walk backward to root
      for (const edge of graphData.edges) {
        if (edge.source === targetNodeId || edge.target === targetNodeId) {
          includeEdge(edge);
        }
      }
      walkBackwardToRoot(targetNodeId);
    }

    return { flowNodeIds, flowEdgeKeys };
  }, [graphData]);

  // Apply ancestor flow highlighting for a node and update selection state.
  // Used by both click and keyboard navigation handlers.
  const applyNodeSelectionWithAncestorFlow = useCallback((nodeId: string) => {
    const ancestorFlow = computeAncestorFlowForNode(nodeId);
    if (ancestorFlow) {
      setSelectedNodeIds(ancestorFlow.flowNodeIds);
      setSelectedEdgeKeys(ancestorFlow.flowEdgeKeys);
    } else {
      setSelectedNodeIds(new Set([nodeId]));
      setSelectedEdgeKeys(new Set());
    }
    setFocusedNodeId(nodeId);
  }, [computeAncestorFlowForNode]);

  const handleNodeClick = useCallback((event: React.MouseEvent, nodeId: string) => {
    if (hasDraggedRef.current) return;

    const isMultiSelectModifier = event.shiftKey || event.ctrlKey || event.metaKey;

    if (isMultiSelectModifier) {
      setSelectedEdgeKeys(new Set());
      setSelectedNodeIds((previousIds) => {
        const nextIds = new Set(previousIds);
        if (nextIds.has(nodeId)) {
          nextIds.delete(nodeId);
          if (focusedNodeId === nodeId) {
            setFocusedNodeId(nextIds.size > 0 ? [...nextIds][nextIds.size - 1] : null);
          }
        } else {
          nextIds.add(nodeId);
          setFocusedNodeId(nodeId);
        }
        return nextIds;
      });
    } else {
      // Toggle off if clicking the currently focused node
      if (focusedNodeId === nodeId) {
        setFocusedNodeId(null);
        setSelectedNodeIds(new Set());
        setSelectedEdgeKeys(new Set());
      } else {
        applyNodeSelectionWithAncestorFlow(nodeId);
      }

      // Center the view on the clicked node
      const targetNode = graphData?.nodes.find((graphNode) => graphNode.id === nodeId);
      if (targetNode) {
        animateCenterOnNode(targetNode);
      }
    }
  }, [graphData, animateCenterOnNode, focusedNodeId, applyNodeSelectionWithAncestorFlow]);

  // Lazy-fetch full request detail
  useEffect(() => {
    if (!focusedNodeId || !graphData) {
      setSelectedRequestDetail(null);
      setExpandedPopoverSections(new Set());
      return;
    }
    const node = graphData.nodes.find((graphNode) => graphNode.id === focusedNodeId);
    if (!node || node.category !== "request" || !node.metadata?.requestId) {
      setSelectedRequestDetail(null);
      setExpandedPopoverSections(new Set());
      return;
    }
    let isCancelled = false;
    setIsRequestDetailLoading(true);
    setSelectedRequestDetail(null);
    setExpandedPopoverSections(new Set());
    IrisService.getRequest(String(node.metadata.requestId))
      .then((detail) => { if (!isCancelled) { setSelectedRequestDetail(detail); setIsRequestDetailLoading(false); } })
      .catch(() => { if (!isCancelled) { setSelectedRequestDetail(null); setIsRequestDetailLoading(false); } });
    return () => { isCancelled = true; };
  }, [focusedNodeId, graphData]);

  const togglePopoverSection = useCallback((sectionKey: string) => {
    setExpandedPopoverSections((previous) => {
      const next = new Set(previous);
      if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
      return next;
    });
  }, []);

  const selectedNode = useMemo(() => {
    if (!focusedNodeId || !graphData) return null;
    return graphData.nodes.find((node) => node.id === focusedNodeId) || null;
  }, [focusedNodeId, graphData]);

  const { width: canvasWidth, height: canvasHeight } = dimensions;

  const viewBoxTransform = useMemo(() => {
    const scaledWidth = canvasWidth / zoom;
    const scaledHeight = canvasHeight / zoom;
    const originX = canvasWidth / 2 - scaledWidth / 2 - panOffset.x;
    const originY = canvasHeight / 2 - scaledHeight / 2 - panOffset.y;
    return `${originX} ${originY} ${scaledWidth} ${scaledHeight}`;
  }, [canvasWidth, canvasHeight, zoom, panOffset]);

  // Compute which node IDs are hidden because their ancestor is collapsed
  const hiddenNodeIds = useMemo<Set<string>>(() => {
    if (!graphData || collapsedSubTreeIds.size === 0) return new Set();
    const hidden = new Set<string>();

    const hideDescendants = (treeNodes: SubAgentTreeNode[]) => {
      for (const treeNode of treeNodes) {
        hidden.add(treeNode.nodeId);
        // Also hide all requests/tools/models connected to this hidden agent
        for (const edge of graphData.edges) {
          if (edge.source === treeNode.nodeId) {
            const targetNode = graphData.nodes.find((graphNode) => graphNode.id === edge.target);
            if (targetNode && targetNode.category !== "agent") {
              hidden.add(edge.target);
            }
          }
        }
        hideDescendants(treeNode.children);
      }
    };

    const walkAndCollapse = (treeNodes: SubAgentTreeNode[]) => {
      for (const treeNode of treeNodes) {
        if (collapsedSubTreeIds.has(treeNode.nodeId)) {
          hideDescendants(treeNode.children);
        } else {
          walkAndCollapse(treeNode.children);
        }
      }
    };

    walkAndCollapse(graphData.subAgentTree);
    return hidden;
  }, [graphData, collapsedSubTreeIds]);

  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent) => {
    const { key } = event;
    if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Escape") return;
    event.preventDefault();

    if (key === "Escape") {
      setSelectedNodeIds(new Set());
      setSelectedEdgeKeys(new Set());
      setFocusedNodeId(null);
      return;
    }

    if (!graphData) return;

    const visibleNodes = graphData.nodes.filter((node) => !hiddenNodeIds.has(node.id));
    if (visibleNodes.length === 0) return;

    const currentNode = focusedNodeId
      ? visibleNodes.find((node) => node.id === focusedNodeId)
      : null;

    // If no node is currently selected, select the first session or agent node
    if (!currentNode) {
      const initialNode = visibleNodes.find((node) => node.category === "session")
        || visibleNodes.find((node) => node.category === "agent")
        || visibleNodes[0];
      if (initialNode) {
        setSelectedNodeIds(new Set([initialNode.id]));
        setSelectedEdgeKeys(new Set());
        setFocusedNodeId(initialNode.id);
        animateCenterOnNode(initialNode);
      }
      return;
    }

    // Group visible nodes into columns by x-coordinate proximity.
    // Nodes within a 40px horizontal tolerance are considered in the same column.
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
    if (currentColumn.length > 0) {
      columns.push(currentColumn.sort((nodeA, nodeB) => nodeA.y - nodeB.y));
    }

    // Find which column the current node belongs to
    let currentColumnIndex = -1;
    let currentNodeIndexInColumn = -1;
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const nodeIndexInColumn = columns[columnIndex].findIndex((node) => node.id === currentNode.id);
      if (nodeIndexInColumn !== -1) {
        currentColumnIndex = columnIndex;
        currentNodeIndexInColumn = nodeIndexInColumn;
        break;
      }
    }
    if (currentColumnIndex === -1) return;

    let targetNode: GraphNode | null = null;

    if (key === "ArrowUp" || key === "ArrowDown") {
      const column = columns[currentColumnIndex];
      const direction = key === "ArrowUp" ? -1 : 1;
      const nextIndex = currentNodeIndexInColumn + direction;
      if (nextIndex >= 0 && nextIndex < column.length) {
        targetNode = column[nextIndex];
      }
    } else {
      // ArrowLeft / ArrowRight — move to the nearest connected node by y-position in an adjacent column.
      // Only nodes sharing a direct edge with the current node are valid navigation targets.
      const direction = key === "ArrowLeft" ? -1 : 1;
      const nextColumnIndex = currentColumnIndex + direction;
      if (nextColumnIndex >= 0 && nextColumnIndex < columns.length) {
        const connectedNodeIds = new Set(
          graphData.edges
            .filter((edge) => edge.source === currentNode.id || edge.target === currentNode.id)
            .map((edge) => (edge.source === currentNode.id ? edge.target : edge.source)),
        );
        const connectedAdjacentNodes = columns[nextColumnIndex].filter(
          (candidateNode) => connectedNodeIds.has(candidateNode.id),
        );
        let closestDistance = Infinity;
        for (const candidateNode of connectedAdjacentNodes) {
          const verticalDistance = Math.abs(candidateNode.y - currentNode.y);
          if (verticalDistance < closestDistance) {
            closestDistance = verticalDistance;
            targetNode = candidateNode;
          }
        }
      }
    }

    if (targetNode) {
      applyNodeSelectionWithAncestorFlow(targetNode.id);
      animateCenterOnNode(targetNode);
    }
  }, [graphData, focusedNodeId, hiddenNodeIds, animateCenterOnNode, applyNodeSelectionWithAncestorFlow]);



  const toggleSubTreeCollapse = useCallback((nodeId: string) => {
    setCollapsedSubTreeIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // -- Derive active node identifiers from live toolActivity -----------
  const activeToolNames = useMemo(() => {
    const names = new Set<string>();
    for (const toolCall of toolActivity) {
      if (toolCall.status === "calling" || toolCall.status === "streaming") {
        names.add(toolCall.name);
      }
    }
    return names;
  }, [toolActivity]);




  // Tracks the latest request node as "processing" during generation.
  // Also stays active after generation stops while the proactive node
  // still exists, so the processing visual cascades until all real
  // request data has arrived.
  const hasProactiveNode = useMemo(() => {
    return graphData?.nodes.some((node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID) ?? false;
  }, [graphData]);

  const latestRequestNodeId = useMemo(() => {
    if (!graphData || (!isGenerating && !hasProactiveNode)) return null;
    const requestNodes = graphData.nodes
      .filter((node) => node.category === "request")
      .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0));
    return requestNodes.length > 0 ? requestNodes[requestNodes.length - 1].id : null;
  }, [graphData, isGenerating, hasProactiveNode]);

  // -- Auto-select working agents and in-flight requests during generation --
  // When isGenerating is true, automatically highlight agent nodes that are
  // actively working and request nodes that haven't completed yet (pending
  // status or the latest active request). This provides immediate visual
  // context in nodes view showing which parts of the graph are "hot".
  // Clears auto-selection when generation stops.
  // Uses its own ref to track the isGenerating transition independently
  // of the proactive node injection effect which mutates the shared ref.
  const previousIsGeneratingForSelectionRef = useRef(false);

  useEffect(() => {
    if (!graphData) return;

    const wasGenerating = previousIsGeneratingForSelectionRef.current;
    previousIsGeneratingForSelectionRef.current = isGenerating;

    if (isGenerating || hasProactiveNode) {
      // Determine the best target node for the active flow highlight.
      // Prefer the proactive pending node, then the latest request node,
      // then any pending request, then the last agent.
      let activeFlowTargetNodeId: string | null = null;

      const proactiveNode = graphData.nodes.find(
        (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
      );
      if (proactiveNode) {
        activeFlowTargetNodeId = proactiveNode.id;
      } else if (latestRequestNodeId) {
        activeFlowTargetNodeId = latestRequestNodeId;
      } else {
        const pendingRequest = graphData.nodes.find(
          (node) => node.category === "request" && (node.metadata?.status as string) === "pending",
        );
        if (pendingRequest) activeFlowTargetNodeId = pendingRequest.id;
      }

      if (activeFlowTargetNodeId) {
        // Use the ancestor flow computation to highlight the entire chain
        // from root (project → session → agent → turns → requests) to the
        // latest active node, including all intermediate edges.
        const ancestorFlow = computeAncestorFlowForNode(activeFlowTargetNodeId);
        if (ancestorFlow) {
          setSelectedNodeIds(ancestorFlow.flowNodeIds);
          setSelectedEdgeKeys(ancestorFlow.flowEdgeKeys);
        } else {
          setSelectedNodeIds(new Set([activeFlowTargetNodeId]));
          setSelectedEdgeKeys(new Set());
        }
      } else {
        // Fallback: select all agents during generation
        const agentNodeIds = new Set<string>();
        for (const node of graphData.nodes) {
          if (node.category === "agent" || node.category === "subagent") {
            agentNodeIds.add(node.id);
          }
        }
        if (agentNodeIds.size > 0) {
          setSelectedNodeIds(agentNodeIds);
          setSelectedEdgeKeys(new Set());
        }
      }
    } else if (wasGenerating && !isGenerating && !hasProactiveNode) {
      // Generation stopped and proactive node is gone — clear auto-selection
      setSelectedNodeIds(new Set());
      setSelectedEdgeKeys(new Set());
      setFocusedNodeId(null);
    }
  }, [isGenerating, graphData, latestRequestNodeId, hasProactiveNode, computeAncestorFlowForNode]);

  // -- Empty state when no conversationId -----------------------------
  if (!conversationId) {
    return (
      <div className={styles['graph-embed-wrapper']}>
        <div className={graphStyles['graph-canvas-wrapper']}>
          <StarfieldComponent className={graphStyles['starfield']} panX={0} panY={0} />
          <div className={graphStyles['graph-empty-prompt']}>
            <Network size={48} className={graphStyles['graph-empty-prompt-icon']} />
            <div className={graphStyles['graph-empty-prompt-title']}>No active conversation</div>
            <div className={graphStyles['graph-empty-prompt-subtitle']}>
              Start or load a conversation to view its node graph.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['graph-embed-wrapper']}>
      {/* Canvas */}
      <div
        className={`${graphStyles['graph-canvas-wrapper']} ${styles['graph-embed-canvas-area']}`}
        ref={canvasWrapperRef}
        tabIndex={0}
        onKeyDown={handleKeyboardNavigation}
        style={{ outline: "none" }}
      >
        <StarfieldComponent className={graphStyles['starfield']} panX={panOffset.x} panY={panOffset.y} />

        {/* Floating Zoom Controls */}
        {!compact && (
          <div className={graphStyles['zoom-controls']}>
            <button className={graphStyles['zoom-button']} onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">
              <ZoomIn size={14} />
            </button>
            <button className={graphStyles['zoom-button']} onClick={handleZoomFit} title="Fit to view" aria-label="Fit to view">
              <Maximize size={14} />
            </button>
            <button className={graphStyles['zoom-button']} onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">
              <ZoomOut size={14} />
            </button>
          </div>
        )}

        {!graphData && (
          <div className={graphStyles['graph-empty-prompt']}>
            {isLoading
              ? <PanelLoadingSpinner />
              : <>
                  <Network size={40} className={graphStyles['graph-empty-prompt-icon']} />
                  <div className={graphStyles['graph-empty-prompt-title']}>No graph data</div>
                </>
            }
          </div>
        )}

        {graphData && (() => {
          const phaseRepresentativeColor = phaseColor;

          return (
          <>
            <svg
              className={graphStyles['graph-canvas']}
              viewBox={viewBoxTransform}
              onMouseDown={handleCanvasMouseDown}
              onWheel={handleCanvasWheel}
              style={{ cursor: draggedNode ? "grabbing" : isPanning ? "grabbing" : "grab" }}
            >
              <defs>
                <filter id="chat-graph-session-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation={phaseRepresentativeColor ? 10 : 6} result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="chat-graph-node-hover-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                {(Object.entries(NODE_COLORS) as [NodeCategory, string][]).map(([category, color]) => (
                  <marker
                    key={`chat-graph-arrow-${category}`}
                    id={`chat-graph-arrow-${category}`}
                    viewBox="0 0 10 10"
                    refX={7}
                    refY={5}
                    markerWidth={6}
                    markerHeight={6}
                    orient="auto"
                  >
                    <path d="M 0 2.5 L 7 5 L 0 7.5 z" fill={color} />
                  </marker>
                ))}
                {AGENT_DEPTH_COLORS.map((depthColor, depthIndex) => (
                  <marker
                    key={`chat-graph-arrow-agent-depth-${depthIndex}`}
                    id={`chat-graph-arrow-agent-depth-${depthIndex}`}
                    viewBox="0 0 10 10"
                    refX={7}
                    refY={5}
                    markerWidth={6}
                    markerHeight={6}
                    orient="auto"
                  >
                    <path d="M 0 2.5 L 7 5 L 0 7.5 z" fill={depthColor} />
                  </marker>
                ))}
              </defs>



              {/* Edges */}
              {graphData.edges.map((edge, edgeIndex) => {
                const sourceNode = graphData.nodes.find((node) => node.id === edge.source);
                const targetNode = graphData.nodes.find((node) => node.id === edge.target);
                if (!sourceNode || !targetNode) return null;
                if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) return null;
                const edgeKey = `${edge.source}→${edge.target}`;
                const isEdgeSelected = selectedEdgeKeys.size > 0
                  ? selectedEdgeKeys.has(edgeKey)
                  : selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
                const baseOpacity = 0.15 + (edge.strength || 0.5) * 0.2;
                const edgeOpacity = isEdgeSelected ? 1.0 : baseOpacity;

                // Use depth-encoded color for agent-to-subagent and subagent-to-subagent edges
                const isAgentHierarchyEdge = (sourceNode.category === "agent" || sourceNode.category === "subagent") && (targetNode.category === "agent" || targetNode.category === "subagent");
                const targetDepth = targetNode.depth ?? 0;
                const edgeColor = isAgentHierarchyEdge
                  ? resolveAgentColorByDepth(targetDepth)
                  : NODE_COLORS[targetNode.category] || "oklch(0.6 0 0)";

                const pathData = edge.isCurved
                  ? curvedEdgePath(sourceNode.x, sourceNode.y, sourceNode.radius, targetNode.x, targetNode.y, targetNode.radius)
                  : straightEdgePath(sourceNode.x, sourceNode.y, sourceNode.radius, targetNode.x, targetNode.y, targetNode.radius);

                const arrowMarkerId = isAgentHierarchyEdge
                  ? `chat-graph-arrow-agent-depth-${Math.min(targetDepth, AGENT_DEPTH_COLORS.length - 1)}`
                  : `chat-graph-arrow-${targetNode.category}`;

                return (
                  <g key={`edge-group-${edgeIndex}`} className={`${graphStyles['connection-group']} ${isEdgeSelected ? graphStyles['connection-selected'] : ""}`}>
                    <path d={pathData} stroke="transparent" strokeWidth={8} fill="none" style={{ cursor: "pointer" }} />
                    <path
                      d={pathData}
                      stroke={edgeColor}
                      strokeWidth={isEdgeSelected ? 4 : isAgentHierarchyEdge ? 2 : 1.5}
                      strokeOpacity={edgeOpacity}
                      fill="none"
                      className={graphStyles['connection-line']}
                      markerEnd={`url(#${arrowMarkerId})`}
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {graphData.nodes.map((node) => {
                if (hiddenNodeIds.has(node.id)) return null;
                const isSelected = selectedNodeIds.has(node.id);
                const isSessionCenter = node.category === "session";
                const isAgentNode = node.category === "agent" || node.category === "subagent";
                const agentDepth = node.depth ?? 0;
                const isPhaseActive = (isSessionCenter || (isAgentNode && isGenerating)) && !!phaseRepresentativeColor;
                const isRequestWithTools = node.category === "request" && Array.isArray(node.metadata?.toolNames) && (node.metadata.toolNames as string[]).length > 0;
                const nodeColor = (isPhaseActive && phaseRepresentativeColor)
                  ? phaseRepresentativeColor
                  : isAgentNode
                    ? resolveAgentColorByDepth(agentDepth)
                    : isRequestWithTools
                      ? NODE_COLORS.tool
                      : NODE_COLORS[node.category];

                const isEntering = enteringNodeIds.has(node.id);

                // Detect pending (in-flight) request nodes from two-phase lifecycle
                const isPendingRequest = node.category === "request" && (node.metadata?.status as string) === "pending";

                // Derive live activity state from toolActivity props
                const isActiveRequestNode = node.category === "request" && (isGenerating || hasProactiveNode) && latestRequestNodeId === node.id;
                const isNodeLiveActive = isActiveRequestNode || isPendingRequest;

                // Check if this agent node has children in the sub-agent tree
                const hasSubAgentChildren = !!(isAgentNode && graphData.subAgentTree && (() => {
                  const findInTree = (treeNodes: SubAgentTreeNode[]): boolean => {
                    for (const treeNode of treeNodes) {
                      if (treeNode.nodeId === node.id) return treeNode.children.length > 0;
                      if (findInTree(treeNode.children)) return true;
                    }
                    return false;
                  };
                  // Also check if this is the root agent with top-level children
                  if (node.category === "agent" && graphData.subAgentTree.length > 0) return true;
                  return findInTree(graphData.subAgentTree);
                })());

                const isCollapsed = collapsedSubTreeIds.has(node.id);

                // Count hidden children for collapsed badge
                const collapsedChildCount = isCollapsed && graphData.subAgentTree ? (() => {
                  const countDescendants = (treeNodes: SubAgentTreeNode[]): number => {
                    let totalCount = 0;
                    for (const treeNode of treeNodes) {
                      totalCount += 1;
                      totalCount += countDescendants(treeNode.children);
                    }
                    return totalCount;
                  };
                  const findNodeChildren = (treeNodes: SubAgentTreeNode[]): SubAgentTreeNode[] => {
                    for (const treeNode of treeNodes) {
                      if (treeNode.nodeId === node.id) return treeNode.children;
                      const found = findNodeChildren(treeNode.children);
                      if (found.length > 0) return found;
                    }
                    return [];
                  };
                  return countDescendants(findNodeChildren(graphData.subAgentTree));
                })() : 0;

                return (
                  <g
                    key={node.id}
                    data-node-identifier={node.id}
                    className={`${graphStyles['node-group']}${isEntering ? ` ${graphStyles['node-entering']}` : ""}`}
                    onMouseDown={(event) => handleNodeMouseDown(event, node.id)}
                    onClick={(event) => handleNodeClick(event, node.id)}
                    filter={isPhaseActive ? "url(#chat-graph-session-glow)" : (isSelected || isNodeLiveActive) ? "url(#chat-graph-node-hover-glow)" : undefined}
                  >
                    {/* Phase-synced activity pulse ring for session center */}
                    {isPhaseActive && (
                      <circle
                        cx={node.x} cy={node.y}
                        r={node.radius + 8}
                        fill="none"
                        stroke={nodeColor}
                        strokeWidth={2}
                        strokeOpacity={0.5}
                        className={styles['phase-activity-pulse-ring']}
                      />
                    )}
                    {/* Live activity pulse ring for request/tool nodes */}
                    {isNodeLiveActive && (
                      <circle
                        cx={node.x} cy={node.y}
                        r={node.radius + 6}
                        fill="none"
                        stroke={nodeColor}
                        strokeWidth={2}
                        strokeOpacity={0.6}
                        className={
                          isPendingRequest
                            ? styles['pending-request-pulse-ring']
                            : styles['node-activity-pulse-ring']
                        }
                      />
                    )}
                    {/* Spawn ripple animation for entering agent nodes */}
                    {isEntering && isAgentNode && (
                      <circle
                        cx={node.x} cy={node.y}
                        r={node.radius + 30}
                        stroke={nodeColor}
                        className={styles['spawn-ripple-circle']}
                      />
                    )}
                    {isSelected && (
                      <circle
                        cx={node.x} cy={node.y} r={node.radius + 5}
                        fill="none" stroke={nodeColor} strokeWidth={2}
                        strokeOpacity={0.6} strokeDasharray="4 3"
                      />
                    )}
                    <circle
                      cx={node.x} cy={node.y} r={node.radius}
                      fill={isSelected ? "oklch(1 0 0)" : nodeColor} fillOpacity={isSelected ? 1 : isPhaseActive ? 0.95 : isNodeLiveActive ? 0.95 : 0.85}
                      stroke={nodeColor} strokeWidth={(isSelected || isNodeLiveActive || isPhaseActive) ? 2 : 1} strokeOpacity={(isPhaseActive || isNodeLiveActive) ? 0.8 : 0.5}
                    />
                    {node.category === "request" && typeof node.sequenceNumber === "number" ? (
                      <>
                        <circle cx={node.x + node.radius * 0.7} cy={node.y - node.radius * 0.7} r={8} fill="oklch(0.25 0 0)" stroke={nodeColor} strokeWidth={1.5} />
                        <text x={node.x + node.radius * 0.7} y={node.y - node.radius * 0.7} textAnchor="middle" dominantBaseline="central" fill="oklch(0.95 0 0)" fontSize={8} fontWeight={600}>
                          {node.sequenceNumber > 99 ? "99+" : node.sequenceNumber}
                        </text>
                      </>
                    ) : null}
                    {/* Depth label for nested sub-agents */}
                    {isAgentNode && agentDepth > 0 && (
                      <text
                        x={node.x}
                        y={node.y + node.radius + 12}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={nodeColor}
                        fontSize={8}
                        fontWeight={500}
                        opacity={0.6}
                        className={styles['depth-label-text']}
                      >
                        L{agentDepth}
                      </text>
                    )}
                    <text x={node.x + node.radius + 8} y={node.y} textAnchor="start" dominantBaseline="central" fill="oklch(0.75 0 0)" fontSize={10} fontWeight={500} style={{ pointerEvents: "none", userSelect: "none" }}>
                      {node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label}
                    </text>
                    {/* Node center icon — emojis, provider logos, or fallback symbols */}
                    {node.category === "request" && !!node.metadata?.provider && (
                      <foreignObject
                        x={node.x - node.radius * 0.45}
                        y={node.y - node.radius * 0.45}
                        width={node.radius * 0.9}
                        height={node.radius * 0.9}
                        style={{ pointerEvents: "none", overflow: "visible" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                          <ProviderLogo provider={resolveProviderLogoKey(String(node.metadata.provider))} size={Math.round(node.radius * 0.75)} />
                        </div>
                      </foreignObject>
                    )}
                    {/* Tool pill badges rendered below the request label (right of node) */}
                    {node.category === "request" && Array.isArray(node.metadata?.toolNames) && (node.metadata.toolNames as string[]).length > 0 && (
                      <foreignObject
                        x={node.x + node.radius + 8}
                        y={node.y + 8}
                        width={160}
                        height={Math.ceil((node.metadata.toolNames as string[]).length / 2) * 18 + 4}
                        style={{ pointerEvents: "none", overflow: "visible" }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                          {(node.metadata.toolNames as string[]).map((toolName: string, toolPillIndex: number) => {
                            const toolEmoji = toolEmojiMap.get(toolName);
                            const isImageEmoji = toolEmoji?.startsWith("http");
                            return (
                              <div
                                key={`${node.id}-tool-${toolPillIndex}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  background: "oklch(0.18 0.01 45 / 0.85)",
                                  border: "1px solid oklch(0.72 0.16 45 / 0.3)",
                                  borderRadius: "8px",
                                  padding: "1px 6px",
                                  fontSize: "8px",
                                  fontWeight: 500,
                                  color: "oklch(0.82 0.08 45)",
                                  whiteSpace: "nowrap",
                                  lineHeight: "14px",
                                }}
                              >
                                {isImageEmoji ? (
                                  <img src={toolEmoji} alt="" style={{ width: 10, height: 10, borderRadius: 2 }} />
                                ) : (
                                  <span style={{ fontSize: "9px" }}>{toolEmoji || "⚙"}</span>
                                )}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{toolName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </foreignObject>
                    )}
                    {node.category === "request" && !node.metadata?.provider && (
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" fontSize={28} style={{ pointerEvents: "none", userSelect: "none" }}>
                        🔗
                      </text>
                    )}
                    {node.category !== "request" && node.category !== "tool" && (
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" fontSize={28} style={{ pointerEvents: "none", userSelect: "none" }}>
                        {node.category === "session" ? CONVERSATION_EMOJI : node.category === "agent" ? AGENT_EMOJI : node.category === "subagent" ? resolveSubAgentEmoji(agentDepth) : node.category === "project" ? PROJECT_EMOJI : node.category === "user" ? "●" : node.category === "turn" ? "💬" : "○"}
                      </text>
                    )}
                    {/* Collapse/expand toggle badge for agents with children */}
                    {hasSubAgentChildren && (
                      <g
                        className={styles['collapsed-subtree-badge-group']}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSubTreeCollapse(node.id);
                        }}
                      >
                        <circle
                          cx={node.x - node.radius * 0.65}
                          cy={node.y - node.radius * 0.65}
                          r={9}
                          fill="oklch(0.2 0 0)"
                          stroke={nodeColor}
                          strokeWidth={1.5}
                        />
                        <text
                          x={node.x - node.radius * 0.65}
                          y={node.y - node.radius * 0.65}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="oklch(0.95 0 0)"
                          fontSize={8}
                          fontWeight={700}
                          style={{ pointerEvents: "none", userSelect: "none" }}
                        >
                          {isCollapsed ? `+${collapsedChildCount}` : "−"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            {!compact && (
              <div className={graphStyles['graph-legend']}>
                {(Object.entries(NODE_COLORS) as [NodeCategory, string][]).map(([category, color]) => (
                  <div key={category} className={graphStyles['graph-legend-item']}>
                    <span className={graphStyles['graph-legend-dot']} style={{ background: color }} />
                    {NODE_LABELS[category]}
                  </div>
                ))}
              </div>
            )}

            {/* Node detail popover */}
            {!compact && selectedNode && (
              <div className={graphStyles['node-detail-popover']}>
                <div className={graphStyles['node-detail-popover-header']}>
                  <div className={graphStyles['node-detail-popover-title']}>
                    <span
                      className={graphStyles['node-detail-popover-type']}
                      style={{
                        background: `color-mix(in oklch, ${NODE_COLORS[selectedNode.category]}, transparent 80%)`,
                        color: NODE_COLORS[selectedNode.category],
                      }}
                    >
                      {NODE_LABELS[selectedNode.category]}
                    </span>
                    {selectedNode.label}
                  </div>
                  <button
                    className={graphStyles['zoom-button']}
                    onClick={() => { setSelectedNodeIds(new Set()); setSelectedEdgeKeys(new Set()); setFocusedNodeId(null); }}
                    title="Close details"
                    aria-label="Close details"
                    style={{ width: 24, height: 24 }}
                  >
                    <X size={12} />
                  </button>
                </div>

                {selectedNode.category === "session" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Conversation Details</div>
                    <InlineDetailRow label="Conversation ID" value={String(selectedNode.metadata?.conversationId || "—").slice(0, 12) + "…"} />
                    <InlineDetailRow label="Status" value={String(selectedNode.metadata?.status || "—")} />
                    <InlineDetailRow label="Requests" value={formatNumber(Number(selectedNode.metadata?.requestCount || 0))} />
                    <InlineDetailRow label="Total Cost" value={formatCost(Number(selectedNode.metadata?.totalCost || 0))} />
                    <InlineDetailRow label="Total Tokens" value={formatNumber(Number(selectedNode.metadata?.totalTokens || 0))} />
                    {Number(selectedNode.metadata?.totalElapsedTime || 0) > 0 && (
                      <InlineDetailRow label="Duration" value={formatElapsedTime(Number(selectedNode.metadata?.totalElapsedTime))} />
                    )}
                    {selectedNode.metadata?.createdAt != null && (
                      <InlineDetailRow label="Created" value={formatTimeAgo(String(selectedNode.metadata.createdAt))} />
                    )}
                  </div>
                )}




                {selectedNode.category === "request" && (
                  <>
                    <div className={graphStyles['node-detail-popover-section']}>
                      <div className={graphStyles['node-detail-popover-section-title']}>Request Details</div>
                      {selectedNode.sequenceNumber != null && <InlineDetailRow label="Sequence" value={`#${selectedNode.sequenceNumber}`} />}
                      <InlineDetailRow label="Operation" value={String(selectedNode.metadata?.operation || "—")} />
                      {!!selectedNode.metadata?.model && <InlineDetailRow label="Model" value={cleanModelName(String(selectedNode.metadata.model))} />}
                      {!!selectedNode.metadata?.provider && <InlineDetailRow label="Provider" value={resolveProviderLabel(String(selectedNode.metadata.provider)) || String(selectedNode.metadata.provider)} />}
                      <InlineDetailRow label="Cost" value={formatCost(Number(selectedNode.metadata?.estimatedCost || 0))} />
                      {Number(selectedNode.metadata?.inputTokens || 0) > 0 && <InlineDetailRow label="Input Tokens" value={formatNumber(Number(selectedNode.metadata?.inputTokens))} />}
                      {Number(selectedNode.metadata?.outputTokens || 0) > 0 && <InlineDetailRow label="Output Tokens" value={formatNumber(Number(selectedNode.metadata?.outputTokens))} />}
                      {Number(selectedNode.metadata?.duration || 0) > 0 && <InlineDetailRow label="Duration" value={formatElapsedTime(Number(selectedNode.metadata?.duration))} />}
                      {selectedNode.metadata?.timestamp != null && <InlineDetailRow label="Timestamp" value={formatTimeAgo(String(selectedNode.metadata.timestamp))} />}
                    </div>

                    {Array.isArray(selectedNode.metadata?.toolNames) && (selectedNode.metadata.toolNames as string[]).length > 0 && (
                      <div className={graphStyles['node-detail-popover-section']}>
                        <div className={graphStyles['node-detail-popover-section-title']}>Tools Invoked</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBlockStart: "4px" }}>
                          {(selectedNode.metadata.toolNames as string[]).map((toolName: string, detailToolIndex: number) => {
                            const toolEmoji = toolEmojiMap.get(toolName);
                            const isImageEmoji = toolEmoji?.startsWith("http");
                            return (
                              <span
                                key={`detail-tool-${detailToolIndex}`}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  background: "oklch(0.22 0.01 45 / 0.8)",
                                  border: "1px solid oklch(0.72 0.16 45 / 0.25)",
                                  borderRadius: "6px",
                                  padding: "2px 8px",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  color: "oklch(0.82 0.08 45)",
                                }}
                              >
                                {isImageEmoji ? (
                                  <img src={toolEmoji} alt="" style={{ width: 12, height: 12, borderRadius: 2 }} />
                                ) : (
                                  <span style={{ fontSize: "11px" }}>{toolEmoji || "⚙"}</span>
                                )}
                                {toolName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {isRequestDetailLoading && (
                      <div className={graphStyles['request-payload-is-loading-state']}>
                        <Loader2 size={14} className={graphStyles['spinning-icon']} />
                        Loading payloads…
                      </div>
                    )}

                    {selectedRequestDetail && (
                      <InlineRequestPayloadSection
                        requestDetail={selectedRequestDetail}
                        expandedSections={expandedPopoverSections}
                        onToggleSection={togglePopoverSection}
                      />
                    )}
                  </>
                )}

                {selectedNode.category === "user" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>User Details</div>
                    <InlineDetailRow label="Username" value={String(selectedNode.metadata?.username || "—")} />
                  </div>
                )}

                {selectedNode.category === "agent" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Agent Details</div>
                    <InlineDetailRow label="Agent" value={String(selectedNode.metadata?.agent || "—")} />
                    <InlineDetailRow label="Role" value="Orchestrator" />
                  </div>
                )}

                {selectedNode.category === "subagent" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Sub-Agent Details</div>
                    <InlineDetailRow label="Agent" value={String(selectedNode.metadata?.agent || "—")} />
                    <InlineDetailRow label="Role" value="Sub-Agent" />
                    <InlineDetailRow label="Depth" value={`Level ${selectedNode.depth ?? 1}`} />
                    {!!selectedNode.metadata?.parentAgentConversationId && (
                      <InlineDetailRow label="Parent" value={String(selectedNode.metadata.parentAgentConversationId).slice(0, 12) + "…"} />
                    )}
                  </div>
                )}


                {selectedNode.category === "project" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Project Details</div>
                    <InlineDetailRow label="Project" value={String(selectedNode.metadata?.project || "—")} />
                  </div>
                )}

              </div>
            )}
          </>
          );
        })()}
      </div>
    </div>
  );
}

/* -- Local Detail Row ------------------------------------------ */

function InlineDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={graphStyles['node-detail-popover-layout-row']}>
      <span className={graphStyles['node-detail-popover-layout-row-label']}>{label}</span>
      <span className={graphStyles['node-detail-popover-layout-row-value']}>{value}</span>
    </div>
  );
}

/* -- Inline Collapsible Section -------------------------------- */

function InlineCollapsibleSectionHeader({
  label,
  icon: IconComponent,
  badgeCount,
  isExpanded,
  onToggle,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  badgeCount?: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button className={graphStyles['collapsible-section-header']} onClick={onToggle} aria-expanded={isExpanded}>
      <span className={graphStyles['collapsible-section-header-left']}>
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <IconComponent size={12} />
        {label}
      </span>
      {badgeCount != null && badgeCount > 0 && (
        <span className={graphStyles['collapsible-section-badge']}>{badgeCount}</span>
      )}
    </button>
  );
}

/* -- Inline Request Payload Section ---------------------------- */

interface RequestPayloadMessage {
  role?: string;
  content?: string | unknown[] | null;
  images?: string[] | unknown[];
}

interface RequestPayloadToolCall {
  name: string;
  id?: string | null;
  args?: unknown;
}

function InlineRequestPayloadSection({
  requestDetail,
  expandedSections,
  onToggleSection,
}: {
  requestDetail: IrisRequestEntry;
  expandedSections: Set<string>;
  onToggleSection: (key: string) => void;
}) {
  const requestPayload = requestDetail.requestPayload as { messages?: RequestPayloadMessage[] } | null;
  const responsePayload = requestDetail.responsePayload as {
    text?: string | null;
    thinking?: string | null;
    images?: string[];
    toolCalls?: RequestPayloadToolCall[] | null;
  } | null;

  const inputMessages = requestPayload?.messages || [];
  const userMessages = inputMessages.filter((message) => message.role === "user" && message.content);
  const outputText = responsePayload?.text || null;
  const thinkingText = responsePayload?.thinking || null;
  const outputImages = responsePayload?.images || [];
  const outputToolCalls = responsePayload?.toolCalls || [];

  const hasInput = userMessages.length > 0;
  const hasOutput = !!outputText || !!thinkingText;
  const hasAssets = outputImages.length > 0;
  const hasToolCalls = outputToolCalls.length > 0;

  if (!hasInput && !hasOutput && !hasAssets && !hasToolCalls) return null;

  return (
    <div className={`chat-conversation-graph-component ${graphStyles['request-payload-container']}`}>
      {hasInput && (
        <div className={graphStyles['request-payload-section']}>
          <InlineCollapsibleSectionHeader
            label="Input"
            icon={MessageSquare}
            badgeCount={userMessages.length}
            isExpanded={expandedSections.has("input")}
            onToggle={() => onToggleSection("input")}
          />
          {expandedSections.has("input") && (
            <div className={graphStyles['request-payload-content']}>
              {userMessages.map((message, messageIndex) => {
                const messageContent = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
                return (
                  <div key={messageIndex} className={graphStyles['request-message-block']}>
                    <span className={graphStyles['request-message-role-badge']}>{message.role || "user"}</span>
                    <div className={graphStyles['request-message-content']}>
                      {messageContent && messageContent.length > 500 ? `${messageContent.slice(0, 500)}\u2026` : messageContent}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {hasOutput && (
        <div className={graphStyles['request-payload-section']}>
          <InlineCollapsibleSectionHeader
            label="Output"
            icon={FileText}
            isExpanded={expandedSections.has("output")}
            onToggle={() => onToggleSection("output")}
          />
          {expandedSections.has("output") && (
            <div className={graphStyles['request-payload-content']}>
              {thinkingText && (
                <div className={graphStyles['request-message-block']}>
                  <span className={`${graphStyles['request-message-role-badge']} ${graphStyles['request-message-role-badge-thinking']}`}>thinking</span>
                  <div className={graphStyles['request-message-content']}>{thinkingText.length > 500 ? `${thinkingText.slice(0, 500)}\u2026` : thinkingText}</div>
                </div>
              )}
              {outputText && (
                <div className={graphStyles['request-message-block']}>
                  <span className={`${graphStyles['request-message-role-badge']} ${graphStyles['request-message-role-badge-assistant']}`}>assistant</span>
                  <div className={graphStyles['request-message-content']}>{outputText.length > 500 ? `${outputText.slice(0, 500)}\u2026` : outputText}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasAssets && (
        <div className={graphStyles['request-payload-section']}>
          <InlineCollapsibleSectionHeader
            label="Generated Assets"
            icon={ImageIcon}
            badgeCount={outputImages.length}
            isExpanded={expandedSections.has("assets")}
            onToggle={() => onToggleSection("assets")}
          />
          {expandedSections.has("assets") && (
            <div className={graphStyles['request-payload-content']}>
              <div className={graphStyles['request-assets-grid']}>
                {outputImages.map((imageUrl, imageIndex) => (
                  <a key={imageIndex} href={imageUrl} target="_blank" rel="noopener noreferrer" className={graphStyles['request-asset-thumbnail-link']}>
                    <img src={imageUrl} alt={`Generated asset ${imageIndex + 1}`} className={graphStyles['request-asset-thumbnail']} loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasToolCalls && (
        <div className={graphStyles['request-payload-section']}>
          <InlineCollapsibleSectionHeader
            label="Tool Calls"
            icon={Wrench}
            badgeCount={outputToolCalls.length}
            isExpanded={expandedSections.has("tools")}
            onToggle={() => onToggleSection("tools")}
          />
          {expandedSections.has("tools") && (
            <div className={graphStyles['request-payload-content']}>
              {outputToolCalls.map((toolCall, toolCallIndex) => (
                <div key={toolCallIndex} className={graphStyles['request-tool-call-block']}>
                  <div className={graphStyles['request-tool-call-name']}>
                    <Wrench size={11} />
                    {toolCall.name}
                  </div>
                  {toolCall.args != null && (
                    <pre className={graphStyles['request-tool-call-arguments']}>
                      {JSON.stringify(toolCall.args, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
