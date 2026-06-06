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
import type { AgentSession, SessionStats } from "../types/types";
import { cleanModelName } from "./BadgeComponent";
import { resolveProviderLabel } from "./ProviderLogosComponent";
import StarfieldComponent from "./StarfieldComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import {
  formatNumber,
  formatCost,
  formatElapsedTime,
  timeAgo as formatTimeAgo,
} from "@rodrigo-barraza/utilities-library";

import graphStyles from "./SessionGraphPageComponent.module.css";
import styles from "./ChatSessionGraphComponent.module.css";

/* ═══════════════════════════════════════════════════════════════════
   Node Graph Data Structures (mirrored from SessionGraphPageComponent)
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
}

interface GraphEdge {
  source: string;
  target: string;
  strength?: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const NODE_COLORS: Record<NodeCategory, string> = {
  session: "oklch(0.72 0.18 280)",
  model: "oklch(0.72 0.15 160)",
  tool: "oklch(0.72 0.16 45)",
  request: "oklch(0.65 0.12 220)",
  user: "oklch(0.72 0.14 330)",
  project: "oklch(0.72 0.15 120)",
  provider: "oklch(0.68 0.14 200)",
  agent: "oklch(0.72 0.16 300)",
  embedding: "oklch(0.70 0.13 75)",
};

const NODE_LABELS: Record<NodeCategory, string> = {
  session: "Session",
  model: "Model",
  tool: "Tool",
  request: "Request",
  user: "User",
  project: "Project",
  provider: "Provider",
  agent: "Agent",
  embedding: "Embedding",
};

const TIER_ORDER: Record<NodeCategory, number> = {
  project: 0,
  user: 0,
  session: 1,
  agent: 2,
  tool: 4,
  request: 3,
  model: 4,
  embedding: 4,
  provider: 5,
};

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

function buildGraphFromSession(
  session: AgentSession,
  sessionStats: SessionStats | null,
  sessionRequests: IrisRequestEntry[],
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
  ) => {
    if (nodeIdSet.has(id)) return;
    nodeIdSet.add(id);
    nodes.push({ id, label, category, radius, x: 0, y: 0, velocityX: 0, velocityY: 0, metadata, sequenceNumber });
  };

  const addEdge = (source: string, target: string, strength = 1) => {
    const edgeKey = `${source}→${target}`;
    if (edgeKeySet.has(edgeKey)) return;
    edgeKeySet.add(edgeKey);
    edges.push({ source, target, strength });
  };

  const sessionId = session.id || session._id;
  const sessionNodeId = `session:${sessionId}`;

  addNode(sessionNodeId, session.title || "Session", "session", 32, {
    sessionId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    totalCost: sessionStats?.totalCost,
    requestCount: sessionStats?.requestCount,
    totalTokens: sessionStats?.totalTokens,
    totalElapsedTime: sessionStats?.totalElapsedTime,
  });

  if (session.project) {
    const projectNodeId = `project:${session.project}`;
    addNode(projectNodeId, session.project, "project", 22, { project: session.project });
    addEdge(projectNodeId, sessionNodeId, 0.8);
  }

  let mainAgentSessionId = sessionId;
  for (const request of sessionRequests) {
    if (!request.parentAgentSessionId && request.agentSessionId) {
      mainAgentSessionId = request.agentSessionId;
      break;
    }
  }

  const parentAgentNodeId = session.agent
    ? `agent:${mainAgentSessionId}:${session.agent}`
    : `agent:${mainAgentSessionId}:default`;
  if (session.agent) {
    addNode(parentAgentNodeId, session.agent, "agent", 24, { agent: session.agent });
  } else {
    addNode(parentAgentNodeId, "Default Agent", "agent", 24, { agent: "default" });
  }
  addEdge(sessionNodeId, parentAgentNodeId, 0.9);

  const providerNodeIds = new Set<string>();
  const modelNodeIds = new Set<string>();
  const userSet = new Set<string>();
  const addedToolNames = new Set<string>();

  const sortedRequests = [...sessionRequests].sort((requestA, requestB) => {
    const timestampA = requestA.timestamp ? new Date(requestA.timestamp).getTime() : 0;
    const timestampB = requestB.timestamp ? new Date(requestB.timestamp).getTime() : 0;
    return timestampA - timestampB;
  });

  for (let requestIndex = 0; requestIndex < sortedRequests.length; requestIndex++) {
    const request = sortedRequests[requestIndex];
    const sequenceNumber = requestIndex + 1;
    const isEmbeddingRequest = request.operation?.startsWith("embed:");
    const operationLabel = request.operation || "unknown";
    const requestNodeId = `request:${request._id || requestIndex}`;

    addNode(requestNodeId, `#${sequenceNumber} ${operationLabel}`, "request", 16, {
      operation: operationLabel,
      estimatedCost: request.estimatedCost,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      duration: request.duration,
      timestamp: request.timestamp,
      status: request.status,
      requestId: request.requestId || request._id,
    }, sequenceNumber);

    const reqAgentSessionId = request.agentSessionId || mainAgentSessionId;
    const isSubAgent = reqAgentSessionId !== mainAgentSessionId;
    const currentAgentNodeId = isSubAgent
      ? `agent:${reqAgentSessionId}:${request.agent || "OMNI"}`
      : parentAgentNodeId;

    if (isSubAgent) {
      const subAgentLabel = request.agent || "OMNI";
      addNode(currentAgentNodeId, subAgentLabel, "agent", 22, {
        agent: subAgentLabel,
        isSubagent: true,
        parentAgentSessionId: request.parentAgentSessionId || mainAgentSessionId,
        agentSessionId: reqAgentSessionId,
      });
      const parentSessionId = request.parentAgentSessionId || mainAgentSessionId;
      const actualParentAgentNodeId = `agent:${parentSessionId}:${session.agent || "OMNI"}`;
      addEdge(actualParentAgentNodeId, currentAgentNodeId, 0.9);
    }

    addEdge(currentAgentNodeId, requestNodeId, 0.5);

    if (requestIndex > 0) {
      const previousRequest = sortedRequests[requestIndex - 1];
      const previousAgentSessionId = previousRequest.agentSessionId || mainAgentSessionId;
      if (previousAgentSessionId === reqAgentSessionId) {
        const previousRequestNodeId = `request:${previousRequest._id || (requestIndex - 1)}`;
        addEdge(previousRequestNodeId, requestNodeId, 0.6);
      }
    }

    if (request.model) {
      const modelNodeId = isEmbeddingRequest ? `embedding:${request.model}` : `model:${request.model}`;
      const modelCategory: NodeCategory = isEmbeddingRequest ? "embedding" : "model";
      if (!modelNodeIds.has(modelNodeId)) {
        modelNodeIds.add(modelNodeId);
        addNode(modelNodeId, cleanModelName(request.model), modelCategory, 20, { fullModelName: request.model });
      }
      addEdge(requestNodeId, modelNodeId, 0.9);

      if (request.provider) {
        const providerNodeId = `provider:${request.provider}`;
        if (!providerNodeIds.has(providerNodeId)) {
          providerNodeIds.add(providerNodeId);
          addNode(providerNodeId, resolveProviderLabel(request.provider) || request.provider, "provider", 18, { provider: request.provider });
        }
        addEdge(modelNodeId, providerNodeId, 0.7);
      }
    }

    if (request.toolApiNames?.length) {
      for (const toolName of request.toolApiNames) {
        const uniqueToolNodeId = `tool:${request._id || requestIndex}:${toolName}`;
        const invocationsInRequest = request.toolApiNames.filter((name) => name === toolName).length;
        const normalizedRadius = Math.min(22, 12 + Math.sqrt(invocationsInRequest) * 2);
        addNode(uniqueToolNodeId, toolName, "tool", normalizedRadius, { toolName, usageCount: invocationsInRequest });
        addEdge(requestNodeId, uniqueToolNodeId, 0.7);
        addedToolNames.add(toolName);
      }
    }

    if (request.username) {
      userSet.add(request.username);
    }
  }

  if (sessionStats?.toolCounts) {
    for (const [toolName, usageCount] of Object.entries(sessionStats.toolCounts)) {
      if (!addedToolNames.has(toolName)) {
        const fallbackToolNodeId = `tool:fallback:${toolName}`;
        const normalizedRadius = Math.min(22, 12 + Math.sqrt(usageCount) * 2);
        addNode(fallbackToolNodeId, toolName, "tool", normalizedRadius, { toolName, usageCount });
        addEdge(parentAgentNodeId, fallbackToolNodeId, 0.7);
      }
    }
  }

  for (const userName of userSet) {
    const userNodeId = `user:${userName}`;
    addNode(userNodeId, userName, "user", 18, { username: userName });
    addEdge(userNodeId, sessionNodeId, 0.5);
  }

  return { nodes, edges };
}

function applyHierarchicalLayout(graphData: GraphData, canvasWidth: number, canvasHeight: number): void {
  const { nodes: graphNodes } = graphData;
  if (graphNodes.length === 0) return;

  const tierBuckets: Map<number, GraphNode[]> = new Map();
  for (const node of graphNodes) {
    const tier = TIER_ORDER[node.category] ?? 3;
    if (!tierBuckets.has(tier)) tierBuckets.set(tier, []);
    tierBuckets.get(tier)!.push(node);
  }

  const sortedTiers = [...tierBuckets.keys()].sort((tierA, tierB) => tierA - tierB);
  const tierCount = sortedTiers.length;
  const verticalSpacing = Math.max(120, (canvasHeight - 100) / Math.max(tierCount, 1));
  const startY = 80;

  for (let tierIndex = 0; tierIndex < sortedTiers.length; tierIndex++) {
    const tierKey = sortedTiers[tierIndex];
    const tierNodes = tierBuckets.get(tierKey)!;
    const tierY = startY + tierIndex * verticalSpacing;
    const horizontalSpacing = Math.max(80, canvasWidth / (tierNodes.length + 1));
    for (let nodeIndex = 0; nodeIndex < tierNodes.length; nodeIndex++) {
      tierNodes[nodeIndex].x = (nodeIndex + 1) * horizontalSpacing;
      tierNodes[nodeIndex].y = tierY;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Props Interface
   ═══════════════════════════════════════════════════════════════════ */

