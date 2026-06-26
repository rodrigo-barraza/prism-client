"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  type IrisCollectionChangeEvent,
} from "../services/IrisService";
import PrismService from "../services/PrismService";
import type { AgentConversation, ConversationStats, ToolCallEvent, ToolSchema } from "../types/types";
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

type NodeCategory =
  | "session"
  | "model"
  | "tool"
  | "request"
  | "user"
  | "project"
  | "provider"
  | "agent"
  | "subagent"
  | "embedding";

interface GraphNode {
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

interface GraphEdge {
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

interface ContainmentHalo {
  parentNodeId: string;
  childNodeIds: string[];
  depth: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  subAgentTree: SubAgentTreeNode[];
  containmentHalos: ContainmentHalo[];
}

const NODE_COLORS: Record<NodeCategory, string> = {
  project: "oklch(0.72 0.15 120)",
  user: "oklch(0.72 0.14 330)",
  session: "oklch(0.72 0.18 280)",
  agent: "oklch(0.72 0.16 300)",
  subagent: "oklch(0.68 0.14 270)",
  request: "oklch(0.65 0.12 220)",
  model: "oklch(0.72 0.15 160)",
  embedding: "oklch(0.70 0.13 75)",
  provider: "oklch(0.68 0.14 200)",
  tool: "oklch(0.72 0.16 45)",
};

const PROACTIVE_PENDING_REQUEST_NODE_ID = "request:proactive-pending";

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
  model: "Model",
  embedding: "Embedding",
  provider: "Provider",
  tool: "Tool",
};

// Dynamically computes the column tier for a node based on the maximum
// sub-agent depth observed in the graph. Sub-agents at depth N occupy
// tier 2 + N, and all downstream categories (request, tool, model,
// provider) shift right accordingly. This scales to any depth without
// hardcoded tier slots. Empty tiers are collapsed by the layout logic.
function computeNodeTier(node: GraphNode, maximumSubAgentDepth: number): number {
  const firstDownstreamTier = 3 + maximumSubAgentDepth;
  switch (node.category) {
    case "project":
    case "user":
      return 0;
    case "session":
      return 1;
    case "agent":
      return 2;
    case "subagent":
      return 2 + (node.depth ?? 1);
    case "request":
      return firstDownstreamTier;
    case "model":
    case "embedding":
      return firstDownstreamTier + 1;
    case "provider":
      return firstDownstreamTier + 2;
    case "tool":
      return firstDownstreamTier + 3;
    default:
      return firstDownstreamTier;
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

  const providerNodeIds = new Set<string>();
  const modelNodeIds = new Set<string>();
  const userSet = new Set<string>();
  const addedToolNames = new Set<string>();

  // Build sub-agent conversation ID → node ID mapping for tree reconstruction
  const agentConversationIdToNodeId = new Map<string, string>();
  agentConversationIdToNodeId.set(mainAgentConversationId, parentAgentNodeId);

  const sortedRequests = [...conversationRequests].sort((requestA, requestB) => {
    const timestampA = requestA.timestamp ? new Date(requestA.timestamp).getTime() : 0;
    const timestampB = requestB.timestamp ? new Date(requestB.timestamp).getTime() : 0;
    return timestampA - timestampB;
  });

  // First pass: discover all sub-agent nodes and their parent relationships
  const subAgentParentMap = new Map<string, string>();
  const subAgentNodeIdList: string[] = [];

  for (const request of sortedRequests) {
    const requestAgentConversationId = request.agentConversationId || mainAgentConversationId;
    // A request is a sub-agent ONLY if it has an explicit parentAgentConversationId.
    // Different agentConversationId values without a parent are just different turns
    // of the same top-level agent (the server generates a new UUID per turn).
    const isSubAgent = !!request.parentAgentConversationId;

    if (isSubAgent) {
      const currentAgentNodeId = `agent:${requestAgentConversationId}:${request.agent || AGENT_IDS.OMNI}`;
      if (!agentConversationIdToNodeId.has(requestAgentConversationId)) {
        agentConversationIdToNodeId.set(requestAgentConversationId, currentAgentNodeId);
        const actualParentConversationId = request.parentAgentConversationId || mainAgentConversationId;
        subAgentParentMap.set(requestAgentConversationId, actualParentConversationId);
        subAgentNodeIdList.push(currentAgentNodeId);
      }
    }
  }

  // Compute depth for each sub-agent by walking up the parent chain
  const subAgentDepthMap = new Map<string, number>();
  const computeDepth = (agentConversationId: string): number => {
    if (agentConversationId === mainAgentConversationId) return 0;
    if (subAgentDepthMap.has(agentConversationId)) return subAgentDepthMap.get(agentConversationId)!;
    const parentConversationId = subAgentParentMap.get(agentConversationId) || mainAgentConversationId;
    const depth = computeDepth(parentConversationId) + 1;
    subAgentDepthMap.set(agentConversationId, depth);
    return depth;
  };

  for (const agentConversationId of subAgentParentMap.keys()) {
    computeDepth(agentConversationId);
  }

  // Second pass: create nodes and edges for all requests
  for (let requestIndex = 0; requestIndex < sortedRequests.length; requestIndex++) {
    const request = sortedRequests[requestIndex];
    const sequenceNumber = requestIndex + 1;
    const isEmbeddingRequest = request.operation?.startsWith("embed:");
    const operationLabel = request.operation || "unknown";
    const requestNodeId = `request:${request._id || requestIndex}`;

    addNode(requestNodeId, `#${sequenceNumber} ${operationLabel}`, "request", 24, {
      operation: operationLabel,
      estimatedCost: request.estimatedCost,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      duration: request.duration,
      timestamp: request.timestamp,
      status: request.status,
      requestId: request.requestId || request._id,
    }, sequenceNumber);

    const requestAgentConversationId = request.agentConversationId || mainAgentConversationId;
    const isSubAgent = !!request.parentAgentConversationId;
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

    addEdge(currentAgentNodeId, requestNodeId, 0.5);

    if (requestIndex > 0) {
      const previousRequest = sortedRequests[requestIndex - 1];
      const previousAgentConversationId = previousRequest.agentConversationId || mainAgentConversationId;
      const previousIsSubAgent = !!previousRequest.parentAgentConversationId;
      // Chain sequential requests: same sub-agent, OR both are main-agent turns
      const isSameAgentContext = previousIsSubAgent === isSubAgent && (
        previousAgentConversationId === requestAgentConversationId ||
        (!isSubAgent && !previousIsSubAgent)
      );
      if (isSameAgentContext) {
        const previousRequestNodeId = `request:${previousRequest._id || (requestIndex - 1)}`;
        addEdge(previousRequestNodeId, requestNodeId, 0.6);
      }
    }

    if (request.model) {
      const modelNodeId = `model:${request.model}`;
      const modelCategory: NodeCategory = "model";
      if (!modelNodeIds.has(modelNodeId)) {
        modelNodeIds.add(modelNodeId);
        addNode(modelNodeId, cleanModelName(request.model), modelCategory, 24, { fullModelName: request.model });
      }
      addEdge(requestNodeId, modelNodeId, 0.9);

      if (request.provider) {
        const providerNodeId = `provider:${request.provider}`;
        if (!providerNodeIds.has(providerNodeId)) {
          providerNodeIds.add(providerNodeId);
          addNode(providerNodeId, resolveProviderLabel(request.provider) || request.provider, "provider", 24, { provider: request.provider });
        }
        addEdge(modelNodeId, providerNodeId, 0.7);
      }
    }

    if (request.toolApiNames?.length) {
      const toolParentNodeId = request.provider
        ? `provider:${request.provider}`
        : requestNodeId;
      for (const toolName of request.toolApiNames) {
        const uniqueToolNodeId = `tool:${request._id || requestIndex}:${toolName}`;
        const invocationsInRequest = request.toolApiNames.filter((name) => name === toolName).length;
        addNode(uniqueToolNodeId, toolName, "tool", 24, { toolName, usageCount: invocationsInRequest });
        addEdge(toolParentNodeId, uniqueToolNodeId, 0.7);
        addedToolNames.add(toolName);
      }
    }

    if (request.username && request.username !== DEFAULT_USERNAME && request.username !== "system") {
      userSet.add(request.username);
    }
  }

  if (conversationStats?.toolCounts) {
    for (const [toolName, usageCount] of Object.entries(conversationStats.toolCounts)) {
      if (!addedToolNames.has(toolName)) {
        const fallbackToolNodeId = `tool:fallback:${toolName}`;
        addNode(fallbackToolNodeId, toolName, "tool", 24, { toolName, usageCount });
        addEdge(parentAgentNodeId, fallbackToolNodeId, 0.7);
      }
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

  // Create edges based on the tree structure using straight paths for parent→child agent links
  const createTreeEdges = (treeNodes: SubAgentTreeNode[], parentNodeId: string) => {
    for (const treeNode of treeNodes) {
      addEdge(parentNodeId, treeNode.nodeId, 0.9, false);
      if (treeNode.children.length > 0) {
        createTreeEdges(treeNode.children, treeNode.nodeId);
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
      createTreeEdges(subAgentTree, parentAgentNodeId);
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
      createTreeEdges(subAgentTree, parentAgentNodeId);
      // Add inter-sibling edges at depth 1
      for (let index = 0; index < subAgentTree.length; index++) {
        for (let nextIndex = index + 1; nextIndex < subAgentTree.length; nextIndex++) {
          addEdge(subAgentTree[index].nodeId, subAgentTree[nextIndex].nodeId, 0.4);
        }
      }
    } else {
      // Default: use tree-aware curved edges
      createTreeEdges(subAgentTree, parentAgentNodeId);
    }
  }

  // Build containment halos for agents that have children in the tree
  const containmentHalos: ContainmentHalo[] = [];

  const buildContainmentHalos = (treeNodes: SubAgentTreeNode[], parentNodeId: string, parentDepth: number) => {
    const childNodeIds = treeNodes.map((treeNode) => treeNode.nodeId);
    if (childNodeIds.length > 0) {
      containmentHalos.push({
        parentNodeId,
        childNodeIds,
        depth: parentDepth,
      });
    }
    for (const treeNode of treeNodes) {
      if (treeNode.children.length > 0) {
        const childDepth = (subAgentDepthMap.get(treeNode.agentConversationId) || 1);
        buildContainmentHalos(treeNode.children, treeNode.nodeId, childDepth);
      }
    }
  };

  buildContainmentHalos(subAgentTree, parentAgentNodeId, 0);

  return { nodes, edges, subAgentTree, containmentHalos };
}

function flattenSubAgentTree(treeNodes: SubAgentTreeNode[]): string[] {
  const result: string[] = [];
  for (const treeNode of treeNodes) {
    result.push(treeNode.nodeId);
    result.push(...flattenSubAgentTree(treeNode.children));
  }
  return result;
}

function applyRecursiveRadialSubAgentLayout(
  treeNodes: SubAgentTreeNode[],
  parentNode: GraphNode,
  nodeMap: Map<string, GraphNode>,
  depth: number,
  baseAngle: number,
  arcSpan: number,
): void {
  const orbitRadius = Math.max(80, 160 - depth * 25);
  const childCount = treeNodes.length;

  for (let childIndex = 0; childIndex < childCount; childIndex++) {
    const treeChild = treeNodes[childIndex];
    const childNode = nodeMap.get(treeChild.nodeId);
    if (!childNode) continue;

    const angleOffset = childCount === 1
      ? baseAngle
      : baseAngle - arcSpan / 2 + (childIndex / (childCount - 1)) * arcSpan;

    childNode.x = parentNode.x + Math.cos(angleOffset) * orbitRadius;
    childNode.y = parentNode.y + Math.sin(angleOffset) * orbitRadius;

    if (treeChild.children.length > 0) {
      // Continue fan-out rightward, clamping to right hemisphere
      const childAngle = Math.abs(angleOffset) > Math.PI / 2
        ? Math.sign(angleOffset) * Math.PI / 4
        : angleOffset;
      applyRecursiveRadialSubAgentLayout(
        treeChild.children,
        childNode,
        nodeMap,
        depth + 1,
        childAngle,
        arcSpan * 0.65,
      );
    }
  }
}

function applyColumnarSubAgentLayout(
  treeNodes: SubAgentTreeNode[],
  parentNode: GraphNode,
  nodeMap: Map<string, GraphNode>,
  verticalSpacing: number,
  depth: number,
): void {
  const columnOffset = 160;
  const childCount = treeNodes.length;
  const childStartY = parentNode.y - ((childCount - 1) * verticalSpacing) / 2;

  for (let childIndex = 0; childIndex < childCount; childIndex++) {
    const treeChild = treeNodes[childIndex];
    const childNode = nodeMap.get(treeChild.nodeId);
    if (!childNode) continue;

    childNode.x = parentNode.x + columnOffset;
    childNode.y = childStartY + childIndex * verticalSpacing;

    if (treeChild.children.length > 0) {
      applyColumnarSubAgentLayout(
        treeChild.children,
        childNode,
        nodeMap,
        verticalSpacing * 0.8,
        depth + 1,
      );
    }
  }
}

function applyHierarchicalLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes } = graphData;
  if (graphNodes.length === 0) return;

  const maximumSubAgentDepth = graphNodes.reduce((maxDepth, node) => {
    if (node.category === "subagent" && node.depth !== undefined) {
      return Math.max(maxDepth, node.depth);
    }
    return maxDepth;
  }, 0);

  const tierBuckets: Map<number, GraphNode[]> = new Map();
  for (const node of graphNodes) {
    const tier = computeNodeTier(node, maximumSubAgentDepth);
    if (!tierBuckets.has(tier)) tierBuckets.set(tier, []);
    tierBuckets.get(tier)!.push(node);
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
    // Compute spacing so the column always fits within 90% of viewport height.
    // For small columns this yields generous spacing (capped at 80px);
    // for large columns the spacing compresses proportionally. The collision
    // physics loop handles final node separation to prevent exact overlap.
    const proportionalSpacing = tierNodes.length > 1
      ? (canvasHeight * 0.9) / (tierNodes.length - 1)
      : canvasHeight * 0.9;
    const verticalSpacing = Math.min(80, proportionalSpacing);
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
  const subAgentNodes = graphNodes.filter((graphNode) => graphNode.category === "subagent");
  
  const otherNodes = graphNodes.filter((graphNode) => 
    graphNode.category !== "project" && 
    graphNode.category !== "user" && 
    graphNode.category !== "session" && 
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent"
  );

  const centerY = canvasHeight / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  if (mainAgentNode) {
    mainAgentNode.x = 130;
    mainAgentNode.y = centerY;
  }

  const subAgentCount = subAgentNodes.length;
  const subAgentColumnX = 320;
  const subAgentAdaptiveSpacing = subAgentCount > 1
    ? (canvasHeight * 0.8) / (subAgentCount - 1)
    : canvasHeight * 0.8;
  const subAgentVerticalSpacing = Math.max(48, Math.min(80, subAgentAdaptiveSpacing));
  const subAgentStartY = centerY - ((subAgentCount - 1) * subAgentVerticalSpacing) / 2;

  for (let index = 0; index < subAgentCount; index++) {
    const subAgent = subAgentNodes[index];
    subAgent.x = subAgentColumnX;
    subAgent.y = subAgentStartY + index * subAgentVerticalSpacing;
  }

  const toolCounterByParent = new Map<string, number>();
  const modelCounterByParent = new Map<string, number>();

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
      } else if (node.category === "model" || node.category === "embedding") {
        const modelIndex = modelCounterByParent.get(parentNode.id) || 0;
        modelCounterByParent.set(parentNode.id, modelIndex + 1);
        node.x = parentNode.x + 80 + modelIndex * 30;
        node.y = parentNode.y + (modelIndex % 3) * 35;
      } else if (node.category === "provider") {
        node.x = parentNode.x + 80;
        node.y = parentNode.y + 50;
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
  const subAgentNodes = graphNodes.filter((graphNode) => graphNode.category === "subagent");
  
  const otherNodes = graphNodes.filter((graphNode) => 
    graphNode.category !== "project" && 
    graphNode.category !== "user" && 
    graphNode.category !== "session" && 
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent"
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

  const subAgentCount = subAgentNodes.length;
  const radius = Math.min(180, Math.min(canvasWidth, canvasHeight) / 3);

  for (let index = 0; index < subAgentCount; index++) {
    const subAgent = subAgentNodes[index];
    const angle = (index * 2 * Math.PI) / Math.max(1, subAgentCount);
    subAgent.x = centerX + Math.cos(angle) * radius;
    subAgent.y = centerY + Math.sin(angle) * radius;
  }

  const peerToolCounter = new Map<string, number>();
  const peerModelCounter = new Map<string, number>();

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
      } else if (node.category === "model" || node.category === "embedding") {
        const modelIndex = peerModelCounter.get(parentNode.id) || 0;
        peerModelCounter.set(parentNode.id, modelIndex + 1);
        node.x = parentNode.x + 70 + modelIndex * 25;
        node.y = parentNode.y + (modelIndex % 3) * 30;
      } else if (node.category === "provider") {
        node.x = parentNode.x + 70;
        node.y = parentNode.y + 45;
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
  const subAgentNodes = graphNodes.filter((graphNode) => graphNode.category === "subagent");

  const otherNodes = graphNodes.filter((graphNode) =>
    graphNode.category !== "project" &&
    graphNode.category !== "user" &&
    graphNode.category !== "session" &&
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent"
  );

  const centerX = canvasWidth / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  // Vertical chain: orchestrator → actor → critic(s), centered horizontally
  if (mainAgentNode) {
    mainAgentNode.x = centerX;
    mainAgentNode.y = 220;
  }

  const subAgentCount = subAgentNodes.length;
  const verticalSpacing = Math.max(90, (canvasHeight - 300) / Math.max(1, subAgentCount));

  for (let index = 0; index < subAgentCount; index++) {
    const subAgent = subAgentNodes[index];
    subAgent.x = centerX;
    subAgent.y = 320 + index * verticalSpacing;
  }

  const criticToolCounter = new Map<string, number>();
  const criticModelCounter = new Map<string, number>();

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
      } else if (node.category === "model" || node.category === "embedding") {
        const modelIndex = criticModelCounter.get(parentNode.id) || 0;
        criticModelCounter.set(parentNode.id, modelIndex + 1);
        node.x = parentNode.x + 80 + modelIndex * 25;
        node.y = parentNode.y + (modelIndex % 3) * 30;
      } else if (node.category === "provider") {
        node.x = parentNode.x + 80;
        node.y = parentNode.y + 50;
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
  const subAgentNodes = graphNodes.filter((graphNode) => graphNode.category === "subagent");

  const otherNodes = graphNodes.filter((graphNode) =>
    graphNode.category !== "project" &&
    graphNode.category !== "user" &&
    graphNode.category !== "session" &&
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent"
  );

  const centerX = canvasWidth / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  // Fan-out: orchestrator on top, candidates spread horizontally below
  if (mainAgentNode) {
    mainAgentNode.x = centerX;
    mainAgentNode.y = 220;
  }

  const subAgentCount = subAgentNodes.length;
  const horizontalSpacing = Math.max(120, (canvasWidth - 200) / Math.max(1, subAgentCount));
  const startX = (canvasWidth - (subAgentCount - 1) * horizontalSpacing) / 2;

  for (let index = 0; index < subAgentCount; index++) {
    const subAgent = subAgentNodes[index];
    subAgent.x = startX + index * horizontalSpacing;
    subAgent.y = 360;
  }

  const tournamentToolCounter = new Map<string, number>();
  const tournamentModelCounter = new Map<string, number>();

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
      } else if (node.category === "model" || node.category === "embedding") {
        const modelIndex = tournamentModelCounter.get(parentNode.id) || 0;
        tournamentModelCounter.set(parentNode.id, modelIndex + 1);
        node.x = parentNode.x + 80 + modelIndex * 25;
        node.y = parentNode.y + (modelIndex % 3) * 30;
      } else if (node.category === "provider") {
        node.x = parentNode.x + 80;
        node.y = parentNode.y + 50;
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
  const subAgentNodes = graphNodes.filter((graphNode) => graphNode.category === "subagent");

  const otherNodes = graphNodes.filter((graphNode) =>
    graphNode.category !== "project" &&
    graphNode.category !== "user" &&
    graphNode.category !== "session" &&
    graphNode.category !== "agent" &&
    graphNode.category !== "subagent"
  );

  const centerX = canvasWidth / 2;

  if (projectNode) { projectNode.x = 80; projectNode.y = 80; }
  if (userNode) { userNode.x = 180; userNode.y = 80; }
  if (sessionNode) { sessionNode.x = 130; sessionNode.y = 150; }

  // Tree: root on top, children fan out with increasing horizontal spread per depth
  if (mainAgentNode) {
    mainAgentNode.x = centerX;
    mainAgentNode.y = 220;
  }

  // Approximate tree depth assignment: groups of branchFactor (default 3)
  const branchFactor = 3;
  const subAgentCount = subAgentNodes.length;
  let depthStart = 0;
  let currentDepth = 0;
  let nodesAtCurrentDepth = branchFactor;

  while (depthStart < subAgentCount) {
    const depthEnd = Math.min(depthStart + nodesAtCurrentDepth, subAgentCount);
    const depthNodeCount = depthEnd - depthStart;
    const depthY = 320 + currentDepth * 120;
    const depthSpread = Math.max(100, (canvasWidth - 200) / Math.max(1, depthNodeCount));
    const depthStartX = (canvasWidth - (depthNodeCount - 1) * depthSpread) / 2;

    for (let index = depthStart; index < depthEnd; index++) {
      const subAgent = subAgentNodes[index];
      subAgent.x = depthStartX + (index - depthStart) * depthSpread;
      subAgent.y = depthY;
    }

    depthStart = depthEnd;
    currentDepth++;
    nodesAtCurrentDepth = depthNodeCount * branchFactor;
  }

  const mctsToolCounter = new Map<string, number>();
  const mctsModelCounter = new Map<string, number>();

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
      } else if (node.category === "model" || node.category === "embedding") {
        const modelIndex = mctsModelCounter.get(parentNode.id) || 0;
        mctsModelCounter.set(parentNode.id, modelIndex + 1);
        node.x = parentNode.x + 70 + modelIndex * 25;
        node.y = parentNode.y + (modelIndex % 3) * 28;
      } else if (node.category === "provider") {
        node.x = parentNode.x + 70;
        node.y = parentNode.y + 45;
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

function applyTopologyLayout(
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

  // After base layout, position sub-agent trees in a dedicated column to the right of the agent
  if (graphData.subAgentTree && graphData.subAgentTree.length > 0) {
    const nodeMap = new Map(graphData.nodes.map((node) => [node.id, node]));
    const mainAgentNode = graphData.nodes.find(
      (graphNode) => graphNode.category === "agent"
    );

    if (mainAgentNode) {
      const subAgentColumnOffset = 200;
      const topLevelCount = graphData.subAgentTree.length;
      // Viewport-adaptive spacing: keep sub-agents within 80% of viewport
      // height, with a minimum of node diameter to prevent overlap.
      const subAgentAdaptiveSpacing = topLevelCount > 1
        ? (canvasHeight * 0.8) / (topLevelCount - 1)
        : canvasHeight * 0.8;
      const subAgentVerticalSpacing = Math.max(48, Math.min(80, subAgentAdaptiveSpacing));
      const subAgentStartY = mainAgentNode.y - ((topLevelCount - 1) * subAgentVerticalSpacing) / 2;

      for (let childIndex = 0; childIndex < topLevelCount; childIndex++) {
        const treeChild = graphData.subAgentTree[childIndex];
        const childNode = nodeMap.get(treeChild.nodeId);
        if (!childNode) continue;

        childNode.x = mainAgentNode.x + subAgentColumnOffset;
        childNode.y = subAgentStartY + childIndex * subAgentVerticalSpacing;

        // Recursively position nested sub-agents in subsequent columns further right
        if (treeChild.children.length > 0) {
          applyColumnarSubAgentLayout(
            treeChild.children,
            childNode,
            nodeMap,
            subAgentVerticalSpacing,
            1,
          );
        }
      }
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
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function ChatConversationGraphComponent({ conversationId, toolActivity = [], isGenerating = false, compact = false }: ChatConversationGraphComponentProps) {
  const [conversation, setConversation] = useState<AgentConversation | null>(null);
  const [conversationStats, setConversationStats] = useState<ConversationStats | null>(null);
  const [conversationRequests, setConversationRequests] = useState<IrisRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeKeys, setSelectedEdgeKeys] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [enteringNodeIds, setEnteringNodeIds] = useState<Set<string>>(new Set());
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [collapsedSubTreeIds, setCollapsedSubTreeIds] = useState<Set<string>>(new Set());
  const [toolEmojiMap, setToolEmojiMap] = useState<Map<string, string>>(new Map());

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

  // Fetch tool schemas once to build emoji map for tool nodes
  useEffect(() => {
    let isCancelled = false;
    PrismService.getBuiltInToolSchemas()
      .then((toolSchemas: ToolSchema[]) => {
        if (isCancelled) return;
        const emojiMap = new Map<string, string>();
        for (const toolSchema of toolSchemas) {
          if (toolSchema.emoji) {
            const resolvedEmoji = Array.isArray(toolSchema.emoji) ? toolSchema.emoji[0] : toolSchema.emoji;
            if (resolvedEmoji) emojiMap.set(toolSchema.name, resolvedEmoji);
          }
        }
        setToolEmojiMap(emojiMap);
      })
      .catch(() => { /* Tool emojis are cosmetic — fail silently */ });
    return () => { isCancelled = true; };
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
  const isGeneratingRef = useRef(isGenerating);
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);
  const lastMousePositionRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  const [draggedNode, setDraggedNode] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const conversationRef = useRef<AgentConversation | null>(null);
  const conversationRequestsRef = useRef<IrisRequestEntry[]>([]);
  const conversationStatsRef = useRef<ConversationStats | null>(null);

  // Coordination flag: when the SSE bootstrap or an SSE insert handler
  // has already populated graph data for the current conversation, the
  // initial loadGraph fetch must NOT blindly overwrite that data — doing
  // so would regress request nodes that arrived via the real-time path.
  const ssePopulatedForConversationRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { conversationRef.current = conversation; }, [conversation]);
  useEffect(() => { conversationRequestsRef.current = conversationRequests; }, [conversationRequests]);
  useEffect(() => { conversationStatsRef.current = conversationStats; }, [conversationStats]);

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

  // -- Collision physics -----------------------------------------
  const nodesRef = useRef<GraphNode[]>([]);
  const draggingRef = useRef<{ id: string } | null>(null);
  const rafRef = useRef<number | null>(null);
  const settleCountRef = useRef<number>(0);
  const collisionTickRef = useRef<(() => void) | null>(null);
  const previousNodeCountRef = useRef<number>(0);

  useEffect(() => { nodesRef.current = graphData?.nodes || []; }, [graphData?.nodes]);
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
  // Whenever the node count increases (new nodes entered the graph),
  // smoothly animate the viewport to fit all nodes. This fires on
  // the React commit cycle as a safety net — guaranteeing centering
  // happens even if an imperative code path omits the call.
  useEffect(() => {
    const currentNodeCount = graphData?.nodes.length ?? 0;
    if (currentNodeCount > previousNodeCountRef.current && previousNodeCountRef.current > 0) {
      animateToFitTransform();
    }
    previousNodeCountRef.current = currentNodeCount;
  }, [graphData?.nodes.length, animateToFitTransform]);

  // -- Incremental rebuild ---------------------------------------
  const incrementalGraphRebuild = useCallback((
    activeConversation: AgentConversation,
    updatedStats: ConversationStats | null,
    updatedRequests: IrisRequestEntry[],
  ) => {
    // Cancel any running collision loop BEFORE rebuilding. The collision
    // tick reads positions from nodesRef (stale until React re-renders)
    // and writes absolute positions via setGraphData, which would
    // overwrite the correct layout positions computed below.
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const existingPositions = new Map<string, { x: number; y: number }>();
    const existingNodeIds = new Set<string>();

    setGraphData((previousGraphData) => {
      if (previousGraphData) {
        for (const node of previousGraphData.nodes) {
          existingPositions.set(node.id, { x: node.x, y: node.y });
          existingNodeIds.add(node.id);
        }
      }

      const graph = buildGraphFromConversation(activeConversation, updatedStats, updatedRequests);
      const newNodeIds = new Set<string>();
      for (const node of graph.nodes) {
        if (!existingNodeIds.has(node.id)) newNodeIds.add(node.id);
      }

      // Determine which categories gained new nodes — those columns
      // must be fully re-laid-out to maintain vertical centering
      const categoriesWithNewNodes = new Set<NodeCategory>();
      for (const node of graph.nodes) {
        if (newNodeIds.has(node.id)) {
          categoriesWithNewNodes.add(node.category);
        }
      }

      const topology = activeConversation.settings?.agents?.topology || "hierarchical";
      applyTopologyLayout(graph, dimensions.width, dimensions.height, topology);

      // Preserve old positions only for categories that didn't change.
      // Categories that gained new nodes get fully re-laid-out so the
      // entire column re-centers vertically instead of stacking.
      for (const node of graph.nodes) {
        if (categoriesWithNewNodes.has(node.category)) continue;
        const previousPosition = existingPositions.get(node.id);
        if (previousPosition) {
          node.x = previousPosition.x;
          node.y = previousPosition.y;
        }
      }

      // Eagerly synchronize nodesRef so the collision loop (restarted
      // by the caller) reads the correct layout positions on its first
      // tick instead of stale pre-rebuild positions.
      nodesRef.current = graph.nodes;

      if (newNodeIds.size > 0) {
        setEnteringNodeIds(newNodeIds);
        setTimeout(() => setEnteringNodeIds(new Set()), 600);
      }

      return graph;
    });

    // Smoothly animate the viewport to fit all nodes whenever the
    // graph changes during generation, so the view stays centered
    // and all nodes remain visible without jarring instant snaps.
    animateToFitTransform();
  }, [dimensions, animateToFitTransform]);

  // -- Load session graph ----------------------------------------
  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setConversationStats(null);
      setConversationRequests([]);
      setGraphData(null);
      setSelectedNodeIds(new Set());
      setSelectedEdgeKeys(new Set());
      setFocusedNodeId(null);
      ssePopulatedForConversationRef.current = null;
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    // Reset the SSE coordination flag for the new conversation so
    // the first successful data source (loadGraph OR SSE bootstrap)
    // populates the graph without being blocked.
    ssePopulatedForConversationRef.current = null;
    // Preserve existing graphData — don't nuke the canvas. For a
    // brand-new conversation the graph will be null anyway; for a
    // conversation switch the old graph fades out via the
    // incremental rebuild once new data arrives.
    setSelectedNodeIds(new Set());
    setSelectedEdgeKeys(new Set());
    setFocusedNodeId(null);

    const loadGraph = async () => {
      try {
        const fetchedConversation = await IrisService.getAgentConversation(conversationId);
        if (isCancelled) return;

        // If the SSE bootstrap or an SSE event handler has already
        // populated graph data for this conversation while our async
        // fetch was in flight, yield to avoid overwriting with stale
        // data that may be missing recently-inserted request nodes.
        if (ssePopulatedForConversationRef.current === conversationId) {
          setIsLoading(false);
          return;
        }

        const [statsResponse, requestsResponse] = await Promise.all([
          IrisService.getConversationRunStats(conversationId).catch(() => null),
          IrisService.getConversationRequests(conversationId).catch(() => ({ requests: [] })),
        ]);

        if (isCancelled) return;

        // Re-check after the second await — SSE may have populated
        // data during the stats/requests fetch.
        if (ssePopulatedForConversationRef.current === conversationId) {
          setIsLoading(false);
          return;
        }

        setConversation(fetchedConversation);
        setConversationStats(statsResponse);
        const requestsList = requestsResponse.requests || [];
        setConversationRequests(requestsList);

        const graph = buildGraphFromConversation(fetchedConversation, statsResponse, requestsList);
        const topology = fetchedConversation.settings?.agents?.topology || "hierarchical";
        applyTopologyLayout(graph, dimensions.width, dimensions.height, topology);
        setGraphData(graph);

        const fitTransform = computeFitToGraphTransform(graph.nodes, dimensions.width, dimensions.height);
        setZoom(fitTransform.zoom);
        setPanOffset(fitTransform.panOffset);
        setIsLoading(false);
      } catch {
        // Conversation may not exist yet (new conversation) —
        // silently clear loading so the SSE cold-start bootstrap
        // can populate the graph when the first request lands.
        // The canvas stays visible (empty) instead of flashing a spinner.
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadGraph();
    return () => { isCancelled = true; };
  }, [conversationId, dimensions.width, dimensions.height]);

  // -- SSE live updates ------------------------------------------
  // Uses per-event incremental streaming: each MongoDB Change Stream
  // event triggers an immediate single-request fetch and graph rebuild,
  // so request nodes appear one-by-one in real-time instead of in batches.
  useEffect(() => {
    if (!conversationId) return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let isBootstrapping = false;
    let isCancelled = false;

    // Buffer SSE events that arrive during the cold-start bootstrap
    // phase so they can be replayed after bootstrap completes.
    // Without this, rapid insert events (e.g. memory:embed,
    // workflow-query:embed) that fire while bootstrap is running
    // are silently discarded — causing the graph to show only a
    // single straight line until the user refreshes the page.
    let pendingEventsBuffer: IrisCollectionChangeEvent[] = [];

    // Track known request IDs to prevent duplicate appends from
    // concurrent SSE events or re-deliveries
    const knownRequestIds = new Set<string>();
    for (const existingRequest of conversationRequestsRef.current) {
      if (existingRequest._id) knownRequestIds.add(existingRequest._id);
    }


    const performColdStartBootstrap = async () => {
      if (isBootstrapping || isCancelled) return;
      isBootstrapping = true;
      try {
        const fetchedConversation = await IrisService.getAgentConversation(conversationId);
        if (isCancelled) return;

        const [bootstrapStats, bootstrapRequestsResponse] = await Promise.all([
          IrisService.getConversationRunStats(conversationId).catch(() => null),
          IrisService.getConversationRequests(conversationId).catch(() => ({ requests: [] as IrisRequestEntry[] })),
        ]);
        if (isCancelled) return;

        const bootstrapRequests = bootstrapRequestsResponse.requests || [];

        // Seed the known IDs set from the full bootstrap
        knownRequestIds.clear();
        for (const bootstrapRequest of bootstrapRequests) {
          if (bootstrapRequest._id) knownRequestIds.add(bootstrapRequest._id);
        }

        setConversation(fetchedConversation);
        setConversationStats(bootstrapStats);
        setConversationRequests(bootstrapRequests);

        const graph = buildGraphFromConversation(fetchedConversation, bootstrapStats, bootstrapRequests);
        const topology = fetchedConversation.settings?.agents?.topology || "hierarchical";
        applyTopologyLayout(graph, dimensions.width, dimensions.height, topology);
        nodesRef.current = graph.nodes;
        setGraphData(graph);
        setIsLoading(false);
        // Signal that SSE has populated graph data for this conversation
        // so the loadGraph effect yields instead of overwriting.
        ssePopulatedForConversationRef.current = conversationId;
        startCollisionLoop(40);
        animateToFitTransform();
      } catch {
        // Conversation not available yet — will retry on the next SSE event
      } finally {
        isBootstrapping = false;

        // Replay any SSE events that were buffered during bootstrap.
        // These events would otherwise be permanently lost since the
        // Change Stream only delivers insert events once.
        if (pendingEventsBuffer.length > 0 && !isCancelled) {
          const bufferedEvents = pendingEventsBuffer;
          pendingEventsBuffer = [];
          for (const bufferedEvent of bufferedEvents) {
            enqueueChangeEvent(bufferedEvent);
          }
        }
      }
    };

    // Full re-fetch fallback for polling mode (no Change Streams)
    const performFullRefresh = async () => {
      const activeConversation = conversationRef.current;
      if (!activeConversation || isCancelled) {
        if (!activeConversation) await performColdStartBootstrap();
        return;
      }

      const activeConversationId = activeConversation.id || activeConversation._id;
      try {
        const [updatedStats, updatedRequestsResponse] = await Promise.all([
          IrisService.getConversationRunStats(activeConversationId).catch(() => conversationStatsRef.current),
          IrisService.getConversationRequests(activeConversationId).catch(() => ({ requests: conversationRequestsRef.current })),
        ]);
        if (isCancelled) return;

        const updatedRequests = updatedRequestsResponse.requests || [];
        const previousCount = knownRequestIds.size;

        // Re-seed known IDs
        knownRequestIds.clear();
        for (const request of updatedRequests) {
          if (request._id) knownRequestIds.add(request._id);
        }

        if (updatedRequests.length !== previousCount) {
          setConversationStats(updatedStats);
          setConversationRequests(updatedRequests);
          ssePopulatedForConversationRef.current = activeConversationId;
          incrementalGraphRebuild(activeConversation, updatedStats, updatedRequests);
          startCollisionLoop(40);
        } else if (updatedStats) {
          setConversationStats(updatedStats);
        }
      } catch {
        // Silently ignore
      }
    };

    // ── Batched SSE processing ──────────────────────────────────
    // Instead of processing each SSE event serially (1 getRequest +
    // 1 getConversationRunStats per event), we collect events that
    // arrive within a short window and process them in a single batch.
    // For 3 events this reduces 6 sequential HTTP requests down to
    // 4 parallel ones (3× getRequest + 1× stats), cutting perceived
    // latency from ~2-4s to ~200-400ms.
    let batchedChangeEvents: IrisCollectionChangeEvent[] = [];
    let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const BATCH_WINDOW_MILLISECONDS = 150;

    const flushBatchedEvents = async () => {
      batchFlushTimer = null;
      if (isCancelled || batchedChangeEvents.length === 0) return;

      const eventsToProcess = batchedChangeEvents;
      batchedChangeEvents = [];

      // If bootstrapping is in progress, buffer all events for replay
      if (isBootstrapping) {
        pendingEventsBuffer.push(...eventsToProcess);
        return;
      }

      const activeConversation = conversationRef.current;
      if (!activeConversation) {
        pendingEventsBuffer.push(...eventsToProcess);
        await performColdStartBootstrap();
        return;
      }

      // Deduplicate and categorize events
      const insertDocumentIds: string[] = [];
      const updateDocumentIds: string[] = [];
      let hasUnknownOperations = false;

      for (const changeEvent of eventsToProcess) {
        const requestDocumentId = changeEvent.documentId;
        if (!requestDocumentId) {
          hasUnknownOperations = true;
          continue;
        }

        const isInsertOperation = changeEvent.operationType === "insert";
        const isUpdateOperation = changeEvent.operationType === "update" || changeEvent.operationType === "replace";

        if (isInsertOperation) {
          if (!knownRequestIds.has(requestDocumentId)) {
            insertDocumentIds.push(requestDocumentId);
            knownRequestIds.add(requestDocumentId);
          }
        } else if (isUpdateOperation) {
          updateDocumentIds.push(requestDocumentId);
        } else {
          hasUnknownOperations = true;
        }
      }

      // If we only have unknown operations, fall back to full refresh
      if (insertDocumentIds.length === 0 && updateDocumentIds.length === 0) {
        if (hasUnknownOperations) await performFullRefresh();
        return;
      }

      try {
        // Fetch all affected requests in parallel + a single stats call
        const allDocumentIds = [...new Set([...insertDocumentIds, ...updateDocumentIds])];
        const [updatedStats, ...fetchedRequests] = await Promise.all([
          IrisService.getConversationRunStats(
            activeConversation.id || activeConversation._id,
          ).catch(() => conversationStatsRef.current),
          ...allDocumentIds.map((documentId) => IrisService.getRequest(documentId)),
        ]);
        if (isCancelled) return;

        // Build a lookup map for the fetched requests
        const fetchedRequestMap = new Map<string, IrisRequestEntry>();
        for (const fetchedRequest of fetchedRequests) {
          if (fetchedRequest?._id) {
            fetchedRequestMap.set(fetchedRequest._id, fetchedRequest);
          }
        }

        // Merge into the current requests array
        let updatedRequests = [...conversationRequestsRef.current];
        const existingIds = new Set(updatedRequests.map((request) => request._id));

        for (const [documentId, fetchedRequest] of fetchedRequestMap) {
          if (existingIds.has(documentId)) {
            updatedRequests = updatedRequests.map((existingRequest) =>
              existingRequest._id === documentId ? fetchedRequest : existingRequest,
            );
          } else {
            updatedRequests.push(fetchedRequest);
          }
        }

        setConversationStats(updatedStats);
        setConversationRequests(updatedRequests);
        // Mark SSE as the authoritative data source for this conversation
        // so any still-pending loadGraph fetch yields on completion.
        ssePopulatedForConversationRef.current = conversationId;
        incrementalGraphRebuild(activeConversation, updatedStats, updatedRequests);
        startCollisionLoop(40);
      } catch {
        await performFullRefresh();
      }
    };

    const enqueueChangeEvent = (changeEvent: IrisCollectionChangeEvent) => {
      batchedChangeEvents.push(changeEvent);
      if (!batchFlushTimer) {
        batchFlushTimer = setTimeout(flushBatchedEvents, BATCH_WINDOW_MILLISECONDS);
      }
    };

    const subscription = IrisService.subscribeCollectionChanges({
      onStatus: (statusEvent: IrisCollectionChangeEvent) => {
        setIsLiveConnected(!!statusEvent.changeStreams);
        if (!statusEvent.changeStreams) {
          if (!pollInterval) pollInterval = setInterval(performFullRefresh, 10_000);
        }
      },
      onChange: (changeEvent: IrisCollectionChangeEvent) => {
        if (changeEvent.collection === "requests" && changeEvent.conversationId === conversationId) {
          enqueueChangeEvent(changeEvent);
        }
      },
    });

    return () => {
      isCancelled = true;
      subscription.close();
      if (pollInterval) clearInterval(pollInterval);
      if (batchFlushTimer) clearTimeout(batchFlushTimer);
    };
  }, [conversationId, dimensions.width, dimensions.height, incrementalGraphRebuild, startCollisionLoop]);

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
      setSelectedNodeIds((previousIds) => {
        if (previousIds.size === 1 && previousIds.has(nodeId)) {
          setFocusedNodeId(null);
          setSelectedEdgeKeys(new Set());
          return new Set();
        }
        setFocusedNodeId(nodeId);

        // For request and tool nodes, collect the DIRECT edges belonging to
        // this node's specific flow chain. This traces the full path from
        // project → session → agent → request → model → provider → tool
        // without recursively walking through shared hub nodes.
        const clickedNode = graphData?.nodes.find((graphNode) => graphNode.id === nodeId);
        const isFlowTraversableNode = clickedNode?.category === "request" || clickedNode?.category === "tool";

        if (isFlowTraversableNode && graphData) {
          const flowNodeIds = new Set([nodeId]);
          const flowEdgeKeys = new Set<string>();

          // Helper: add an edge and its endpoints to the flow
          const includeEdge = (edge: GraphEdge) => {
            flowNodeIds.add(edge.source);
            flowNodeIds.add(edge.target);
            flowEdgeKeys.add(`${edge.source}→${edge.target}`);
          };

          // Helper: walk backward from a node through ancestor categories
          // (agent/subagent → session → project) to reach the root of the chain
          const walkAncestorChain = (startNodeId: string) => {
            let currentId = startNodeId;
            const ancestorCategories = new Set(["agent", "subagent", "session", "project", "user"]);
            const visited = new Set([currentId]);

            while (true) {
              let foundParent = false;
              for (const edge of graphData.edges) {
                if (edge.target === currentId && !visited.has(edge.source)) {
                  const sourceNode = graphData.nodes.find((graphNode) => graphNode.id === edge.source);
                  if (sourceNode && ancestorCategories.has(sourceNode.category)) {
                    includeEdge(edge);
                    visited.add(edge.source);
                    currentId = edge.source;
                    foundParent = true;
                    break;
                  }
                }
              }
              if (!foundParent) break;
            }
          };

          if (clickedNode.category === "request") {
            // Collect direct edges from/to the request node
            for (const edge of graphData.edges) {
              if (edge.source === nodeId) {
                flowNodeIds.add(edge.target);
                flowEdgeKeys.add(`${edge.source}→${edge.target}`);
              }
              if (edge.target === nodeId) {
                flowNodeIds.add(edge.source);
                flowEdgeKeys.add(`${edge.source}→${edge.target}`);
              }
            }

            // model → provider edges
            const requestModelIds = [...flowNodeIds].filter((flowId) => flowId.startsWith("model:"));
            for (const modelId of requestModelIds) {
              for (const edge of graphData.edges) {
                if (edge.source === modelId && edge.target.startsWith("provider:")) {
                  includeEdge(edge);
                }
              }
            }

            // Tool nodes belonging to this specific request (their IDs embed the request ID)
            const requestIdSegment = nodeId.replace("request:", "");
            const requestToolPrefix = `tool:${requestIdSegment}:`;
            for (const edge of graphData.edges) {
              if (edge.target.startsWith(requestToolPrefix)) {
                includeEdge(edge);
              }
            }

            // Walk backward from agent/subagent nodes to session and project
            const agentNodeIds = [...flowNodeIds].filter((flowId) =>
              flowId.startsWith("agent:") || flowId.startsWith("subagent:"),
            );
            for (const agentId of agentNodeIds) {
              walkAncestorChain(agentId);
            }
          } else if (clickedNode.category === "tool") {
            // For tool nodes, trace backward: tool ← provider ← model ← request ← agent ← session ← project
            // Find the edge pointing to this tool (provider → tool or request → tool)
            for (const edge of graphData.edges) {
              if (edge.target === nodeId) {
                includeEdge(edge);
              }
            }

            // Extract the owning request ID from the tool node ID (tool:REQUEST_ID:toolName)
            const toolIdParts = nodeId.replace("tool:", "").split(":");
            const owningRequestId = toolIdParts.length > 1 ? toolIdParts.slice(0, -1).join(":") : null;
            const owningRequestNodeId = owningRequestId ? `request:${owningRequestId}` : null;

            if (owningRequestNodeId && graphData.nodes.some((graphNode) => graphNode.id === owningRequestNodeId)) {
              flowNodeIds.add(owningRequestNodeId);

              // request → model edge
              for (const edge of graphData.edges) {
                if (edge.source === owningRequestNodeId && edge.target.startsWith("model:")) {
                  includeEdge(edge);
                }
              }

              // model → provider edge (for the models we just found)
              const toolFlowModelIds = [...flowNodeIds].filter((flowId) => flowId.startsWith("model:"));
              for (const modelId of toolFlowModelIds) {
                for (const edge of graphData.edges) {
                  if (edge.source === modelId && edge.target.startsWith("provider:")) {
                    includeEdge(edge);
                  }
                }
              }

              // agent → request edge
              for (const edge of graphData.edges) {
                if (edge.target === owningRequestNodeId && (edge.source.startsWith("agent:") || edge.source.startsWith("request:"))) {
                  includeEdge(edge);
                }
              }

              // Walk backward from agent/subagent to session and project
              const agentNodeIds = [...flowNodeIds].filter((flowId) => flowId.startsWith("agent:"));
              for (const agentId of agentNodeIds) {
                walkAncestorChain(agentId);
              }
            }
          }

          setSelectedEdgeKeys(flowEdgeKeys);
          return flowNodeIds;
        }

        setSelectedEdgeKeys(new Set());
        return new Set([nodeId]);
      });

      // Center the view on the clicked node
      const targetNode = graphData?.nodes.find((graphNode) => graphNode.id === nodeId);
      if (targetNode) {
        animateCenterOnNode(targetNode);
      }
    }
  }, [graphData, animateCenterOnNode, focusedNodeId]);

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
      // ArrowLeft / ArrowRight — move to the nearest node by y-position in an adjacent column
      const direction = key === "ArrowLeft" ? -1 : 1;
      const nextColumnIndex = currentColumnIndex + direction;
      if (nextColumnIndex >= 0 && nextColumnIndex < columns.length) {
        const adjacentColumn = columns[nextColumnIndex];
        let closestDistance = Infinity;
        for (const candidateNode of adjacentColumn) {
          const verticalDistance = Math.abs(candidateNode.y - currentNode.y);
          if (verticalDistance < closestDistance) {
            closestDistance = verticalDistance;
            targetNode = candidateNode;
          }
        }
      }
    }

    if (targetNode) {
      setSelectedNodeIds(new Set([targetNode.id]));
      setSelectedEdgeKeys(new Set());
      setFocusedNodeId(targetNode.id);
      animateCenterOnNode(targetNode);
    }
  }, [graphData, focusedNodeId, hiddenNodeIds, animateCenterOnNode]);

  // Compute containment halo ellipse geometry from positioned nodes
  const containmentHaloGeometry = useMemo(() => {
    if (!graphData || graphData.containmentHalos.length === 0) return [];
    const nodeMap = new Map(graphData.nodes.map((node) => [node.id, node]));

    return graphData.containmentHalos
      .filter((halo) => !hiddenNodeIds.has(halo.parentNodeId))
      .map((halo) => {
        const parentNode = nodeMap.get(halo.parentNodeId);
        if (!parentNode) return null;

        const visibleChildNodes = halo.childNodeIds
          .filter((childId) => !hiddenNodeIds.has(childId))
          .map((childId) => nodeMap.get(childId))
          .filter((childNode): childNode is GraphNode => childNode != null);

        if (visibleChildNodes.length === 0) return null;

        const allRelevantNodes = [parentNode, ...visibleChildNodes];
        let minimumX = Infinity;
        let minimumY = Infinity;
        let maximumX = -Infinity;
        let maximumY = -Infinity;

        for (const node of allRelevantNodes) {
          minimumX = Math.min(minimumX, node.x - node.radius);
          minimumY = Math.min(minimumY, node.y - node.radius);
          maximumX = Math.max(maximumX, node.x + node.radius);
          maximumY = Math.max(maximumY, node.y + node.radius);
        }

        const haloPadding = 25 - halo.depth * 4;
        const centerX = (minimumX + maximumX) / 2;
        const centerY = (minimumY + maximumY) / 2;
        const radiusX = (maximumX - minimumX) / 2 + haloPadding;
        const radiusY = (maximumY - minimumY) / 2 + haloPadding;

        return {
          parentNodeId: halo.parentNodeId,
          depth: halo.depth,
          centerX,
          centerY,
          radiusX,
          radiusY,
          color: resolveAgentColorByDepth(halo.depth),
        };
      })
      .filter((haloGeometry): haloGeometry is NonNullable<typeof haloGeometry> => haloGeometry != null);
  }, [graphData, hiddenNodeIds]);

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

  const activeModelNames = useMemo(() => {
    const names = new Set<string>();
    for (const toolCall of toolActivity) {
      if ((toolCall.status === "calling" || toolCall.status === "streaming") && toolCall._sourceModel) {
        names.add(toolCall._sourceModel);
      }
    }
    return names;
  }, [toolActivity]);

  // -- Proactive pending request node injection -----------------------
  // When isGenerating transitions false → true, inject a synthetic
  // "proactive pending" request node into the graph immediately. This
  // gives the user instant visual feedback that an upcoming request is
  // being processed, rather than retroactively lighting up the last
  // completed request node. The synthetic node is automatically replaced
  // when the real request data arrives from the backend via
  // incrementalGraphRebuild (which calls buildGraphFromConversation).
  const previousIsGeneratingRef = useRef(false);

  useEffect(() => {
    if (!graphData) return;

    const wasGenerating = previousIsGeneratingRef.current;
    previousIsGeneratingRef.current = isGenerating;

    if (isGenerating && !wasGenerating) {
      // Generation just started — inject a proactive pending request node
      const existingRequestNodes = graphData.nodes.filter(
        (node) => node.category === "request" && node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
      );
      const nextSequenceNumber = existingRequestNodes.length > 0
        ? Math.max(...existingRequestNodes.map((node) => node.sequenceNumber ?? 0)) + 1
        : 1;

      // Check if a proactive node already exists (idempotent guard)
      const hasProactiveNode = graphData.nodes.some(
        (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
      );
      if (hasProactiveNode) return;

      // Find the agent node to connect the proactive request to
      const agentNode = graphData.nodes.find(
        (node) => node.category === "agent",
      );

      // Position the proactive node after the last request node in the
      // request column, or below the agent node if no requests exist yet
      const lastRequestNode = existingRequestNodes
        .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0))
        .at(-1);

      const proactiveNodeX = lastRequestNode?.x ?? (agentNode?.x ?? 400) + 200;
      const proactiveNodeY = lastRequestNode ? lastRequestNode.y + 80 : (agentNode?.y ?? 250);

      const proactiveNode: GraphNode = {
        id: PROACTIVE_PENDING_REQUEST_NODE_ID,
        label: `#${nextSequenceNumber} pending`,
        category: "request",
        radius: 24,
        x: proactiveNodeX,
        y: proactiveNodeY,
        velocityX: 0,
        velocityY: 0,
        sequenceNumber: nextSequenceNumber,
        metadata: {
          operation: "pending",
          status: "pending",
        },
      };

      const proactiveEdges: GraphEdge[] = [];
      if (agentNode) {
        proactiveEdges.push({ source: agentNode.id, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.5 });
      }
      if (lastRequestNode) {
        proactiveEdges.push({ source: lastRequestNode.id, target: PROACTIVE_PENDING_REQUEST_NODE_ID, strength: 0.6 });
      }

      setGraphData((previousGraphData) => {
        if (!previousGraphData) return previousGraphData;
        // Double-check the proactive node hasn't been added by a concurrent update
        if (previousGraphData.nodes.some((node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID)) {
          return previousGraphData;
        }
        const updatedNodes = [...previousGraphData.nodes, proactiveNode];
        const updatedEdges = [...previousGraphData.edges, ...proactiveEdges];
        nodesRef.current = updatedNodes;
        return {
          ...previousGraphData,
          nodes: updatedNodes,
          edges: updatedEdges,
        };
      });

      // Mark the proactive node as entering for the spawn animation
      setEnteringNodeIds(new Set([PROACTIVE_PENDING_REQUEST_NODE_ID]));
      setTimeout(() => setEnteringNodeIds(new Set()), 600);

      // Re-fit viewport to include the new node
      animateToFitTransform();
    } else if (!isGenerating && wasGenerating) {
      // Generation just stopped — remove any lingering proactive node
      setGraphData((previousGraphData) => {
        if (!previousGraphData) return previousGraphData;
        const hasProactive = previousGraphData.nodes.some(
          (node) => node.id === PROACTIVE_PENDING_REQUEST_NODE_ID,
        );
        if (!hasProactive) return previousGraphData;
        const filteredNodes = previousGraphData.nodes.filter(
          (node) => node.id !== PROACTIVE_PENDING_REQUEST_NODE_ID,
        );
        const filteredEdges = previousGraphData.edges.filter(
          (edge) => edge.source !== PROACTIVE_PENDING_REQUEST_NODE_ID && edge.target !== PROACTIVE_PENDING_REQUEST_NODE_ID,
        );
        nodesRef.current = filteredNodes;
        return {
          ...previousGraphData,
          nodes: filteredNodes,
          edges: filteredEdges,
        };
      });
    }
  }, [isGenerating, graphData, animateToFitTransform]);

  const latestRequestNodeId = useMemo(() => {
    if (!graphData || !isGenerating) return null;
    const requestNodes = graphData.nodes
      .filter((node) => node.category === "request")
      .sort((nodeA, nodeB) => (nodeA.sequenceNumber ?? 0) - (nodeB.sequenceNumber ?? 0));
    return requestNodes.length > 0 ? requestNodes[requestNodes.length - 1].id : null;
  }, [graphData, isGenerating]);

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

    if (isGenerating) {
      const autoSelectedIds = new Set<string>();

      for (const node of graphData.nodes) {
        // Select all agent and sub-agent nodes during generation
        if (node.category === "agent" || node.category === "subagent") {
          autoSelectedIds.add(node.id);
        }

        // Select pending (in-flight) request nodes (including proactive)
        if (node.category === "request" && (node.metadata?.status as string) === "pending") {
          autoSelectedIds.add(node.id);
        }

        // Select the latest active request node
        if (node.category === "request" && latestRequestNodeId === node.id) {
          autoSelectedIds.add(node.id);
        }
      }

      if (autoSelectedIds.size > 0) {
        setSelectedNodeIds(autoSelectedIds);
        setSelectedEdgeKeys(new Set());
      }
    } else if (wasGenerating && !isGenerating) {
      // Generation just stopped — clear auto-selection
      setSelectedNodeIds(new Set());
      setSelectedEdgeKeys(new Set());
      setFocusedNodeId(null);
    }
  }, [isGenerating, graphData, latestRequestNodeId]);

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

