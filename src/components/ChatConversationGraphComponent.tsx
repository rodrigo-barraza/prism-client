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
import type { ToolCallEvent } from "../types/types";
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
import { EXECUTION_STATUS } from "../constants";

import graphStyles from "./ConversationGraphPageComponent.module.css";
import styles from "./ChatConversationGraphComponent.module.css";

/* ═══════════════════════════════════════════════════════════════════
   Node Graph Data Structures — imported from shared library
   ═══════════════════════════════════════════════════════════════════ */

export type {
  NodeCategory,
  GraphNode,
  GraphEdge,
  SubAgentTreeNode,
  GraphData,
} from "@rodrigo-barraza/utilities-library/graph";

import type { NodeCategory, GraphNode, GraphEdge, SubAgentTreeNode } from "@rodrigo-barraza/utilities-library/graph";

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
    enteringNodeIds,
    toolEmojiMap,
    nodesRef,
    draggedNodeIdRef,
    collisionOwnerRef,
  } = resolvedGraphState;

  // Identifies THIS rendering instance for collision-loop ownership. Two
  // instances can share the same graph state (sidebar + main area) — only
  // the owner runs the settlement loop, so pushes apply once per frame.
  const collisionInstanceIdRef = useRef<symbol>(Symbol("graph-collision-instance"));

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

  const rafRef = useRef<number | null>(null);
  const settleCountRef = useRef<number>(0);
  const collisionTickRef = useRef<(() => void) | null>(null);
  const previousNodeCountRef = useRef<number>(0);

  useEffect(() => {
    const PUSH_FACTOR = 0.35;
    const MIN_PUSH = 0.5;
    const COLLISION_PADDING = 15;

    collisionTickRef.current = () => {
      // Another instance sharing this graph state has claimed the loop —
      // halt this instance's loop so pushes aren't applied twice per frame.
      if (collisionOwnerRef.current !== collisionInstanceIdRef.current) {
        rafRef.current = null;
        return;
      }
      const currentNodes = nodesRef.current;
      const dragId = draggedNodeIdRef.current;
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

      if (draggedNodeIdRef.current) {
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
        collisionOwnerRef.current = null;
      }
    };

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fitAnimationFrameRef.current) cancelAnimationFrame(fitAnimationFrameRef.current);
      if (collisionOwnerRef.current === collisionInstanceIdRef.current) {
        collisionOwnerRef.current = null;
      }
    };
  }, []);

  const startCollisionLoop = useCallback((frames = 30) => {
    // Skip when another instance already owns (and runs) the loop
    if (collisionOwnerRef.current && collisionOwnerRef.current !== collisionInstanceIdRef.current) return;
    if (!rafRef.current && collisionTickRef.current) {
      collisionOwnerRef.current = collisionInstanceIdRef.current;
      settleCountRef.current = frames;
      rafRef.current = requestAnimationFrame(collisionTickRef.current as FrameRequestCallback);
    }
  }, []);

  useEffect(() => {
    if (draggedNode) {
      // Dragging must run the loop in THIS instance — steal ownership so the
      // other instance's loop halts and the dragged node stays pinned here.
      collisionOwnerRef.current = collisionInstanceIdRef.current;
      startCollisionLoop(30);
    }
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
      draggedNodeIdRef.current = nodeId;
      setDraggedNode({ id: nodeId, offsetX: svgPos.x - node.x, offsetY: svgPos.y - node.y });
    },
    [graphData, screenToSvg, draggedNodeIdRef],
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
    if (draggedNode) {
      draggedNodeIdRef.current = null;
      setDraggedNode(null);
    }
    if (isPanning) setIsPanning(false);
  }, [draggedNode, isPanning, draggedNodeIdRef]);

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
    const nodeById = new Map(graphData.nodes.map((graphNode) => [graphNode.id, graphNode]));

    // Hide the full request/tool chain hanging off an agent node. The agent
    // only has a direct edge to its FIRST request — later requests chain
    // request→request — so the walk must follow those edges transitively.
    const hideRequestChain = (agentNodeId: string) => {
      const queue = [agentNodeId];
      const visited = new Set(queue);
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        for (const edge of graphData.edges) {
          if (edge.source !== currentId || visited.has(edge.target)) continue;
          const targetNode = nodeById.get(edge.target);
          if (!targetNode) continue;
          if (targetNode.category === "request" || targetNode.category === "tool") {
            visited.add(edge.target);
            hidden.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
    };

    const hideDescendants = (treeNodes: SubAgentTreeNode[]) => {
      for (const treeNode of treeNodes) {
        hidden.add(treeNode.nodeId);
        hideRequestChain(treeNode.nodeId);
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

    // The root agent isn't part of subAgentTree — collapsing it hides the
    // entire sub-agent tree (the main request chain stays visible).
    const rootAgentNode = graphData.nodes.find((graphNode) => graphNode.category === "agent");
    if (rootAgentNode && collapsedSubTreeIds.has(rootAgentNode.id)) {
      hideDescendants(graphData.subAgentTree);
    } else {
      walkAndCollapse(graphData.subAgentTree);
    }
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
          (node) => node.category === "request" && (node.metadata?.status as string) === EXECUTION_STATUS.PENDING,
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
                const isPendingRequest = node.category === "request" && (node.metadata?.status as string) === EXECUTION_STATUS.PENDING;

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
                  // The root agent isn't in subAgentTree — its children are the whole tree
                  const childTreeNodes = node.category === "agent"
                    ? graphData.subAgentTree
                    : findNodeChildren(graphData.subAgentTree);
                  return countDescendants(childTreeNodes);
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
  onToggleSection: (_key: string) => void;
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