export interface ChatSessionGraphComponentProps {
  sessionId: string | null;
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function ChatSessionGraphComponent({ sessionId }: ChatSessionGraphComponentProps) {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [sessionRequests, setSessionRequests] = useState<IrisRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [enteringNodeIds, setEnteringNodeIds] = useState<Set<string>>(new Set());
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  const [selectedRequestDetail, setSelectedRequestDetail] = useState<IrisRequestEntry | null>(null);
  const [isRequestDetailLoading, setIsRequestDetailLoading] = useState(false);
  const [expandedPopoverSections, setExpandedPopoverSections] = useState<Set<string>>(new Set());

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const lastMousePositionRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  const [draggedNode, setDraggedNode] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const sessionRef = useRef<AgentSession | null>(null);
  const sessionRequestsRef = useRef<IrisRequestEntry[]>([]);
  const sessionStatsRef = useRef<SessionStats | null>(null);

  // Keep refs in sync
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { sessionRequestsRef.current = sessionRequests; }, [sessionRequests]);
  useEffect(() => { sessionStatsRef.current = sessionStats; }, [sessionStats]);

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

  // ── Collision physics ─────────────────────────────────────────
  const nodesRef = useRef<GraphNode[]>([]);
  const draggingRef = useRef<{ id: string } | null>(null);
  const rafRef = useRef<number | null>(null);
  const settleCountRef = useRef<number>(0);
  const collisionTickRef = useRef<(() => void) | null>(null);

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

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
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