              {/* Containment Halos — rendered behind edges and nodes */}
              {containmentHaloGeometry.map((haloGeometry) => (
                <g
                  key={`containment-halo-${haloGeometry.parentNodeId}`}
                  className={styles['containment-halo-group']}
                >
                  <ellipse
                    cx={haloGeometry.centerX}
                    cy={haloGeometry.centerY}
                    rx={haloGeometry.radiusX}
                    ry={haloGeometry.radiusY}
                    fill={haloGeometry.color}
                    fillOpacity={0.03 - haloGeometry.depth * 0.005}
                    className={styles['containment-halo-fill']}
                  />
                  <ellipse
                    cx={haloGeometry.centerX}
                    cy={haloGeometry.centerY}
                    rx={haloGeometry.radiusX}
                    ry={haloGeometry.radiusY}
                    fill="none"
                    stroke={haloGeometry.color}
                    strokeOpacity={0.15 - haloGeometry.depth * 0.03}
                    strokeWidth={1.5 - haloGeometry.depth * 0.2}
                    strokeDasharray="8 5"
                    className={styles['containment-halo-stroke']}
                  />
                </g>
              ))}

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
                const edgeOpacity = isEdgeSelected ? 0.95 : baseOpacity;

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
                      strokeWidth={isEdgeSelected ? 2.5 : isAgentHierarchyEdge ? 2 : 1.5}
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
                const nodeColor = (isPhaseActive && phaseRepresentativeColor)
                  ? phaseRepresentativeColor
                  : isAgentNode
                    ? resolveAgentColorByDepth(agentDepth)
                    : NODE_COLORS[node.category];

