"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Network,
  Server,
  FolderKanban,
  Bot,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  DollarSign,
} from "lucide-react";
import IrisService, {
  type IrisRequestEntry,
} from "../services/IrisService";
import type { AgentSession, SessionStats } from "../types/types";
import { cleanModelName } from "./BadgeComponent";
import { resolveProviderLabel } from "./ProviderLogosComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import { useAdminHeader } from "./AdminHeaderContextComponent";
import useProjectFilter from "../hooks/useProjectFilter";
import { SelectComponent, PaginationComponent, StatsCardComponent as StatsCard } from "@rodrigo-barraza/components-library";
import {
  formatNumber,
  formatCost,
  formatElapsedTime,
  timeAgo as formatTimeAgo,
} from "@rodrigo-barraza/utilities-library";
import { buildDateRangeParams } from "../utils/utilities";

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
  count?: number;
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

/* ═══════════════════════════════════════════════════════════════════
   Graph Builder — converts session data into nodes + edges

   Topology:
     Session ─→ Agent ─→ Model ─→ Provider
                  ├─→ Tool (× N)
                  ├─→ Request Operation (× N)
                  └─→ Embedding Model ─→ Embedding Provider
     Session ─→ Project
     Session ─→ User
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
    count?: number,
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
      count,
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

  // Project node — connects to session
  if (session.project) {
    const projectNodeId = `project:${session.project}`;
    addNode(projectNodeId, session.project, "project", 22, {
      project: session.project,
    });
    addEdge(sessionNodeId, projectNodeId, 0.8);
  }

  // Agent node — connects to session (central hub for models, tools, operations)
  const agentNodeId = session.agent
    ? `agent:${session.agent}`
    : `agent:default`;
  if (session.agent) {
    addNode(agentNodeId, session.agent, "agent", 24, {
      agent: session.agent,
    });
  } else {
    addNode(agentNodeId, "Default Agent", "agent", 24, {
      agent: "default",
    });
  }
  addEdge(sessionNodeId, agentNodeId, 0.9);

  // Aggregate data from requests — separate LLM vs embedding requests
  const llmModelCounts: Record<string, { count: number; cost: number; tokens: number; providers: Set<string> }> = {};
  const embeddingModelCounts: Record<string, { count: number; cost: number; tokens: number; providers: Set<string> }> = {};
  const toolCounts: Record<string, number> = {};
  const userSet = new Set<string>();

  for (const request of sessionRequests) {
    const isEmbeddingRequest = request.operation?.startsWith("embed:");

    if (request.model) {
      const targetCounts = isEmbeddingRequest ? embeddingModelCounts : llmModelCounts;
      if (!targetCounts[request.model]) {
        targetCounts[request.model] = { count: 0, cost: 0, tokens: 0, providers: new Set() };
      }
      targetCounts[request.model].count += 1;
      targetCounts[request.model].cost += request.estimatedCost || 0;
      targetCounts[request.model].tokens +=
        (request.inputTokens || 0) + (request.outputTokens || 0);
      if (request.provider) {
        targetCounts[request.model].providers.add(request.provider);
      }
    }
    if (request.username) {
      userSet.add(request.username);
    }
    if (request.toolApiNames?.length) {
      for (const toolName of request.toolApiNames) {
        toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
      }
    }
  }

  // Also use stats-level toolCounts if requests are sparse
  if (sessionStats?.toolCounts) {
    for (const [toolName, usageCount] of Object.entries(sessionStats.toolCounts)) {
      if (!toolCounts[toolName]) {
        toolCounts[toolName] = usageCount;
      }
    }
  }

  // LLM Model nodes — Agent → Model → Provider
  for (const [modelName, modelData] of Object.entries(llmModelCounts)) {
    const modelNodeId = `model:${modelName}`;
    const normalizedRadius = Math.min(26, 14 + Math.sqrt(modelData.count) * 3);
    addNode(modelNodeId, cleanModelName(modelName), "model", normalizedRadius, {
      fullModelName: modelName,
      requestCount: modelData.count,
      totalCost: modelData.cost,
      totalTokens: modelData.tokens,
    }, modelData.count);
    addEdge(agentNodeId, modelNodeId, 0.9);

    // Model → Provider
    for (const providerName of modelData.providers) {
      const providerNodeId = `provider:${providerName}`;
      addNode(providerNodeId, resolveProviderLabel(providerName) || providerName, "provider", 18, {
        provider: providerName,
      });
      addEdge(modelNodeId, providerNodeId, 0.7);
    }
  }

  // Embedding Model nodes — Agent → Embedding Model → Embedding Provider
  for (const [modelName, modelData] of Object.entries(embeddingModelCounts)) {
    const embeddingNodeId = `embedding:${modelName}`;
    const normalizedRadius = Math.min(22, 13 + Math.sqrt(modelData.count) * 2);
    addNode(embeddingNodeId, cleanModelName(modelName), "embedding", normalizedRadius, {
      fullModelName: modelName,
      requestCount: modelData.count,
      totalCost: modelData.cost,
      totalTokens: modelData.tokens,
    }, modelData.count);
    addEdge(agentNodeId, embeddingNodeId, 0.7);

    // Embedding Model → Provider
    for (const providerName of modelData.providers) {
      const embeddingProviderNodeId = `provider:embed:${providerName}`;
      addNode(embeddingProviderNodeId, resolveProviderLabel(providerName) || providerName, "provider", 16, {
        provider: providerName,
        isEmbeddingProvider: true,
      });
      addEdge(embeddingNodeId, embeddingProviderNodeId, 0.6);
    }
  }

  // Tool nodes — connect to Agent
  const toolEntries = Object.entries(toolCounts).sort(
    ([, countA], [, countB]) => countB - countA,
  );
  for (const [toolName, usageCount] of toolEntries.slice(0, 20)) {
    const toolNodeId = `tool:${toolName}`;
    const normalizedRadius = Math.min(22, 12 + Math.sqrt(usageCount) * 2);
    addNode(toolNodeId, toolName, "tool", normalizedRadius, {
      toolName,
      usageCount,
    }, usageCount);
    addEdge(agentNodeId, toolNodeId, 0.7);
  }

  // User nodes — connect to Session
  for (const userName of userSet) {
    const userNodeId = `user:${userName}`;
    addNode(userNodeId, userName, "user", 18, { username: userName });
    addEdge(sessionNodeId, userNodeId, 0.5);
  }

  // Request operation nodes — connect to Agent (iterations/operations are agent-driven)
  const operationCounts: Record<string, { count: number; cost: number }> = {};
  for (const request of sessionRequests) {
    const operation = request.operation || "unknown";
    if (!operationCounts[operation]) {
      operationCounts[operation] = { count: 0, cost: 0 };
    }
    operationCounts[operation].count += 1;
    operationCounts[operation].cost += request.estimatedCost || 0;
  }

  for (const [operation, operationData] of Object.entries(operationCounts)) {
    const requestGroupNodeId = `request:${operation}`;
    const normalizedRadius = Math.min(20, 12 + Math.sqrt(operationData.count) * 2);
    addNode(
      requestGroupNodeId,
      `${operation} (${operationData.count})`,
      "request",
      normalizedRadius,
      {
        operation,
        requestCount: operationData.count,
        totalCost: operationData.cost,
      },
      operationData.count,
    );
    addEdge(agentNodeId, requestGroupNodeId, 0.5);
  }

  return { nodes, edges };
}

/* ═══════════════════════════════════════════════════════════════════
   Force-Directed Layout Simulation (simple Euler integration)
   ═══════════════════════════════════════════════════════════════════ */