  // ── Incremental rebuild ───────────────────────────────────────
  const incrementalGraphRebuild = useCallback((
    activeSession: AgentSession,
    updatedStats: SessionStats | null,
    updatedRequests: IrisRequestEntry[],
  ) => {
    const existingPositions = new Map<string, { x: number; y: number }>();
    const existingNodeIds = new Set<string>();

    setGraphData((previousGraphData) => {
      if (previousGraphData) {
        for (const node of previousGraphData.nodes) {
          existingPositions.set(node.id, { x: node.x, y: node.y });
          existingNodeIds.add(node.id);
        }
      }

      const graph = buildGraphFromSession(activeSession, updatedStats, updatedRequests);
      const newNodeIds = new Set<string>();
      for (const node of graph.nodes) {
        if (!existingNodeIds.has(node.id)) newNodeIds.add(node.id);
      }

      applyHierarchicalLayout(graph, dimensions.width, dimensions.height);

      for (const node of graph.nodes) {
        const previousPosition = existingPositions.get(node.id);
        if (previousPosition) {
          node.x = previousPosition.x;
          node.y = previousPosition.y;
        }
      }

      if (newNodeIds.size > 0) {
        setEnteringNodeIds(newNodeIds);
        setTimeout(() => setEnteringNodeIds(new Set()), 600);
      }

      return graph;
    });
  }, [dimensions]);

