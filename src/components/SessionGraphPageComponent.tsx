"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Network,
  Server,
  Bot,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Loader2,
  Image as ImageIcon,
  FileText,
  Wrench,
  MessageSquare,
} from "lucide-react";
import IrisService, {
  type IrisRequestEntry,
  type IrisCollectionChangeEvent,
} from "../services/IrisService";
import type { AgentSession, SessionStats } from "../types/types";
import { cleanModelName } from "./BadgeComponent";
import { resolveProviderLabel } from "./ProviderLogosComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import StarfieldComponent from "./StarfieldComponent";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import AdminFiltersCardComponent from "./AdminFiltersCardComponent";
import {
  StatsCardComponent as StatsCard,
  useDebounce,
} from "@rodrigo-barraza/components-library";
import HistoryList from "./HistoryListComponent";
import {
  formatNumber,
  formatCost,
  formatElapsedTime,
  timeAgo as formatTimeAgo,
} from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../utils/utilities";
import { mapAgentSessionToHistoryItem } from "../utils/historyItemMapper";

import styles from "./SessionGraphPageComponent.module.css";

const PAGE_SIZE = 30;

/* ═══════════════════════════════════════════════════════════════════
   Node Graph Data Structures
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

/* ═══════════════════════════════════════════════════════════════════
   Graph Builder — converts session data into nodes + edges

    Topology (top-to-bottom):
      Project ─→ Session ─→ Agent ─→ Request #N ─→ Model ─→ Provider
                               └─→ Tool (× N)
   ═══════════════════════════════════════════════════════════════════ */

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
    nodes.push({
      id,
      label,
      category,
      radius,
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      metadata,
      sequenceNumber,
    });
  };

  const addEdge = (source: string, target: string, strength = 1) => {
    const edgeKey = `${source}→${target}`;
    if (edgeKeySet.has(edgeKey)) return;
    edgeKeySet.add(edgeKey);
    edges.push({ source, target, strength });
  };

  const sessionId = session.id || session._id;
  const sessionNodeId = `session:${sessionId}`;

  addNode(
    sessionNodeId,
    session.title || "Agent Session",
    "session",
    32,
    {
      sessionId,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      totalCost: sessionStats?.totalCost,
      requestCount: sessionStats?.requestCount,
      totalTokens: sessionStats?.totalTokens,
      totalElapsedTime: sessionStats?.totalElapsedTime,
    },
  );

  // Project node — connects to session (tier 0 → tier 1)
  if (session.project) {
    const projectNodeId = `project:${session.project}`;
    addNode(projectNodeId, session.project, "project", 22, {
      project: session.project,
    });
    addEdge(projectNodeId, sessionNodeId, 0.8);
  }

  // Agent node — connects to session (tier 1 → tier 2)
  const parentAgentNodeId = session.agent
    ? `agent:${sessionId}:${session.agent}`
    : `agent:${sessionId}:default`;
  if (session.agent) {
    addNode(parentAgentNodeId, session.agent, "agent", 24, {
      agent: session.agent,
    });
  } else {
    addNode(parentAgentNodeId, "Default Agent", "agent", 24, {
      agent: "default",
    });
  }
  addEdge(sessionNodeId, parentAgentNodeId, 0.9);

  // Collect unique providers across all requests
  const providerNodeIds = new Set<string>();
  const modelNodeIds = new Set<string>();
  const userSet = new Set<string>();

  // Track tool names added to request nodes (for fallback handling)
  const addedToolNames = new Set<string>();

  // Sort requests by timestamp for sequencing
  const sortedRequests = [...sessionRequests].sort((requestA, requestB) => {
    const timestampA = requestA.timestamp ? new Date(requestA.timestamp).getTime() : 0;
    const timestampB = requestB.timestamp ? new Date(requestB.timestamp).getTime() : 0;
    return timestampA - timestampB;
  });

  // Build individual request nodes with sequence numbers
  for (let requestIndex = 0; requestIndex < sortedRequests.length; requestIndex++) {
    const request = sortedRequests[requestIndex];
    const sequenceNumber = requestIndex + 1;
    const isEmbeddingRequest = request.operation?.startsWith("embed:");
    const operationLabel = request.operation || "unknown";
    const requestNodeId = `request:${request._id || requestIndex}`;

    addNode(
      requestNodeId,
      `#${sequenceNumber} ${operationLabel}`,
      "request",
      16,
      {
        operation: operationLabel,
        estimatedCost: request.estimatedCost,
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        duration: request.duration,
        timestamp: request.timestamp,
        status: request.status,
        requestId: request.requestId || request._id,
      },
      sequenceNumber,
    );

    // Determine target agent node (parent or sub-agent)
    const reqAgentSessionId = request.agentSessionId || sessionId;
    const isSubAgent = reqAgentSessionId !== sessionId;
    const currentAgentNodeId = isSubAgent
      ? `agent:${reqAgentSessionId}:${request.agent || "OMNI"}`
      : parentAgentNodeId;

    if (isSubAgent) {
      const subAgentLabel = request.agent || "OMNI";
      addNode(currentAgentNodeId, subAgentLabel, "agent", 22, {
        agent: subAgentLabel,
        isSubagent: true,
        parentAgentSessionId: sessionId,
        agentSessionId: reqAgentSessionId,
      });
      addEdge(parentAgentNodeId, currentAgentNodeId, 0.9);
    }

    // Agent → Request (tier 2 → tier 3)
    addEdge(currentAgentNodeId, requestNodeId, 0.5);

    // Chain requests sequentially (chronological flow)
    if (requestIndex > 0) {
      const previousRequest = sortedRequests[requestIndex - 1];
      const previousRequestNodeId = `request:${previousRequest._id || (requestIndex - 1)}`;
      addEdge(previousRequestNodeId, requestNodeId, 0.6);
    }

    // Request → Model (tier 3 → tier 4)
    if (request.model) {
      const modelNodeId = isEmbeddingRequest
        ? `embedding:${request.model}`
        : `model:${request.model}`;
      const modelCategory: NodeCategory = isEmbeddingRequest ? "embedding" : "model";

      if (!modelNodeIds.has(modelNodeId)) {
        modelNodeIds.add(modelNodeId);
        addNode(modelNodeId, cleanModelName(request.model), modelCategory, 20, {
          fullModelName: request.model,
        });
      }
      addEdge(requestNodeId, modelNodeId, 0.9);

      // Model → Provider (tier 4 → tier 5)
      if (request.provider) {
        const providerNodeId = `provider:${request.provider}`;
        if (!providerNodeIds.has(providerNodeId)) {
          providerNodeIds.add(providerNodeId);
          addNode(providerNodeId, resolveProviderLabel(request.provider) || request.provider, "provider", 18, {
            provider: request.provider,
          });
        }
        addEdge(modelNodeId, providerNodeId, 0.7);
      }
    }

    // Track tools per-request and add unique tool nodes connected to the request
    if (request.toolApiNames?.length) {
      for (const toolName of request.toolApiNames) {
        const uniqueToolNodeId = `tool:${request._id || requestIndex}:${toolName}`;
        
        // Count tool occurrences within this specific request
        const invocationsInRequest = request.toolApiNames.filter((name) => name === toolName).length;
        const normalizedRadius = Math.min(22, 12 + Math.sqrt(invocationsInRequest) * 2);
        
        addNode(uniqueToolNodeId, toolName, "tool", normalizedRadius, {
          toolName,
          usageCount: invocationsInRequest,
        });
        
        addEdge(requestNodeId, uniqueToolNodeId, 0.7);
        addedToolNames.add(toolName);
      }
    }

    if (request.username) {
      userSet.add(request.username);
    }
  }

  // Also use stats-level toolCounts if requests are sparse / not loaded
  if (sessionStats?.toolCounts) {
    for (const [toolName, usageCount] of Object.entries(sessionStats.toolCounts)) {
      if (!addedToolNames.has(toolName)) {
        const fallbackToolNodeId = `tool:fallback:${toolName}`;
        const normalizedRadius = Math.min(22, 12 + Math.sqrt(usageCount) * 2);
        addNode(fallbackToolNodeId, toolName, "tool", normalizedRadius, {
          toolName,
          usageCount,
        });
        addEdge(parentAgentNodeId, fallbackToolNodeId, 0.7);
      }
    }
  }

  // User nodes — connect to Session (tier 0, same as project)
  for (const userName of userSet) {
    const userNodeId = `user:${userName}`;
    addNode(userNodeId, userName, "user", 18, { username: userName });
    addEdge(userNodeId, sessionNodeId, 0.5);
  }

  return { nodes, edges };
}