                const isEntering = enteringNodeIds.has(node.id);

                // Detect pending (in-flight) request nodes from two-phase lifecycle
                const isPendingRequest = node.category === "request" && (node.metadata?.status as string) === "pending";

                // Derive live activity state from toolActivity props
                const isActiveToolNode = node.category === "tool" && activeToolNames.has(node.metadata?.toolName as string);
                const isActiveModelNode = node.category === "model" && activeModelNames.has(node.metadata?.fullModelName as string);
                const isActiveRequestNode = node.category === "request" && isGenerating && latestRequestNodeId === node.id;
                const isNodeLiveActive = isActiveToolNode || isActiveModelNode || isActiveRequestNode || isPendingRequest;

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
                    {/* Live activity pulse ring for request/model/tool nodes */}
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
                            : isActiveToolNode
                              ? styles['node-tool-activity-pulse-ring']
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
                    {node.category === "provider" && !!node.metadata?.provider && (
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
                    {node.category === "tool" && toolEmojiMap.get(String(node.metadata?.toolName || ""))?.startsWith("http") && (
                      <image
                        href={toolEmojiMap.get(String(node.metadata?.toolName || ""))!}
                        x={node.x - node.radius * 0.4}
                        y={node.y - node.radius * 0.4}
                        width={node.radius * 0.8}
                        height={node.radius * 0.8}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    {node.category === "tool" && !toolEmojiMap.get(String(node.metadata?.toolName || ""))?.startsWith("http") && (
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" fontSize={28} style={{ pointerEvents: "none", userSelect: "none" }}>
                        {toolEmojiMap.get(String(node.metadata?.toolName || "")) || "⚙"}
                      </text>
                    )}
                    {node.category !== "provider" && node.category !== "tool" && (
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" fontSize={28} style={{ pointerEvents: "none", userSelect: "none" }}>
                        {node.category === "session" ? CONVERSATION_EMOJI : node.category === "agent" ? AGENT_EMOJI : node.category === "subagent" ? resolveSubAgentEmoji(agentDepth) : node.category === "project" ? PROJECT_EMOJI : node.category === "model" ? "💾" : node.category === "request" ? "🔗" : node.category === "user" ? "●" : node.category === "embedding" ? "💾" : "○"}
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

                {selectedNode.category === "model" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Model Details</div>
                    <InlineDetailRow label="Full Name" value={String(selectedNode.metadata?.fullModelName || "—")} />
                    <InlineDetailRow label="Total Cost" value={formatCost(Number(selectedNode.metadata?.totalCost || 0))} />
                    <InlineDetailRow label="Tokens Used" value={formatNumber(Number(selectedNode.metadata?.totalTokens || 0))} />
                  </div>
                )}

                {selectedNode.category === "tool" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Tool Details</div>
                    <InlineDetailRow label="Tool Name" value={String(selectedNode.metadata?.toolName || "—")} />
                    <InlineDetailRow label="Invocations" value={formatNumber(Number(selectedNode.metadata?.usageCount || 0))} />
                  </div>
                )}

                {selectedNode.category === "request" && (
                  <>
                    <div className={graphStyles['node-detail-popover-section']}>
                      <div className={graphStyles['node-detail-popover-section-title']}>Request Details</div>
                      {selectedNode.sequenceNumber != null && <InlineDetailRow label="Sequence" value={`#${selectedNode.sequenceNumber}`} />}
                      <InlineDetailRow label="Operation" value={String(selectedNode.metadata?.operation || "—")} />
                      <InlineDetailRow label="Cost" value={formatCost(Number(selectedNode.metadata?.estimatedCost || 0))} />
                      {Number(selectedNode.metadata?.inputTokens || 0) > 0 && <InlineDetailRow label="Input Tokens" value={formatNumber(Number(selectedNode.metadata?.inputTokens))} />}
                      {Number(selectedNode.metadata?.outputTokens || 0) > 0 && <InlineDetailRow label="Output Tokens" value={formatNumber(Number(selectedNode.metadata?.outputTokens))} />}
                      {Number(selectedNode.metadata?.duration || 0) > 0 && <InlineDetailRow label="Duration" value={formatElapsedTime(Number(selectedNode.metadata?.duration))} />}
                      {selectedNode.metadata?.timestamp != null && <InlineDetailRow label="Timestamp" value={formatTimeAgo(String(selectedNode.metadata.timestamp))} />}
                    </div>

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

                {selectedNode.category === "provider" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Provider Details</div>
                    <InlineDetailRow label="Provider" value={String(selectedNode.metadata?.provider || "—")} />
                  </div>
                )}

                {selectedNode.category === "project" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Project Details</div>
                    <InlineDetailRow label="Project" value={String(selectedNode.metadata?.project || "—")} />
                  </div>
                )}

                {selectedNode.category === "embedding" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Embedding Model</div>
                    <InlineDetailRow label="Full Name" value={String(selectedNode.metadata?.fullModelName || "—")} />
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