  // ── Load session graph ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setSessionStats(null);
      setSessionRequests([]);
      setGraphData(null);
      setSelectedNodeId(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setGraphData(null);
    setSelectedNodeId(null);

    const loadGraph = async () => {
      try {
        const fetchedSession = await IrisService.getAgentSession(sessionId);
        if (isCancelled) return;

        const [statsResponse, requestsResponse] = await Promise.all([
          IrisService.getSessionStats(sessionId).catch(() => null),
          IrisService.getSessionRequests(sessionId).catch(() => ({ requests: [] })),
        ]);

        if (isCancelled) return;

        setSession(fetchedSession);
        setSessionStats(statsResponse);
        const requestsList = requestsResponse.requests || [];
        setSessionRequests(requestsList);

        const graph = buildGraphFromSession(fetchedSession, statsResponse, requestsList);
        applyHierarchicalLayout(graph, dimensions.width, dimensions.height);
        setGraphData(graph);
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
      } catch (error) {
        if (!isCancelled) console.error("ChatSessionGraphComponent: failed to load graph:", error);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadGraph();
    return () => { isCancelled = true; };
  }, [sessionId, dimensions.width, dimensions.height]);

  // ── SSE live updates ──────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let previousRequestCount = sessionRequestsRef.current.length;

    const performIncrementalRefresh = async () => {
      const activeSession = sessionRef.current;
      if (!activeSession) return;
      const activeSessionId = activeSession.id || activeSession._id;

      try {
        const [updatedStats, updatedRequestsResponse] = await Promise.all([
          IrisService.getSessionStats(activeSessionId).catch(() => sessionStatsRef.current),
          IrisService.getSessionRequests(activeSessionId).catch(() => ({ requests: sessionRequestsRef.current })),
        ]);

        const updatedRequests = updatedRequestsResponse.requests || [];
        if (updatedRequests.length !== previousRequestCount) {
          previousRequestCount = updatedRequests.length;
          setSessionStats(updatedStats);
          setSessionRequests(updatedRequests);
          incrementalGraphRebuild(activeSession, updatedStats, updatedRequests);
          startCollisionLoop(40);
        } else if (updatedStats) {
          setSessionStats(updatedStats);
        }
      } catch {
        // Silently ignore
      }
    };

    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(performIncrementalRefresh, 400);
    };

    const subscription = IrisService.subscribeCollectionChanges({
      onStatus: (statusEvent: IrisCollectionChangeEvent) => {
        setIsLiveConnected(!!statusEvent.changeStreams);
        if (!statusEvent.changeStreams) {
          if (!pollInterval) pollInterval = setInterval(performIncrementalRefresh, 10_000);
        }
      },
      onChange: (changeEvent: IrisCollectionChangeEvent) => {
        if (changeEvent.collection === "requests" && changeEvent.conversationId === sessionId) {
          debouncedRefresh();
        }
      },
    });

    return () => {
      subscription.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [sessionId, incrementalGraphRebuild, startCollisionLoop]);

  // ── Screen ↔ SVG coordinate helper ───────────────────────────
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