/* ═══════════════════════════════════════════════════════════════════
   Hierarchical Tiered Layout — positions nodes in horizontal rows
   arranged top-to-bottom by their category tier.
   ═══════════════════════════════════════════════════════════════════ */

function applyHierarchicalLayout(
  graphData: GraphData,
  canvasWidth: number,
  canvasHeight: number,
): void {
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
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function SessionGraphPageComponent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const projectFilter = searchParams.get("project") || null;
  const providerFilter = searchParams.get("provider") || null;
  const modelFilter = searchParams.get("model") || null;
  const workspaceFilter = searchParams.get("workspace") || null;
  const { setTitleBadge, dateRange, agentFilter } = useAdminHeader();
  const dateParams = useMemo(
    () => buildDateRangeParams(dateRange),
    [dateRange],
  );

  // Session list state
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [sessionPage, setSessionPage] = useState(1);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);
  const [serverSearchQuery, setServerSearchQuery] = useState("");

  const debouncedSetServerSearch = useDebounce(((query: unknown) => {
    setServerSearchQuery(query as string);
  }) as (...args: unknown[]) => void, 300);

  // Selected session + graph state
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [sessionRequests, setSessionRequests] = useState<IrisRequestEntry[]>([]);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const loadingSessionIdRef = useRef<string | null>(null);

  // Lazy-loaded request detail for popover input/output display
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<IrisRequestEntry | null>(null);
  const [isRequestDetailLoading, setIsRequestDetailLoading] = useState(false);
  const [expandedPopoverSections, setExpandedPopoverSections] = useState<Set<string>>(new Set());

  // Live streaming state
  const [enteringNodeIds, setEnteringNodeIds] = useState<Set<string>>(new Set());
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const sessionRequestsRef = useRef<IrisRequestEntry[]>([]);
  const selectedSessionRef = useRef<AgentSession | null>(null);
  const sessionStatsRef = useRef<SessionStats | null>(null);

  // Canvas state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const lastMousePositionRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [draggedNode, setDraggedNode] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const screenToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasWrapperRef.current?.getBoundingClientRect();
      if (!rect) return { x: clientX, y: clientY };

      const originX = dimensions.width / 2 - dimensions.width / (2 * zoom) - panOffset.x;
      const originY = dimensions.height / 2 - dimensions.height / (2 * zoom) - panOffset.y;

      return {
        x: originX + (clientX - rect.left) / zoom,
        y: originY + (clientY - rect.top) / zoom,
      };
    },
    [dimensions.width, dimensions.height, zoom, panOffset],
  );

  // ResizeObserver is used to dynamically update width and height
  // when the wrapper elements are rendered or resized.
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      const actualWidth = width || wrapper.clientWidth || 800;
      const actualHeight = height || wrapper.clientHeight || 600;
      setDimensions({ width: actualWidth, height: actualHeight });
    });

    resizeObserver.observe(wrapper);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // ── Aggregate stats from loaded sessions ──────────────────────
  const aggregateStats = useMemo(() => {
    let totalCostSum = 0;
    let totalSessionCount = totalSessions;
    let uniqueModelsSet = new Set<string>();
    let uniqueAgentsSet = new Set<string>();

    for (const session of sessions) {
      totalCostSum += session.stats?.totalCost || 0;
      if (session.model) uniqueModelsSet.add(session.model);
      if (session.agent) uniqueAgentsSet.add(session.agent);
    }

    return {
      totalCost: totalCostSum,
      sessionCount: totalSessionCount,
      modelCount: uniqueModelsSet.size,
      agentCount: uniqueAgentsSet.size,
    };
  }, [sessions, totalSessions]);

  // ── Load sessions list ────────────────────────────────────────
  const loadSessions = useCallback(async (page: number, isAppending: boolean) => {
    if (isAppending) {
      setIsLoadingMoreSessions(true);
    } else {
      setIsSessionsLoading(true);
    }
    try {
      const params: Record<string, string | number | boolean> = {
        page,
        limit: PAGE_SIZE,
        sort: "updatedAt",
        order: "desc",
        ...dateParams,
      };
      if (projectFilter) params.project = projectFilter;
      if (agentFilter) params.agent = agentFilter;
      if (providerFilter) params.provider = providerFilter;
      if (modelFilter) params.model = modelFilter;
      if (workspaceFilter) params.workspace = workspaceFilter;
      if (serverSearchQuery.trim()) params.search = serverSearchQuery.trim();

      const response = await IrisService.getAgentSessions(params);
      const incomingSessions = response.data || [];
      const totalCount = response.total || 0;

      if (isAppending) {
        setSessions((previousSessions) => [...previousSessions, ...incomingSessions]);
      } else {
        setSessions(incomingSessions);
      }
      setTotalSessions(totalCount);
    } catch (error: unknown) {
      console.error("Failed to load agent sessions:", error);
    } finally {
      setIsSessionsLoading(false);
      setIsLoadingMoreSessions(false);
    }
  }, [dateParams, projectFilter, agentFilter, providerFilter, modelFilter, workspaceFilter, serverSearchQuery]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setSessionPage(1);
    loadSessions(1, false);
  }, [loadSessions]);

  // Append next page when sessionPage advances beyond 1
  useEffect(() => {
    if (sessionPage > 1) {
      loadSessions(sessionPage, true);
    }
  }, [sessionPage, loadSessions]);

  const hasMoreSessions = sessions.length < totalSessions;

  const handleLoadMoreSessions = useCallback(() => {
    if (!isLoadingMoreSessions && hasMoreSessions) {
      setSessionPage((previousPage) => previousPage + 1);
    }
  }, [isLoadingMoreSessions, hasMoreSessions]);

  // Keep refs in sync with state for SSE callback access
  useEffect(() => {
    sessionRequestsRef.current = sessionRequests;
  }, [sessionRequests]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    sessionStatsRef.current = sessionStats;
  }, [sessionStats]);

  // ── Load session graph data when a session is selected ────────
  const loadSessionGraph = useCallback(async (session: AgentSession) => {
    const sessionId = session.id || session._id;
    setIsGraphLoading(true);
    setSelectedNodeId(null);
    setSessionStats(null);
    setSessionRequests([]);
    setGraphData(null);
    setEnteringNodeIds(new Set());

    try {
      const [statsResponse, requestsResponse] = await Promise.all([
        IrisService.getSessionStats(sessionId).catch(() => null),
        IrisService.getSessionRequests(sessionId).catch(() => ({
          requests: [],
        })),
      ]);

      setSessionStats(statsResponse);
      const requestsList = requestsResponse.requests || [];
      setSessionRequests(requestsList);

      const graph = buildGraphFromSession(
        session,
        statsResponse,
        requestsList,
      );

      // Apply hierarchical tiered layout
      const canvasWidth = dimensions.width;
      const canvasHeight = dimensions.height;
      applyHierarchicalLayout(graph, canvasWidth, canvasHeight);

      setGraphData(graph);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    } catch (error: unknown) {
      console.error("Failed to load session graph:", error);
    } finally {
      setIsGraphLoading(false);
    }
  }, [dimensions]);

  const handleSessionSelect = useCallback(
    (session: AgentSession) => {
      const sessionId = session.id || session._id;
      loadingSessionIdRef.current = sessionId;
      setSelectedSession(session);
      loadSessionGraph(session);

      const params = new URLSearchParams(searchParams.toString());
      params.set("session", sessionId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [loadSessionGraph, searchParams, router, pathname],
  );

  const urlSessionId = searchParams.get("session") || null;

  useEffect(() => {
    if (!urlSessionId) {
      setSelectedSession(null);
      setSessionStats(null);
      setSessionRequests([]);
      setGraphData(null);
      setSelectedNodeId(null);
      loadingSessionIdRef.current = null;
      return;
    }

    const currentSelectedId = selectedSession
      ? selectedSession.id || selectedSession._id
      : null;
    if (urlSessionId === currentSelectedId || urlSessionId === loadingSessionIdRef.current) {
      return;
    }

    loadingSessionIdRef.current = urlSessionId;

    const existingSession = sessions.find(
      (sessionEntry) => (sessionEntry.id || sessionEntry._id) === urlSessionId
    );

    if (existingSession) {
      setSelectedSession(existingSession);
      loadSessionGraph(existingSession);
    } else {
      let isEffectCancelled = false;
      setIsGraphLoading(true);

      IrisService.getAgentSession(urlSessionId)
        .then((fetchedSession) => {
          if (isEffectCancelled) return;
          setSelectedSession(fetchedSession);
          loadSessionGraph(fetchedSession);
        })
        .catch((error) => {
          if (isEffectCancelled) return;
          console.error("Failed to fetch agent session from URL param:", error);
          setIsGraphLoading(false);
          loadingSessionIdRef.current = null;
        });

      return () => {
        isEffectCancelled = true;
      };
    }
  }, [urlSessionId, sessions, loadSessionGraph, selectedSession]);

  // ── Admin header badge ─────────────────────────────────────────
  useEffect(() => {
    setTitleBadge(totalSessions);
  }, [setTitleBadge, totalSessions]);

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  // ── Circular Collision Repulsion Loop ─────────────────────────
  const nodesRef = useRef<GraphNode[]>([]);
  const draggingRef = useRef<{ id: string } | null>(null);
  const rafRef = useRef<number | null>(null);
  const settleCountRef = useRef<number>(0);
  const collisionTickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    nodesRef.current = graphData?.nodes || [];
  }, [graphData?.nodes]);

  useEffect(() => {
    draggingRef.current = draggedNode;
  }, [draggedNode]);

  useEffect(() => {
    const PUSH_FACTOR = 0.35;
    const MIN_PUSH = 0.5;
    const COLLISION_PADDING = 15; // minimum padding between nodes

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
        rafRef.current = requestAnimationFrame(
          collisionTickRef.current as FrameRequestCallback,
        );
      } else if (hasUpdates) {
        settleCountRef.current = 10;
        rafRef.current = requestAnimationFrame(
          collisionTickRef.current as FrameRequestCallback,
        );
      } else if (settleCountRef.current > 0) {
        settleCountRef.current--;
        rafRef.current = requestAnimationFrame(
          collisionTickRef.current as FrameRequestCallback,
        );
      } else {
        rafRef.current = null;
      }
    };

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startCollisionLoop = useCallback((frames = 30) => {
    if (!rafRef.current && collisionTickRef.current) {
      settleCountRef.current = frames;
      rafRef.current = requestAnimationFrame(
        collisionTickRef.current as FrameRequestCallback,
      );
    }
  }, []);

  useEffect(() => {
    if (draggedNode) startCollisionLoop(30);
  }, [draggedNode, startCollisionLoop]);

  // ── Incremental graph rebuild with position preservation ───────
  const incrementalGraphRebuild = useCallback((
    session: AgentSession,
    updatedStats: SessionStats | null,
    updatedRequests: IrisRequestEntry[],
  ) => {
    // Snapshot existing node positions before rebuild
    const existingPositions = new Map<string, { x: number; y: number }>();
    const existingNodeIds = new Set<string>();

    setGraphData((previousGraphData) => {
      if (previousGraphData) {
        for (const node of previousGraphData.nodes) {
          existingPositions.set(node.id, { x: node.x, y: node.y });
          existingNodeIds.add(node.id);
        }
      }

      const graph = buildGraphFromSession(session, updatedStats, updatedRequests);

      // Identify newly arriving nodes
      const newNodeIds = new Set<string>();
      for (const node of graph.nodes) {
        if (!existingNodeIds.has(node.id)) {
          newNodeIds.add(node.id);
        }
      }

      // Apply layout to get default positions for new nodes
      applyHierarchicalLayout(graph, dimensions.width, dimensions.height);

      // Restore positions for previously existing nodes
      for (const node of graph.nodes) {
        const previousPosition = existingPositions.get(node.id);
        if (previousPosition) {
          node.x = previousPosition.x;
          node.y = previousPosition.y;
        }
      }

      // Trigger entrance animation for new nodes
      if (newNodeIds.size > 0) {
        setEnteringNodeIds(newNodeIds);
        setTimeout(() => {
          setEnteringNodeIds(new Set());
        }, 600);
      }

      return graph;
    });
  }, [dimensions]);

  // ── SSE live graph updates (Change Streams) ───────────────────
  useEffect(() => {
    const currentSession = selectedSession;
    if (!currentSession) {
      setIsLiveConnected(false);
      return;
    }

    const selectedSessionId = currentSession.id || currentSession._id;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let previousRequestCount = sessionRequestsRef.current.length;

    const performIncrementalRefresh = async () => {
      const activeSession = selectedSessionRef.current;
      if (!activeSession) return;
      const activeSessionId = activeSession.id || activeSession._id;

      try {
        const [updatedStats, updatedRequestsResponse] = await Promise.all([
          IrisService.getSessionStats(activeSessionId).catch(() => sessionStatsRef.current),
          IrisService.getSessionRequests(activeSessionId).catch(() => ({
            requests: sessionRequestsRef.current,
          })),
        ]);

        const updatedRequests = updatedRequestsResponse.requests || [];

        // Only rebuild if request count actually changed
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
        // Silently ignore — next event or poll will retry
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
          // Fall back to polling when Change Streams are unavailable
          if (!pollInterval) {
            pollInterval = setInterval(performIncrementalRefresh, 10_000);
          }
        }
      },
      onChange: (changeEvent: IrisCollectionChangeEvent) => {
        if (
          changeEvent.collection === "requests" &&
          changeEvent.conversationId === selectedSessionId
        ) {
          debouncedRefresh();
        }
      },
    });

    return () => {
      subscription.close();
      if (pollInterval) clearInterval(pollInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [selectedSession, incrementalGraphRebuild, startCollisionLoop]);

  // ── Canvas pan/zoom handlers ──────────────────────────────────
  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if ((event.target as SVGElement).closest("[data-node-id]")) return;
      setIsPanning(true);
      lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
    },
    [],
  );

  const handleNodeMouseDown = useCallback(
    (event: React.MouseEvent<SVGGElement>, nodeId: string) => {
      if (event.button !== 0) return;
      event.stopPropagation();

      hasDraggedRef.current = false;
      dragStartRef.current = { x: event.clientX, y: event.clientY };

      const node = graphData?.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const svgPos = screenToSvg(event.clientX, event.clientY);
      setDraggedNode({
        id: nodeId,
        offsetX: svgPos.x - node.x,
        offsetY: svgPos.y - node.y,
      });
    },
    [graphData, screenToSvg],
  );

  const handleNodeTouchStart = useCallback(
    (event: React.TouchEvent<SVGGElement>, nodeId: string) => {
      if (event.touches.length !== 1) return;
      event.stopPropagation();

      const activeTouch = event.touches[0];
      hasDraggedRef.current = false;
      dragStartRef.current = { x: activeTouch.clientX, y: activeTouch.clientY };

      const node = graphData?.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const svgPos = screenToSvg(activeTouch.clientX, activeTouch.clientY);
      setDraggedNode({
        id: nodeId,
        offsetX: svgPos.x - node.x,
        offsetY: svgPos.y - node.y,
      });
    },
    [graphData, screenToSvg],
  );

  const handleGlobalMouseMove = useCallback(
    (event: MouseEvent) => {
      if (draggedNode) {
        const deltaX = event.clientX - dragStartRef.current.x;
        const deltaY = event.clientY - dragStartRef.current.y;
        if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 3) {
          hasDraggedRef.current = true;
        }

        const svgPos = screenToSvg(event.clientX, event.clientY);
        const newX = svgPos.x - draggedNode.offsetX;
        const newY = svgPos.y - draggedNode.offsetY;

        setGraphData((previousGraphData) => {
          if (!previousGraphData) return null;
          return {
            ...previousGraphData,
            nodes: previousGraphData.nodes.map((node) =>
              node.id === draggedNode.id ? { ...node, x: newX, y: newY } : node
            ),
          };
        });
      }

      if (isPanning) {
        const deltaX = event.clientX - lastMousePositionRef.current.x;
        const deltaY = event.clientY - lastMousePositionRef.current.y;
        lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
        setPanOffset((previous) => ({
          x: previous.x + deltaX / zoom,
          y: previous.y + deltaY / zoom,
        }));
      }
    },
    [draggedNode, isPanning, screenToSvg, zoom],
  );

  const handleGlobalMouseUp = useCallback(() => {
    if (draggedNode) {
      setDraggedNode(null);
    }
    if (isPanning) {
      setIsPanning(false);
    }
  }, [draggedNode, isPanning]);

  const handleGlobalTouchMove = useCallback(
    (event: TouchEvent) => {
      if (draggedNode && event.touches.length === 1) {
        event.preventDefault();
        const activeTouch = event.touches[0];
        const deltaX = activeTouch.clientX - dragStartRef.current.x;
        const deltaY = activeTouch.clientY - dragStartRef.current.y;
        if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 3) {
          hasDraggedRef.current = true;
        }

        const svgPos = screenToSvg(activeTouch.clientX, activeTouch.clientY);
        const newX = svgPos.x - draggedNode.offsetX;
        const newY = svgPos.y - draggedNode.offsetY;

        setGraphData((previousGraphData) => {
          if (!previousGraphData) return null;
          return {
            ...previousGraphData,
            nodes: previousGraphData.nodes.map((node) =>
              node.id === draggedNode.id ? { ...node, x: newX, y: newY } : node
            ),
          };
        });
      }
    },
    [draggedNode, screenToSvg],
  );

  const handleGlobalTouchEnd = useCallback(() => {
    if (draggedNode) {
      setDraggedNode(null);
    }
  }, [draggedNode]);

  useEffect(() => {
    if (draggedNode || isPanning) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }
    if (draggedNode) {
      window.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
      window.addEventListener("touchend", handleGlobalTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchmove", handleGlobalTouchMove);
      window.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [draggedNode, isPanning, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalTouchMove, handleGlobalTouchEnd]);

  const handleCanvasWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
      setZoom((previousZoom) =>
        Math.max(0.3, Math.min(3, previousZoom * zoomFactor)),
      );
    },
    [],
  );

  const handleZoomIn = useCallback(() => {
    setZoom((previousZoom) => Math.min(3, previousZoom * 1.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((previousZoom) => Math.max(0.3, previousZoom * 0.8));
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ── Node click handler ────────────────────────────────────────
  const handleNodeClick = useCallback((nodeId: string) => {
    if (hasDraggedRef.current) {
      setSelectedNodeId(nodeId);
    } else {
      setSelectedNodeId((previousId) =>
        previousId === nodeId ? null : nodeId,
      );
    }
  }, []);

  // Lazy-fetch full request detail when a request node is selected
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
      .then((detail) => {
        if (!isCancelled) {
          setSelectedRequestDetail(detail);
          setIsRequestDetailLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSelectedRequestDetail(null);
          setIsRequestDetailLoading(false);
        }
      });

    return () => { isCancelled = true; };
  }, [selectedNodeId, graphData]);

  const togglePopoverSection = useCallback((sectionKey: string) => {
    setExpandedPopoverSections((previous) => {
      const next = new Set(previous);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }, []);

  // ── Compute selected node for detail popover ──────────────────
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graphData) return null;
    return graphData.nodes.find((node) => node.id === selectedNodeId) || null;
  }, [selectedNodeId, graphData]);

  // ── SVG viewbox transform ─────────────────────────────────────
  const { width: canvasWidth, height: canvasHeight } = dimensions;

  const viewBoxTransform = useMemo(() => {
    const scaledWidth = canvasWidth / zoom;
    const scaledHeight = canvasHeight / zoom;
    const originX = canvasWidth / 2 - scaledWidth / 2 - panOffset.x;
    const originY = canvasHeight / 2 - scaledHeight / 2 - panOffset.y;
    return `${originX} ${originY} ${scaledWidth} ${scaledHeight}`;
  }, [canvasWidth, canvasHeight, zoom, panOffset]);

  const sessionListItems = useMemo(() =>
    sessions.map((session) => mapAgentSessionToHistoryItem(session)),
  [sessions]);

  // ── Loading state ─────────────────────────────────────────────
  if (isSessionsLoading && sessions.length === 0) {
    return (
      <div className={styles["page-container"]}>
        <div className={styles["is-loading-state"]}>
          <PanelLoadingSpinner size="large" />
        </div>
      </div>
    );
  }

  if (!isSessionsLoading && sessions.length === 0) {
    return (
      <div className={styles["page-container"]}>
        <div className={styles["empty-state"]}>
          <Network size={36} className={styles["empty-state-icon"]} />
          <div className={styles["empty-state-title"]}>No sessions yet</div>
          <div className={styles["empty-state-subtitle"]}>
            Agent sessions will appear here once AI conversations
            with tool calling are initiated.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles["page-container"]}>
      {/* ── Filters ── */}
      <AdminFiltersCardComponent />

      {/* ── Stats Strip ── */}
      <div className={styles["stats-strip"]}>
        <StatsCard
          label="Total Sessions"
          value={formatNumber(aggregateStats.sessionCount)}
          subtitle="Agent conversations"
          icon={Network}
          variant="info"
        />
        <StatsCard
          label="Total Cost"
          value={formatCost(aggregateStats.totalCost)}
          subtitle="Estimated spend"
          icon={DollarSign}
          variant="warning"
        />
        <StatsCard
          label="Models Used"
          value={formatNumber(aggregateStats.modelCount)}
          subtitle="Unique models"
          icon={Server}
          variant="success"
        />
        <StatsCard
          label="Active Agents"
          value={formatNumber(aggregateStats.agentCount)}
          subtitle="Distinct agents"
          icon={Bot}
          variant="info"
        />
      </div>

      {/* ── Split Layout ── */}
      <div className={styles["split-layout"]}>
        {/* ── Session List Panel ── */}
        <div className={styles["session-list-panel"]}>
          <HistoryList
            items={sessionListItems}
            activeId={selectedSession ? (selectedSession.id || selectedSession._id) : null}
            onSelect={(item: { id: string }) => {
              const session = sessions.find(
                (sessionEntry) => (sessionEntry.id || sessionEntry._id) === item.id,
              );
              if (session) handleSessionSelect(session);
            }}
            icon={Network}
            readOnly
            emptyLabel="No sessions"
            searchPlaceholder="Search sessions..."
            showProviderFilters={false}
            showModalityFilters={false}
            showCostFilters={false}
            countLabel="sessions"
            hasMore={hasMoreSessions}
            loadingMore={isLoadingMoreSessions}
            onLoadMore={handleLoadMoreSessions}
            onSearchChange={debouncedSetServerSearch}
          />
        </div>

        {/* ── Graph Panel ── */}
        <div className={styles["graph-panel"]}>
          <div className={styles["graph-header"]}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Network size={14} />
              Session Graph
              {graphData && (
                <span className={styles["graph-header-badge"]}>
                  {graphData.nodes.length} nodes · {graphData.edges.length} edges
                </span>
              )}
              {selectedSession && isLiveConnected && (
                <span className={styles["live-indicator"]}>
                  <span className={styles["live-indicator-dot"]} />
                  LIVE
                </span>
              )}
            </span>
            {selectedSession && sessionStats && (
              <div className={styles["graph-header-actions"]}>
                <span className={styles["graph-header-badge"]}>
                  {formatNumber(sessionStats.requestCount || 0)} requests
                </span>
                <span className={styles["graph-header-badge"]}>
                  {formatCost(sessionStats.totalCost || 0)}
                </span>
                {sessionStats.totalElapsedTime && sessionStats.totalElapsedTime > 0 && (
                  <span className={styles["graph-header-badge"]}>
                    {formatElapsedTime(sessionStats.totalElapsedTime)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            className={styles["graph-canvas-wrapper"]}
            ref={canvasWrapperRef}
          >
            <StarfieldComponent
              className={styles['starfield']}
              panX={panOffset.x}
              panY={panOffset.y}
            />
            {!selectedSession && !isGraphLoading && (
              <div className={styles["graph-empty-prompt"]}>
                <Network size={48} className={styles["graph-empty-prompt-icon"]} />
                <div className={styles["graph-empty-prompt-title"]}>
                  Select a session
                </div>
                <div className={styles["graph-empty-prompt-subtitle"]}>
                  Choose an agent session from the left panel to visualize
                  its relationships as an interactive node graph.
                </div>
              </div>
            )}

            {isGraphLoading && (
              <div className={styles["graph-empty-prompt"]}>
                <PanelLoadingSpinner />
              </div>
            )}

            {graphData && !isGraphLoading && (
              <>
                <svg
                  className={styles["graph-canvas"]}
                  viewBox={viewBoxTransform}
                  onMouseDown={handleCanvasMouseDown}
                  onWheel={handleCanvasWheel}
                  style={{ cursor: draggedNode ? "grabbing" : isPanning ? "grabbing" : "grab" }}
                >
                  <defs>
                    {/* Glow filter for the center session node */}
                    <filter id="session-glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="6" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    {/* Subtle glow for hovered nodes */}
                    <filter id="node-hover-glow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    {/* Arrowhead markers for each node category */}
                    {(Object.entries(NODE_COLORS) as [NodeCategory, string][]).map(([category, color]) => (
                      <marker
                        key={`arrow-${category}`}
                        id={`arrow-${category}`}
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
                    const sourceNode = graphData.nodes.find(
                      (node) => node.id === edge.source,
                    );
                    const targetNode = graphData.nodes.find(
                      (node) => node.id === edge.target,
                    );
                    if (!sourceNode || !targetNode) return null;

                    const isEdgeSelected =
                      selectedNodeId === edge.source || selectedNodeId === edge.target;
                    const baseOpacity = 0.15 + (edge.strength || 0.5) * 0.2;
                    const edgeOpacity = isEdgeSelected ? 0.95 : baseOpacity;
                    const edgeColor = NODE_COLORS[targetNode.category] || "oklch(0.6 0 0)";
                    const pathData = straightEdgePath(
                      sourceNode.x, sourceNode.y, sourceNode.radius,
                      targetNode.x, targetNode.y, targetNode.radius,
                    );

                    return (
                      <g
                        key={`edge-group-${edgeIndex}`}
                        className={`${styles["connection-group"]} ${isEdgeSelected ? styles["connection-selected"] : ""}`}
                      >
                        {/* Interactive invisible hit area */}
                        <path
                          d={pathData}
                          stroke="transparent"
                          strokeWidth={8}
                          fill="none"
                          style={{ cursor: "pointer" }}
                        />
                        {/* Visible connection path */}
                        <path
                          d={pathData}
                          stroke={edgeColor}
                          strokeWidth={isEdgeSelected ? 2.5 : 1.5}
                          strokeOpacity={edgeOpacity}
                          fill="none"
                          className={styles["connection-line"]}
                          markerEnd={`url(#arrow-${targetNode.category})`}
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
                        className={`${styles["node-group"]}${enteringNodeIds.has(node.id) ? ` ${styles["node-entering"]}` : ""}`}
                        onMouseDown={(event) => handleNodeMouseDown(event, node.id)}
                        onTouchStart={(event) => handleNodeTouchStart(event, node.id)}
                        onClick={() => handleNodeClick(node.id)}
                        filter={
                          isSessionCenter
                            ? "url(#session-glow)"
                            : isSelected
                              ? "url(#node-hover-glow)"
                              : undefined
                        }
                      >
                        {/* Selection ring */}
                        {isSelected && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.radius + 5}
                            fill="none"
                            stroke={nodeColor}
                            strokeWidth={2}
                            strokeOpacity={0.6}
                            strokeDasharray="4 3"
                          />
                        )}

                        {/* Node circle */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={node.radius}
                          fill={nodeColor}
                          fillOpacity={isSessionCenter ? 0.95 : 0.85}
                          stroke={nodeColor}
                          strokeWidth={isSelected ? 2 : 1}
                          strokeOpacity={0.5}
                        />

                        {/* Sequence number badge for requests */}
                        {node.sequenceNumber != null && node.category === "request" && (
                          <>
                            <circle
                              cx={node.x + node.radius * 0.7}
                              cy={node.y - node.radius * 0.7}
                              r={8}
                              fill="oklch(0.25 0 0)"
                              stroke={nodeColor}
                              strokeWidth={1.5}
                            />
                            <text
                              x={node.x + node.radius * 0.7}
                              y={node.y - node.radius * 0.7}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="oklch(0.95 0 0)"
                              fontSize={8}
                              fontWeight={600}
                            >
                              {node.sequenceNumber > 99 ? "99+" : node.sequenceNumber}
                            </text>
                          </>
                        )}

                        {/* Label */}
                        <text
                          x={node.x}
                          y={node.y + node.radius + 14}
                          textAnchor="middle"
                          fill="oklch(0.75 0 0)"
                          fontSize={10}
                          fontWeight={500}
                          style={{
                            pointerEvents: "none",
                            userSelect: "none",
                          }}
                        >
                          {node.label.length > 24
                            ? `${node.label.slice(0, 22)}…`
                            : node.label}
                        </text>

                        {/* Category icon text (emoji substitute) */}
                        <text
                          x={node.x}
                          y={node.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="oklch(0.98 0 0)"
                          fontSize={node.radius * 0.7}
                          fontWeight={600}
                          style={{
                            pointerEvents: "none",
                            userSelect: "none",
                          }}
                        >
                          {node.category === "session"
                            ? "◉"
                            : node.category === "model"
                              ? "◈"
                              : node.category === "tool"
                                ? "⚙"
                                : node.category === "request"
                                  ? "↗"
                                  : node.category === "user"
                                    ? "●"
                                    : node.category === "project"
                                      ? "▣"
                                      : node.category === "provider"
                                        ? "◆"
                                        : node.category === "agent"
                                          ? "◎"
                                          : node.category === "embedding"
                                            ? "⬡"
                                            : "○"}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Legend */}
                <div className={styles["graph-legend"]}>
                  {(Object.entries(NODE_COLORS) as [NodeCategory, string][]).map(
                    ([category, color]) => (
                      <div key={category} className={styles["graph-legend-item"]}>
                        <span
                          className={styles["graph-legend-dot"]}
                          style={{ background: color }}
                        />
                        {NODE_LABELS[category]}
                      </div>
                    ),
                  )}
                </div>

                {/* Zoom Controls */}
                <div className={styles["zoom-controls"]}>
                  <button
                    className={styles["zoom-button"]}
                    onClick={handleZoomIn}
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    className={styles["zoom-button"]}
                    onClick={handleZoomOut}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    className={styles["zoom-button"]}
                    onClick={handleZoomFit}
                    title="Fit to view"
                    aria-label="Fit to view"
                  >
                    <Maximize size={14} />
                  </button>
                </div>

                {/* Node Detail Popover */}
                {selectedNode && (
                  <div className={styles["node-detail-popover"]}>
                    <div className={styles["node-detail-popover-header"]}>
                      <div className={styles["node-detail-popover-title"]}>
                        <span
                          className={styles["node-detail-popover-type"]}
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
                        className={styles["zoom-button"]}
                        onClick={() => setSelectedNodeId(null)}
                        title="Close details"
                        aria-label="Close details"
                        style={{ width: 24, height: 24 }}
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {/* Dynamic metadata rows based on node category */}
                    {selectedNode.category === "session" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Session Details
                        </div>
                        <DetailRow
                          label="Session ID"
                          value={String(selectedNode.metadata?.sessionId || "—").slice(0, 12) + "…"}
                        />
                        <DetailRow
                          label="Status"
                          value={String(selectedNode.metadata?.status || "—")}
                        />
                        <DetailRow
                          label="Requests"
                          value={formatNumber(Number(selectedNode.metadata?.requestCount || 0))}
                        />
                        <DetailRow
                          label="Total Cost"
                          value={formatCost(Number(selectedNode.metadata?.totalCost || 0))}
                        />
                        <DetailRow
                          label="Total Tokens"
                          value={formatNumber(Number(selectedNode.metadata?.totalTokens || 0))}
                        />
                        {Number(selectedNode.metadata?.totalElapsedTime || 0) > 0 && (
                          <DetailRow
                            label="Duration"
                            value={formatElapsedTime(Number(selectedNode.metadata?.totalElapsedTime))}
                          />
                        )}
                        {selectedNode.metadata?.createdAt != null && (
                          <DetailRow
                            label="Created"
                            value={formatTimeAgo(String(selectedNode.metadata.createdAt))}
                          />
                        )}
                      </div>
                    )}

                    {selectedNode.category === "model" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Model Details
                        </div>
                        <DetailRow
                          label="Full Name"
                          value={String(selectedNode.metadata?.fullModelName || "—")}
                        />
                        <DetailRow
                          label="Requests"
                          value={formatNumber(Number(selectedNode.metadata?.requestCount || 0))}
                        />
                        <DetailRow
                          label="Total Cost"
                          value={formatCost(Number(selectedNode.metadata?.totalCost || 0))}
                        />
                        <DetailRow
                          label="Tokens Used"
                          value={formatNumber(Number(selectedNode.metadata?.totalTokens || 0))}
                        />
                      </div>
                    )}

                    {selectedNode.category === "tool" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Tool Details
                        </div>
                        <DetailRow
                          label="Tool Name"
                          value={String(selectedNode.metadata?.toolName || "—")}
                        />
                        <DetailRow
                          label="Invocations"
                          value={formatNumber(Number(selectedNode.metadata?.usageCount || 0))}
                        />
                      </div>
                    )}

                    {selectedNode.category === "request" && (
                      <>
                        <div className={styles["node-detail-popover-section"]}>
                          <div className={styles["node-detail-popover-section-title"]}>
                            Request Details
                          </div>
                          {selectedNode.sequenceNumber != null && (
                            <DetailRow
                              label="Sequence"
                              value={`#${selectedNode.sequenceNumber}`}
                            />
                          )}
                          <DetailRow
                            label="Operation"
                            value={String(selectedNode.metadata?.operation || "—")}
                          />
                          <DetailRow
                            label="Cost"
                            value={formatCost(Number(selectedNode.metadata?.estimatedCost || 0))}
                          />
                          {Number(selectedNode.metadata?.inputTokens || 0) > 0 && (
                            <DetailRow
                              label="Input Tokens"
                              value={formatNumber(Number(selectedNode.metadata?.inputTokens))}
                            />
                          )}
                          {Number(selectedNode.metadata?.outputTokens || 0) > 0 && (
                            <DetailRow
                              label="Output Tokens"
                              value={formatNumber(Number(selectedNode.metadata?.outputTokens))}
                            />
                          )}
                          {Number(selectedNode.metadata?.duration || 0) > 0 && (
                            <DetailRow
                              label="Duration"
                              value={formatElapsedTime(Number(selectedNode.metadata?.duration))}
                            />
                          )}
                          {selectedNode.metadata?.timestamp != null && (
                            <DetailRow
                              label="Timestamp"
                              value={formatTimeAgo(String(selectedNode.metadata.timestamp))}
                            />
                          )}
                        </div>

                        {/* Lazy-loaded Input / Output / Assets */}
                        {isRequestDetailLoading && (
                          <div className={styles["request-payload-loading"]}
                          >
                            <Loader2 size={14} className={styles["spinning-icon"]} />
                            Loading payloads…
                          </div>
                        )}

                        {selectedRequestDetail && (
                          <RequestPayloadSection
                            requestDetail={selectedRequestDetail}
                            expandedSections={expandedPopoverSections}
                            onToggleSection={togglePopoverSection}
                          />
                        )}
                      </>
                    )}

                    {selectedNode.category === "user" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          User Details
                        </div>
                        <DetailRow
                          label="Username"
                          value={String(selectedNode.metadata?.username || "—")}
                        />
                      </div>
                    )}

                    {selectedNode.category === "project" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Project Details
                        </div>
                        <DetailRow
                          label="Project"
                          value={String(selectedNode.metadata?.project || "—")}
                        />
                      </div>
                    )}

                    {selectedNode.category === "provider" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Provider Details
                        </div>
                        <DetailRow
                          label="Provider"
                          value={String(selectedNode.metadata?.provider || "—")}
                        />
                      </div>
                    )}

                    {selectedNode.category === "agent" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Agent Details
                        </div>
                        <DetailRow
                          label="Agent"
                          value={String(selectedNode.metadata?.agent || "—")}
                        />
                      </div>
                    )}

                    {selectedNode.category === "embedding" && (
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Embedding Model
                        </div>
                        <DetailRow
                          label="Full Name"
                          value={String(selectedNode.metadata?.fullModelName || "—")}
                        />
                        <DetailRow
                          label="Requests"
                          value={formatNumber(Number(selectedNode.metadata?.requestCount || 0))}
                        />
                        <DetailRow
                          label="Total Cost"
                          value={formatCost(Number(selectedNode.metadata?.totalCost || 0))}
                        />
                        <DetailRow
                          label="Tokens Used"
                          value={formatNumber(Number(selectedNode.metadata?.totalTokens || 0))}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Detail Row Sub-component ───────────────────────────────── */

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles["node-detail-popover-layout-row"]}>
      <span className={styles["node-detail-popover-layout-row-label"]}>{label}</span>
      <span className={styles["node-detail-popover-layout-row-value"]}>{value}</span>
    </div>
  );
}

/* ── Collapsible Payload Section Header ─────────────────────── */

function CollapsibleSectionHeader({
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
    <button
      className={styles["collapsible-section-header"]}
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      <span className={styles["collapsible-section-header-left"]}>
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <IconComponent size={12} />
        {label}
      </span>
      {badgeCount != null && badgeCount > 0 && (
        <span className={styles["collapsible-section-badge"]}>{badgeCount}</span>
      )}
    </button>
  );
}

/* ── Request Payload Section — Input / Output / Assets ──────── */

interface RequestPayloadMessage {
  role?: string;
  content?: string | unknown[] | null;
  images?: string[] | unknown[];
  audio?: string | unknown[];
  video?: string | unknown[];
  pdf?: string | unknown[];
  toolCalls?: { name: string; id?: string | null; args?: unknown }[];
  tool_calls?: { name: string; id?: string | null; args?: unknown }[];
  name?: string;
  toolCallId?: string;
  tool_call_id?: string;
}

interface RequestPayloadToolCall {
  name: string;
  id?: string | null;
  args?: unknown;
}

function RequestPayloadSection({
  requestDetail,
  expandedSections,
  onToggleSection,
}: {
  requestDetail: IrisRequestEntry;
  expandedSections: Set<string>;
  onToggleSection: (key: string) => void;
}) {
  const requestPayload = requestDetail.requestPayload as {
    messages?: RequestPayloadMessage[];
    tools?: string[];
    agenticIteration?: number;
  } | null;

  const responsePayload = requestDetail.responsePayload as {
    text?: string | null;
    thinking?: string | null;
    images?: string[];
    toolCalls?: RequestPayloadToolCall[] | null;
    audioRef?: string | null;
    usage?: Record<string, unknown>;
  } | null;

  const inputMessages = requestPayload?.messages || [];
  const userMessages = inputMessages.filter(
    (message) => message.role === "user" && message.content,
  );

  const allInputImages: string[] = [];
  for (const message of inputMessages) {
    if (message.images && Array.isArray(message.images)) {
      for (const imageReference of message.images) {
        if (typeof imageReference === "string" && !imageReference.startsWith("[base64")) {
          allInputImages.push(imageReference);
        }
      }
    }
  }

  const outputText = responsePayload?.text || null;
  const thinkingText = responsePayload?.thinking || null;
  const outputImages = responsePayload?.images || [];
  const outputToolCalls = responsePayload?.toolCalls || [];

  const hasInput = userMessages.length > 0 || allInputImages.length > 0;
  const hasOutput = !!outputText || !!thinkingText;
  const hasAssets = outputImages.length > 0 || allInputImages.length > 0;
  const hasToolCalls = outputToolCalls && outputToolCalls.length > 0;

  if (!hasInput && !hasOutput && !hasAssets && !hasToolCalls) {
    return null;
  }

  return (
    <div className={styles["request-payload-container"]}>
      {/* Input Messages */}
      {hasInput && (
        <div className={styles["request-payload-section"]}>
          <CollapsibleSectionHeader
            label="Input"
            icon={MessageSquare}
            badgeCount={userMessages.length}
            isExpanded={expandedSections.has("input")}
            onToggle={() => onToggleSection("input")}
          />
          {expandedSections.has("input") && (
            <div className={styles["request-payload-content"]}>
              {userMessages.map((message, messageIndex) => {
                const messageContent = typeof message.content === "string"
                  ? message.content
                  : JSON.stringify(message.content);
                return (
                  <div key={messageIndex} className={styles["request-message-block"]}>
                    <span className={styles["request-message-role-badge"]}>
                      {message.role || "user"}
                    </span>
                    <div className={styles["request-message-content"]}>
                      {messageContent && messageContent.length > 500
                        ? `${messageContent.slice(0, 500)}\u2026`
                        : messageContent}
                    </div>
                  </div>
                );
              })}
              {allInputImages.length > 0 && (
                <div className={styles["request-assets-grid"]}>
                  {allInputImages.map((imageUrl, imageIndex) => (
                    <a
                      key={imageIndex}
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles["request-asset-thumbnail-link"]}
                    >
                      <img
                        src={imageUrl}
                        alt={`Input image ${imageIndex + 1}`}
                        className={styles["request-asset-thumbnail"]}
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Output Content */}
      {hasOutput && (
        <div className={styles["request-payload-section"]}>
          <CollapsibleSectionHeader
            label="Output"
            icon={FileText}
            isExpanded={expandedSections.has("output")}
            onToggle={() => onToggleSection("output")}
          />
          {expandedSections.has("output") && (
            <div className={styles["request-payload-content"]}>
              {thinkingText && (
                <div className={styles["request-message-block"]}>
                  <span className={`${styles["request-message-role-badge"]} ${styles["request-message-role-badge-thinking"]}`}>
                    thinking
                  </span>
                  <div className={styles["request-message-content"]}>
                    {thinkingText.length > 500
                      ? `${thinkingText.slice(0, 500)}\u2026`
                      : thinkingText}
                  </div>
                </div>
              )}
              {outputText && (
                <div className={styles["request-message-block"]}>
                  <span className={`${styles["request-message-role-badge"]} ${styles["request-message-role-badge-assistant"]}`}>
                    assistant
                  </span>
                  <div className={styles["request-message-content"]}>
                    {outputText.length > 500
                      ? `${outputText.slice(0, 500)}\u2026`
                      : outputText}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Generated Assets / Images */}
      {outputImages.length > 0 && (
        <div className={styles["request-payload-section"]}>
          <CollapsibleSectionHeader
            label="Generated Assets"
            icon={ImageIcon}
            badgeCount={outputImages.length}
            isExpanded={expandedSections.has("assets")}
            onToggle={() => onToggleSection("assets")}
          />
          {expandedSections.has("assets") && (
            <div className={styles["request-payload-content"]}>
              <div className={styles["request-assets-grid"]}>
                {outputImages.map((imageUrl, imageIndex) => (
                  <a
                    key={imageIndex}
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles["request-asset-thumbnail-link"]}
                  >
                    <img
                      src={imageUrl}
                      alt={`Generated asset ${imageIndex + 1}`}
                      className={styles["request-asset-thumbnail"]}
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tool Calls */}
      {hasToolCalls && (
        <div className={styles["request-payload-section"]}>
          <CollapsibleSectionHeader
            label="Tool Calls"
            icon={Wrench}
            badgeCount={outputToolCalls!.length}
            isExpanded={expandedSections.has("tools")}
            onToggle={() => onToggleSection("tools")}
          />
          {expandedSections.has("tools") && (
            <div className={styles["request-payload-content"]}>
              {outputToolCalls!.map((toolCall, toolIndex) => (
                <div key={toolIndex} className={styles["request-tool-call-block"]}>
                  <div className={styles["request-tool-call-name"]}>
                    <Wrench size={10} />
                    {toolCall.name}
                  </div>
                  {toolCall.args != null ? (() => {
                    const argsText = typeof toolCall.args === "string"
                      ? toolCall.args
                      : JSON.stringify(toolCall.args, null, 2);
                    return (
                      <pre className={styles["request-tool-call-arguments"]}>
                        {argsText.length > 300
                          ? `${argsText.slice(0, 300)}\u2026`
                          : argsText}
                      </pre>
                    );
                  })() : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