function initializeNodePositions(
  graphNodes: GraphNode[],
  centerX: number,
  centerY: number,
): void {
  const sessionNode = graphNodes.find((node) => node.category === "session");
  if (sessionNode) {
    sessionNode.x = centerX;
    sessionNode.y = centerY;
  }

  const orbitNodes = graphNodes.filter((node) => node.category !== "session");
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < orbitNodes.length; index++) {
    const distance = 120 + Math.sqrt(index) * 55;
    const angle = index * goldenAngle;
    orbitNodes[index].x = centerX + Math.cos(angle) * distance;
    orbitNodes[index].y = centerY + Math.sin(angle) * distance;
  }
}

function simulateForceLayout(
  graphData: GraphData,
  iterations: number,
  centerX: number,
  centerY: number,
): void {
  const { nodes: graphNodes, edges: graphEdges } = graphData;
  const damping = 0.85;
  const repulsionStrength = 2800;
  const attractionStrength = 0.012;
  const centerGravity = 0.002;

  for (let iteration = 0; iteration < iterations; iteration++) {
    // Repulsion between all node pairs
    for (let outerIndex = 0; outerIndex < graphNodes.length; outerIndex++) {
      for (let innerIndex = outerIndex + 1; innerIndex < graphNodes.length; innerIndex++) {
        const nodeA = graphNodes[outerIndex];
        const nodeB = graphNodes[innerIndex];
        const deltaX = nodeB.x - nodeA.x;
        const deltaY = nodeB.y - nodeA.y;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY + 1;
        const repulsionForce = repulsionStrength / distanceSquared;
        const distance = Math.sqrt(distanceSquared);
        const forceX = (deltaX / distance) * repulsionForce;
        const forceY = (deltaY / distance) * repulsionForce;
        nodeA.velocityX -= forceX;
        nodeA.velocityY -= forceY;
        nodeB.velocityX += forceX;
        nodeB.velocityY += forceY;
      }
    }

    // Attraction along edges
    const nodeMap = new Map(graphNodes.map((node) => [node.id, node]));
    for (const edge of graphEdges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) continue;
      const deltaX = targetNode.x - sourceNode.x;
      const deltaY = targetNode.y - sourceNode.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) + 1;
      const idealDistance = 160;
      const displacement = distance - idealDistance;
      const attractionForce = displacement * attractionStrength * (edge.strength || 1);
      const forceX = (deltaX / distance) * attractionForce;
      const forceY = (deltaY / distance) * attractionForce;
      sourceNode.velocityX += forceX;
      sourceNode.velocityY += forceY;
      targetNode.velocityX -= forceX;
      targetNode.velocityY -= forceY;
    }

    // Center gravity
    for (const node of graphNodes) {
      node.velocityX += (centerX - node.x) * centerGravity;
      node.velocityY += (centerY - node.y) * centerGravity;
    }

    // Apply velocity with damping
    for (const node of graphNodes) {
      node.velocityX *= damping;
      node.velocityY *= damping;
      node.x += node.velocityX;
      node.y += node.velocityY;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function SessionGraphPageComponent() {
  const { projectFilter, projectOptions, handleProjectChange } =
    useProjectFilter();
  const { setControls, setTitleBadge, dateRange, agentFilter } = useAdminHeader();
  const dateParams = useMemo(
    () => buildDateRangeParams(dateRange),
    [dateRange],
  );

  // Session list state
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [sessionPage, setSessionPage] = useState(1);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);

  // Selected session + graph state
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [sessionRequests, setSessionRequests] = useState<IrisRequestEntry[]>([]);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Canvas state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMousePositionRef = useRef({ x: 0, y: 0 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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
  const loadSessions = useCallback(async () => {
    setIsSessionsLoading(true);
    try {
      const params: Record<string, string | number | boolean> = {
        page: sessionPage,
        limit: PAGE_SIZE,
        sort: "updatedAt",
        order: "desc",
        ...dateParams,
      };
      if (projectFilter) params.project = projectFilter;
      if (agentFilter) params.agent = agentFilter;

      const response = await IrisService.getAgentSessions(params);
      setSessions(response.data || []);
      setTotalSessions(response.total || 0);
    } catch (error: unknown) {
      console.error("Failed to load agent sessions:", error);
    } finally {
      setIsSessionsLoading(false);
    }
  }, [sessionPage, dateParams, projectFilter, agentFilter]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── Load session graph data when a session is selected ────────
  const loadSessionGraph = useCallback(async (session: AgentSession) => {
    const sessionId = session.id || session._id;
    setIsGraphLoading(true);
    setSelectedNodeId(null);
    setSessionStats(null);
    setSessionRequests([]);
    setGraphData(null);

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

      // Initialize positions and run simulation
      const canvasWidth = dimensions.width;
      const canvasHeight = dimensions.height;
      initializeNodePositions(graph.nodes, canvasWidth / 2, canvasHeight / 2);
      simulateForceLayout(
        graph,
        200,
        canvasWidth / 2,
        canvasHeight / 2,
      );

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
      setSelectedSession(session);
      loadSessionGraph(session);
    },
    [loadSessionGraph],
  );

  // ── Admin header controls ─────────────────────────────────────
  useEffect(() => {
    setControls(
      <SelectComponent
        value={projectFilter || ""}
        options={projectOptions}
        onChange={handleProjectChange}
        placeholder="All Projects"
      />,
    );
  }, [setControls, projectFilter, projectOptions, handleProjectChange]);

  useEffect(() => {
    setTitleBadge(totalSessions);
  }, [setTitleBadge, totalSessions]);

  useEffect(() => {
    return () => {
      setControls(null);
      setTitleBadge(null);
    };
  }, [setControls, setTitleBadge]);

  // ── Canvas pan/zoom handlers ──────────────────────────────────
  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if ((event.target as SVGElement).closest("[data-node-id]")) return;
      isDraggingRef.current = true;
      lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
    },
    [],
  );

  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!isDraggingRef.current) return;
      const deltaX = event.clientX - lastMousePositionRef.current.x;
      const deltaY = event.clientY - lastMousePositionRef.current.y;
      lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
      setPanOffset((previous) => ({
        x: previous.x + deltaX / zoom,
        y: previous.y + deltaY / zoom,
      }));
    },
    [zoom],
  );

  const handleCanvasMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

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
    setSelectedNodeId((previousId) =>
      previousId === nodeId ? null : nodeId,
    );
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

  const totalSessionPages = Math.ceil(totalSessions / PAGE_SIZE);

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
          <div className={styles["session-list-header"]}>
            <Network size={14} />
            <span>Sessions</span>
            <span className={styles["session-list-header-count"]}>
              {totalSessions}
            </span>
          </div>

          <div className={styles["session-list-scroll"]}>
            {sessions.map((session) => {
              const sessionId = session.id || session._id;
              const isActive = selectedSession && (selectedSession.id || selectedSession._id) === sessionId;
              return (
                <div
                  key={sessionId}
                  className={`${styles["session-item"]} ${isActive ? styles["session-item-is-active-state"] : ""}`}
                  onClick={() => handleSessionSelect(session)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles["session-item-title"]}>
                    {session.title || "Untitled Session"}
                  </div>
                  <div className={styles["session-item-meta"]}>
                    {session.agent && (
                      <span className={`${styles["session-item-tag"]} ${styles["session-item-tag-agent"]}`}>
                        <Bot size={9} />
                        {session.agent}
                      </span>
                    )}
                    {session.model && (
                      <span className={`${styles["session-item-tag"]} ${styles["session-item-tag-model"]}`}>
                        <Server size={9} />
                        {cleanModelName(session.model)}
                      </span>
                    )}
                    {session.project && (
                      <span className={styles["session-item-tag"]}>
                        <FolderKanban size={9} />
                        {session.project}
                      </span>
                    )}
                    <span className={styles["session-item-meta-divider"]}>•</span>
                    <span>{formatTimeAgo(session.updatedAt)}</span>
                    {session.stats?.totalCost && session.stats.totalCost > 0 && (
                      <>
                        <span className={styles["session-item-meta-divider"]}>•</span>
                        <span>{formatCost(session.stats.totalCost)}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalSessionPages > 1 && (
            <div className={styles["pagination-footer"]}>
              <PaginationComponent
                page={sessionPage}
                totalPages={totalSessionPages}
                totalItems={totalSessions}
                onPageChange={setSessionPage}
                limit={PAGE_SIZE}
              />
            </div>
          )}
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
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  onWheel={handleCanvasWheel}
                  style={{ cursor: isDraggingRef.current ? "grabbing" : "grab" }}
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
                    const edgeOpacity = 0.15 + (edge.strength || 0.5) * 0.2;
                    return (
                      <line
                        key={`edge-${edgeIndex}`}
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke="oklch(0.6 0 0)"
                        strokeWidth={1}
                        strokeOpacity={edgeOpacity}
                      />
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
                        className={styles["node-group"]}
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

                        {/* Count badge */}
                        {node.count && node.count > 1 && (
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
                              {node.count > 99 ? "99+" : node.count}
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
                      <div className={styles["node-detail-popover-section"]}>
                        <div className={styles["node-detail-popover-section-title"]}>
                          Request Group
                        </div>
                        <DetailRow
                          label="Operation"
                          value={String(selectedNode.metadata?.operation || "—")}
                        />
                        <DetailRow
                          label="Count"
                          value={formatNumber(Number(selectedNode.metadata?.requestCount || 0))}
                        />
                        <DetailRow
                          label="Total Cost"
                          value={formatCost(Number(selectedNode.metadata?.totalCost || 0))}
                        />
                      </div>
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