  // ── Canvas pan/zoom handlers ──────────────────────────────────
  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if ((event.target as SVGElement).closest("[data-node-id]")) return;
    setIsPanning(true);
    lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleNodeMouseDown = useCallback(
    (event: React.MouseEvent<SVGGElement>, nodeId: string) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      hasDraggedRef.current = false;
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      const node = graphData?.nodes.find((n) => n.id === nodeId);
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
    setZoom((previousZoom) => Math.max(0.3, Math.min(3, previousZoom * zoomFactor)));
  }, []);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(3, z * 1.2)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(0.3, z * 0.8)), []);
  const handleZoomFit = useCallback(() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!hasDraggedRef.current) {
      setSelectedNodeId((previousId) => previousId === nodeId ? null : nodeId);
    }
  }, []);

  // Lazy-fetch full request detail
  useEffect(() => {
    if (!selectedNodeId || !graphData) {
      setSelectedRequestDetail(null);
      setExpandedPopoverSections(new Set());
      return;
    }
    const node = graphData.nodes.find((graphNode) => graphNode.id === selectedNodeId);
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
  }, [selectedNodeId, graphData]);

  const togglePopoverSection = useCallback((sectionKey: string) => {
    setExpandedPopoverSections((previous) => {
      const next = new Set(previous);
      if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
      return next;
    });
  }, []);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graphData) return null;
    return graphData.nodes.find((node) => node.id === selectedNodeId) || null;
  }, [selectedNodeId, graphData]);

  const { width: canvasWidth, height: canvasHeight } = dimensions;

  const viewBoxTransform = useMemo(() => {
    const scaledWidth = canvasWidth / zoom;
    const scaledHeight = canvasHeight / zoom;
    const originX = canvasWidth / 2 - scaledWidth / 2 - panOffset.x;
    const originY = canvasHeight / 2 - scaledHeight / 2 - panOffset.y;
    return `${originX} ${originY} ${scaledWidth} ${scaledHeight}`;
  }, [canvasWidth, canvasHeight, zoom, panOffset]);

  // ── Empty state when no sessionId ─────────────────────────────
  if (!sessionId) {
    return (
      <div className={styles['graph-embed-wrapper']}>
        <div className={graphStyles['graph-canvas-wrapper']}>
          <StarfieldComponent className={graphStyles['starfield']} panX={0} panY={0} />
          <div className={graphStyles['graph-empty-prompt']}>
            <Network size={48} className={graphStyles['graph-empty-prompt-icon']} />
            <div className={graphStyles['graph-empty-prompt-title']}>No active session</div>
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
      {/* Graph info strip */}
      <div className={styles['graph-embed-info-strip']}>
        <span className={styles['graph-embed-info-left']}>
          <Network size={12} />
          {graphData
            ? <>{graphData.nodes.length} nodes · {graphData.edges.length} edges</>
            : <span className={styles['graph-embed-info-placeholder']}>Loading…</span>
          }
          {isLiveConnected && (
            <span className={graphStyles['live-indicator']}>
              <span className={graphStyles['live-indicator-dot']} />
              LIVE
            </span>
          )}
        </span>
        {sessionStats && (
          <span className={styles['graph-embed-info-right']}>
            {formatNumber(sessionStats.requestCount || 0)} reqs
            <span className={styles['graph-embed-info-separator']}>·</span>
            {formatCost(sessionStats.totalCost || 0)}
            {sessionStats.totalElapsedTime && sessionStats.totalElapsedTime > 0 && (
              <>
                <span className={styles['graph-embed-info-separator']}>·</span>
                {formatElapsedTime(sessionStats.totalElapsedTime)}
              </>
            )}
          </span>
        )}
        <span className={styles['graph-embed-zoom-controls']}>
          <button className={graphStyles['zoom-button']} onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={12} />
          </button>
          <button className={graphStyles['zoom-button']} onClick={handleZoomFit} title="Fit to view" aria-label="Fit to view">
            <Maximize size={12} />
          </button>
          <button className={graphStyles['zoom-button']} onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={12} />
          </button>
        </span>
      </div>

      {/* Canvas */}
      <div
        className={`${graphStyles['graph-canvas-wrapper']} ${styles['graph-embed-canvas-area']}`}
        ref={canvasWrapperRef}
      >
        <StarfieldComponent className={graphStyles['starfield']} panX={panOffset.x} panY={panOffset.y} />

        {isLoading && (
          <div className={graphStyles['graph-empty-prompt']}>
            <PanelLoadingSpinner />
          </div>
        )}

        {!isLoading && !graphData && (
          <div className={graphStyles['graph-empty-prompt']}>
            <Network size={40} className={graphStyles['graph-empty-prompt-icon']} />
            <div className={graphStyles['graph-empty-prompt-title']}>No graph data</div>
          </div>
        )}

        {graphData && !isLoading && (
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
                  <feGaussianBlur stdDeviation="6" result="blur" />
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
              </defs>

              {/* Edges */}
              {graphData.edges.map((edge, edgeIndex) => {
                const sourceNode = graphData.nodes.find((node) => node.id === edge.source);
                const targetNode = graphData.nodes.find((node) => node.id === edge.target);
                if (!sourceNode || !targetNode) return null;
                const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
                const baseOpacity = 0.15 + (edge.strength || 0.5) * 0.2;
                const edgeOpacity = isEdgeSelected ? 0.95 : baseOpacity;
                const edgeColor = NODE_COLORS[targetNode.category] || "oklch(0.6 0 0)";
                const pathData = straightEdgePath(sourceNode.x, sourceNode.y, sourceNode.radius, targetNode.x, targetNode.y, targetNode.radius);
                return (
                  <g key={`edge-group-${edgeIndex}`} className={`${graphStyles['connection-group']} ${isEdgeSelected ? graphStyles['connection-selected'] : ""}`}>
                    <path d={pathData} stroke="transparent" strokeWidth={8} fill="none" style={{ cursor: "pointer" }} />
                    <path
                      d={pathData}
                      stroke={edgeColor}
                      strokeWidth={isEdgeSelected ? 2.5 : 1.5}
                      strokeOpacity={edgeOpacity}
                      fill="none"
                      className={graphStyles['connection-line']}
                      markerEnd={`url(#chat-graph-arrow-${targetNode.category})`}
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {graphData.nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isSessionCenter = node.category === "session";
                const nodeColor = NODE_COLORS[node.category];
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    className={`${graphStyles['node-group']}${enteringNodeIds.has(node.id) ? ` ${graphStyles['node-entering']}` : ""}`}
                    onMouseDown={(event) => handleNodeMouseDown(event, node.id)}
                    onClick={() => handleNodeClick(node.id)}
                    filter={isSessionCenter ? "url(#chat-graph-session-glow)" : isSelected ? "url(#chat-graph-node-hover-glow)" : undefined}
                  >
                    {isSelected && (
                      <circle
                        cx={node.x} cy={node.y} r={node.radius + 5}
                        fill="none" stroke={nodeColor} strokeWidth={2}
                        strokeOpacity={0.6} strokeDasharray="4 3"
                      />
                    )}
                    <circle
                      cx={node.x} cy={node.y} r={node.radius}
                      fill={nodeColor} fillOpacity={isSessionCenter ? 0.95 : 0.85}
                      stroke={nodeColor} strokeWidth={isSelected ? 2 : 1} strokeOpacity={0.5}
                    />
                    {node.sequenceNumber != null && node.category === "request" && (
                      <>
                        <circle cx={node.x + node.radius * 0.7} cy={node.y - node.radius * 0.7} r={8} fill="oklch(0.25 0 0)" stroke={nodeColor} strokeWidth={1.5} />
                        <text x={node.x + node.radius * 0.7} y={node.y - node.radius * 0.7} textAnchor="middle" dominantBaseline="central" fill="oklch(0.95 0 0)" fontSize={8} fontWeight={600}>
                          {node.sequenceNumber > 99 ? "99+" : node.sequenceNumber}
                        </text>
                      </>
                    )}
                    <text x={node.x} y={node.y + node.radius + 14} textAnchor="middle" fill="oklch(0.75 0 0)" fontSize={10} fontWeight={500} style={{ pointerEvents: "none", userSelect: "none" }}>
                      {node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label}
                    </text>
                    <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" fill="oklch(0.98 0 0)" fontSize={node.radius * 0.7} fontWeight={600} style={{ pointerEvents: "none", userSelect: "none" }}>
                      {node.category === "session" ? "◉" : node.category === "model" ? "◈" : node.category === "tool" ? "⚙" : node.category === "request" ? "↗" : node.category === "user" ? "●" : node.category === "project" ? "▣" : node.category === "provider" ? "◆" : node.category === "agent" ? "◎" : node.category === "embedding" ? "⬡" : "○"}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className={graphStyles['graph-legend']}>
              {(Object.entries(NODE_COLORS) as [NodeCategory, string][]).map(([category, color]) => (
                <div key={category} className={graphStyles['graph-legend-item']}>
                  <span className={graphStyles['graph-legend-dot']} style={{ background: color }} />
                  {NODE_LABELS[category]}
                </div>
              ))}
            </div>

            {/* Node detail popover */}
            {selectedNode && (
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
                    onClick={() => setSelectedNodeId(null)}
                    title="Close details"
                    aria-label="Close details"
                    style={{ width: 24, height: 24 }}
                  >
                    <X size={12} />
                  </button>
                </div>

                {selectedNode.category === "session" && (
                  <div className={graphStyles['node-detail-popover-section']}>
                    <div className={graphStyles['node-detail-popover-section-title']}>Session Details</div>
                    <InlineDetailRow label="Session ID" value={String(selectedNode.metadata?.sessionId || "—").slice(0, 12) + "…"} />
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
                      <div className={graphStyles['request-payload-loading']}>
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
        )}
      </div>
    </div>
  );
}

/* ── Local Detail Row ────────────────────────────────────────── */

function InlineDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={graphStyles['node-detail-popover-layout-row']}>
      <span className={graphStyles['node-detail-popover-layout-row-label']}>{label}</span>
      <span className={graphStyles['node-detail-popover-layout-row-value']}>{value}</span>
    </div>
  );
}

/* ── Inline Collapsible Section ──────────────────────────────── */

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

/* ── Inline Request Payload Section ──────────────────────────── */

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
    <div className={graphStyles['request-payload-container']}>
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
