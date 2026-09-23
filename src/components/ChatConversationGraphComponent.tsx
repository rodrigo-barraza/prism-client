"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { LocateFixed, Maximize, Minus, Network, Plus, RotateCcw } from "lucide-react";
import { useMediaQuery } from "@rodrigo-barraza/components-library";
import { formatCostAdaptive } from "@rodrigo-barraza/utilities-library";
import type { GraphEdge, GraphNode, NodeCategory } from "@rodrigo-barraza/utilities-library/graph";
import useConversationGraphData from "../hooks/useConversationGraphData";
import type { ConversationGraphDataState } from "../hooks/useConversationGraphData";
import useGraphViewport from "../hooks/useGraphViewport";
import useGraphCollisionSettle from "../hooks/useGraphCollisionSettle";
import { useIsLightCanvas, usePhaseColor } from "../hooks/useConversationGraphEnvironment";
import type { ToolCallEvent } from "../types/types";
import StarfieldComponent from "./StarfieldComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import ConversationGraphNodeComponent, { type NodeLabelDetail } from "./ConversationGraphNodeComponent";
import ConversationGraphEdgeComponent, { type EdgeVariant } from "./ConversationGraphEdgeComponent";
import ConversationGraphMinimapComponent from "./ConversationGraphMinimapComponent";
import ConversationGraphDetailPanelComponent from "./ConversationGraphDetailPanelComponent";
import {
  READABLE_ZOOM,
  centerViewportOn,
  LABEL_ALLOWANCE,
  clampZoom,
  computeGraphBounds,
  edgeGeometry,
  fitViewport,
  frameViewportOn,
  graphToScreen,
  screenToGraph,
  visibleGraphRect,
  type EdgeGeometry,
  type GraphBounds,
  type GraphPoint,
} from "../utils/conversationGraphGeometry";
import {
  NODE_COLORS,
  NODE_LABELS,
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  buildGraphIndex,
  buildSubAgentDescendantCounts,
  computeHiddenNodeIds,
  computeNodeFlow,
  edgeKey,
  findNavigationTarget,
  isAgentNode,
  isFailedRequest,
  isPendingRequest,
  neighborIds,
  resolveLatestActivityNode,
  resolveLegendKey,
  resolveLiveTargetId,
  resolveNodeBaseColor,
  type NavigationKey,
} from "../utils/conversationGraphModel";
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

export {
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  PROACTIVE_PENDING_TURN_NODE_ID,
} from "../utils/conversationGraphModel";

/* ═══════════════════════════════════════════════════════════════════
   Props Interface
   ═══════════════════════════════════════════════════════════════════ */

export interface ChatConversationGraphComponentProps {
  conversationId: string | null;
  toolActivity?: ToolCallEvent[];
  isGenerating?: boolean;
  compact?: boolean;
  graphState?: ConversationGraphDataState;
}

const EMPTY_NODES: GraphNode[] = [];
const EMPTY_EDGES: GraphEdge[] = [];
/** The detail panel (340 px + gutter) covers the right of the canvas. */
const DETAIL_PANEL_INSET = 368;
const LIVE_FOLLOW_ZOOM = 0.8;
/** Below this width (the sidebar tab, a phone) a whole-graph fit shrinks
    nodes to dots — auto mode frames the latest activity instead. */
const NARROW_CANVAS_WIDTH = 640;
const NARROW_MINIMUM_ZOOM = 0.42;
const NARROW_LIVE_ZOOM = 0.6;
const DEFAULT_LIVE_COLOR = "oklch(0.82 0.14 195)";
const DRAG_THRESHOLD_PIXELS = 4;
const REVEAL_MARGIN = 16;
const LEGEND_ORDER: NodeCategory[] = ["project", "user", "session", "agent", "subagent", "turn", "request", "tool"];
const LEGEND_LABELS: Record<NodeCategory, string> = { ...NODE_LABELS, tool: "Request · tools" };
const NAVIGATION_KEYS = new Set<string>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** Width the open detail panel covers — none once it becomes a bottom
    sheet (the container query in the panel's stylesheet, below 640 px). */
function detailPanelInset(canvasWidth: number): number {
  return canvasWidth < 640 ? 0 : Math.min(DETAIL_PANEL_INSET, canvasWidth * 0.55);
}

function labelDetailForZoom(zoom: number, compact: boolean): NodeLabelDetail {
  const detail: NodeLabelDetail = zoom >= 0.72 ? 2 : zoom >= 0.42 ? 1 : 0;
  return compact ? (Math.min(detail, 1) as NodeLabelDetail) : detail;
}

/** Grid spacing that stays 18–48 screen px apart at any zoom. */
function gridStepForZoom(zoom: number): number {
  let step = 40;
  while (step * zoom < 18) step *= 2;
  while (step * zoom > 48 && step > 5) step /= 2;
  return step;
}

function stableHash(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = (Math.imul(hash, 33) ^ text.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}

function boundsContain(outer: GraphBounds, inner: GraphBounds): boolean {
  return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;
}

interface EdgeItem {
  key: string;
  domId: string;
  geometry: EdgeGeometry;
  sourceColor: string;
  targetColor: string;
  markerId: string;
  variant: EdgeVariant;
  isHighlighted: boolean;
  isEntering: boolean;
  isStatic: boolean;
  showParticles: boolean;
}

interface NodeDragState {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  hasMoved: boolean;
  isAdditive: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function ChatConversationGraphComponent({
  conversationId,
  isGenerating = false,
  compact = false,
  graphState: externalGraphState,
}: ChatConversationGraphComponentProps) {
  // When external graphState is provided, the internal hook is a no-op (null conversationId).
  // When standalone (no parent providing graphState), the hook manages its own SSE + data.
  const internalGraphState = useConversationGraphData(externalGraphState ? null : conversationId, isGenerating);
  const graphState = externalGraphState || internalGraphState;
  const {
    graphData,
    setGraphData,
    isLoading,
    enteringNodeIds,
    toolEmojiMap,
    nodesRef,
    draggedNodeIdRef,
    collisionOwnerRef,
    pinnedNodeIds,
    setPinnedNodeIds,
    restoreServerLayout,
  } = graphState;

  // Instance-scoped ids: the sidebar and the main view can both be mounted,
  // and duplicate gradient/marker ids resolve to whichever comes first.
  const instanceId = `cg${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const phaseColor = usePhaseColor();
  const isLightCanvas = useIsLightCanvas();
  const liveColor = phaseColor ?? DEFAULT_LIVE_COLOR;

  const [autoFollow, setAutoFollow] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [extraSelectedIds, setExtraSelectedIds] = useState<Set<string>>(() => new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [legendFocus, setLegendFocus] = useState<NodeCategory | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Per-conversation view state resets during render — React's pattern
  // for state derived from a prop, no effect round-trip.
  const [viewedConversationId, setViewedConversationId] = useState(conversationId);
  if (viewedConversationId !== conversationId) {
    setViewedConversationId(conversationId);
    setFocusedNodeId(null);
    setExtraSelectedIds(new Set());
    setHoveredNodeId(null);
    setCollapsedIds(new Set());
    setLegendFocus(null);
    setAutoFollow(true);
  }

  const handleUserCamera = useCallback(() => setAutoFollow(false), []);
  const {
    canvasRef,
    canvasElement,
    size,
    isMeasured,
    viewport,
    viewportRef,
    isPanning,
    animateTo,
    jumpTo,
    zoomBy,
    setZoom,
    cancelAnimation,
    handleBackgroundPointerDown,
    handleCameraPointerMove,
    handleCameraPointerUp,
  } = useGraphViewport({ reducedMotion, onUserCamera: handleUserCamera });

  const { startSettle, claimSettle } = useGraphCollisionSettle({
    nodesRef,
    draggedNodeIdRef,
    collisionOwnerRef,
    setGraphData,
  });

  // -- Derived graph ------------------------------------------------
  const nodes = graphData?.nodes ?? EMPTY_NODES;
  const edges = graphData?.edges ?? EMPTY_EDGES;
  const subAgentTree = graphData?.subAgentTree;
  const index = useMemo(() => buildGraphIndex({ nodes, edges }), [nodes, edges]);
  const rootAgentId = useMemo(() => nodes.find((node) => node.category === "agent")?.id ?? null, [nodes]);
  const descendantCounts = useMemo(
    () => buildSubAgentDescendantCounts(subAgentTree ?? [], rootAgentId),
    [rootAgentId, subAgentTree],
  );
  const hiddenNodeIds = useMemo(
    () => computeHiddenNodeIds({ nodes, subAgentTree: subAgentTree ?? [] }, index, collapsedIds),
    [nodes, subAgentTree, index, collapsedIds],
  );
  const visibleNodes = useMemo(
    () => (hiddenNodeIds.size > 0 ? nodes.filter((node) => !hiddenNodeIds.has(node.id)) : nodes),
    [nodes, hiddenNodeIds],
  );

  const liveTargetId = useMemo(() => resolveLiveTargetId(nodes, isGenerating), [nodes, isGenerating]);
  const liveFlow = useMemo(() => (liveTargetId ? computeNodeFlow(index, liveTargetId) : null), [index, liveTargetId]);
  const focusedNode = focusedNodeId ? index.nodeById.get(focusedNodeId) ?? null : null;
  const selectionFlow = useMemo(
    () => (focusedNode ? computeNodeFlow(index, focusedNode.id) : null),
    [index, focusedNode],
  );
  const selectedIds = useMemo(() => {
    const selected = new Set(extraSelectedIds);
    if (focusedNode) {
      selected.add(focusedNode.id);
      for (const nodeId of selectionFlow?.nodeIds ?? []) selected.add(nodeId);
    }
    return selected;
  }, [extraSelectedIds, focusedNode, selectionFlow]);
  const hasSelection = selectedIds.size > 0;

  const colorById = useMemo(() => {
    const colors = new Map<string, string>();
    for (const node of nodes) {
      const isPhaseTinted = !!phaseColor && (
        node.category === "session" || (isGenerating && isAgentNode(node) && !!liveFlow?.nodeIds.has(node.id))
      );
      colors.set(node.id, isPhaseTinted ? phaseColor : resolveNodeBaseColor(node));
    }
    return colors;
  }, [nodes, phaseColor, isGenerating, liveFlow]);
  const colorOf = useCallback((node: GraphNode) => colorById.get(node.id) ?? resolveNodeBaseColor(node), [colorById]);

  // One gradient + arrowhead per distinct colour in play.
  const paletteIndex = useMemo(() => {
    const palette = new Map<string, number>();
    for (const color of colorById.values()) if (!palette.has(color)) palette.set(color, palette.size);
    return palette;
  }, [colorById]);
  const orbGradientId = useCallback((color: string) => `${instanceId}-orb-${paletteIndex.get(color) ?? 0}`, [instanceId, paletteIndex]);
  const selectedMarkerId = `${instanceId}-arrow-selected`;
  const liveMarkerId = `${instanceId}-arrow-live`;

  const panelInset = !compact && focusedNode ? detailPanelInset(size.width) : 0;
  const labelDetail = labelDetailForZoom(viewport.zoom, compact);

  // -- Camera: fit the graph, or follow the live request -------------
  const cameraInputsRef = useRef({ visibleNodes, index, liveTargetId, isGenerating, panelInset });
  useEffect(() => {
    cameraInputsRef.current = { visibleNodes, index, liveTargetId, isGenerating, panelInset };
  });
  const fittedConversationRef = useRef<string | null>(null);
  // Re-fit on STRUCTURAL change only — never on a drag or settle frame.
  const fitSignature = [
    conversationId,
    visibleNodes.length,
    Math.round(size.width),
    Math.round(size.height),
    liveTargetId ?? "",
    panelInset,
    fitRequest,
  ].join("|");
  useEffect(() => {
    if (!autoFollow || !isMeasured) return;
    const inputs = cameraInputsRef.current;
    const bounds = computeGraphBounds(inputs.visibleNodes);
    if (!bounds) return;
    const padding = compact ? 18 : 56;
    const visibleWidth = size.width - inputs.panelInset;
    const isNarrow = size.width < NARROW_CANVAS_WIDTH;
    const fit = fitViewport(bounds, visibleWidth, size.height, padding);
    let target = fit;
    const liveTarget = inputs.liveTargetId ? inputs.index.nodeById.get(inputs.liveTargetId) : null;
    if (fit.zoom < READABLE_ZOOM && liveTarget && inputs.isGenerating) {
      // Follow the running request, newest node below centre.
      target = frameViewportOn(liveTarget, isNarrow ? NARROW_LIVE_ZOOM : LIVE_FOLLOW_ZOOM, visibleWidth, size.height, isNarrow ? 0.3 : 0.42, 0.6);
    } else if (isNarrow && fit.zoom < NARROW_MINIMUM_ZOOM) {
      const latestActivity = resolveLatestActivityNode(inputs.visibleNodes);
      if (latestActivity) target = frameViewportOn(latestActivity, NARROW_MINIMUM_ZOOM, visibleWidth, size.height, 0.3, 0.62);
    }
    const isFirstFrame = fittedConversationRef.current !== conversationId;
    fittedConversationRef.current = conversationId;
    if (isFirstFrame) jumpTo(target);
    else animateTo(target);
  }, [autoFollow, isMeasured, fitSignature, conversationId, compact, size.width, size.height, jumpTo, animateTo]);

  const requestFit = useCallback(() => {
    setAutoFollow(true);
    setFitRequest((request) => request + 1);
  }, []);

  /** Pans a node — and its label — into view when the panel or the
      canvas edge hides it; a node already in view stays put. */
  const revealNode = useCallback((node: GraphNode, inset: number) => {
    const current = viewportRef.current;
    const screenPoint = graphToScreen(current, node);
    const radius = node.radius * current.zoom;
    const isOutside = screenPoint.x - radius < REVEAL_MARGIN
      || screenPoint.x + radius + LABEL_ALLOWANCE * current.zoom > size.width - inset - REVEAL_MARGIN
      || screenPoint.y - radius < REVEAL_MARGIN
      || screenPoint.y + radius > size.height - REVEAL_MARGIN;
    if (isOutside) animateTo(frameViewportOn(node, current.zoom, size.width - inset, size.height, 0.4, 0.5));
  }, [animateTo, size.height, size.width, viewportRef]);

  /** Keeps keyboard focus on the canvas after the panel closes, without
      the focus ring a mouse user never asked for. */
  const focusCanvasQuietly = useCallback(() => {
    canvasElement?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [canvasElement]);

  // -- Selection ------------------------------------------------------
  const clearSelection = useCallback(() => {
    setFocusedNodeId(null);
    setExtraSelectedIds(new Set());
  }, []);

  const focusNode = useCallback((nodeId: string) => {
    const node = index.nodeById.get(nodeId);
    if (!node) return;
    setFocusedNodeId(nodeId);
    setExtraSelectedIds(new Set());
    setAutoFollow(false);
    setAnnouncement(`${NODE_LABELS[node.category]}: ${node.label}`);
    revealNode(node, compact ? 0 : detailPanelInset(size.width));
  }, [compact, index, revealNode, size.width]);

  const toggleExtraSelection = useCallback((nodeId: string) => {
    setExtraSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  }, []);

  const zoomToNode = useCallback((nodeId: string) => {
    const node = index.nodeById.get(nodeId);
    if (!node) return;
    setAutoFollow(false);
    const zoom = clampZoom(Math.max(viewportRef.current.zoom * 1.6, 1.1));
    animateTo(centerViewportOn(node, zoom, size.width, size.height, panelInset));
  }, [animateTo, index, panelInset, size.height, size.width, viewportRef]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  }, []);

  // -- Pointer: node drag / click, background pan / click -------------
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const backgroundPressRef = useRef<{ pointerId: number; clientX: number; clientY: number; hasMoved: boolean } | null>(null);

  const canvasPoint = useCallback((clientX: number, clientY: number): GraphPoint => {
    const rect = canvasElement?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, [canvasElement]);

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<SVGGElement>, nodeId: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    const node = index.nodeById.get(nodeId);
    if (!node) return;
    cancelAnimation();
    // Capture on the node itself: click/dblclick then still target it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const graphPoint = screenToGraph(viewportRef.current, canvasPoint(event.clientX, event.clientY));
    nodeDragRef.current = {
      nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: graphPoint.x - node.x,
      offsetY: graphPoint.y - node.y,
      hasMoved: false,
      isAdditive: event.shiftKey || event.ctrlKey || event.metaKey,
    };
  }, [canvasPoint, cancelAnimation, index, viewportRef]);

  const handleSvgPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest?.("[data-node-identifier]")) return;
    backgroundPressRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, hasMoved: false };
    handleBackgroundPointerDown(event);
  }, [handleBackgroundPointerDown]);

  const handleSvgPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = nodeDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (!drag.hasMoved) {
        if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < DRAG_THRESHOLD_PIXELS) return;
        drag.hasMoved = true;
        draggedNodeIdRef.current = drag.nodeId;
        setDraggingNodeId(drag.nodeId);
        claimSettle();
      }
      const graphPoint = screenToGraph(viewportRef.current, canvasPoint(event.clientX, event.clientY));
      const nextX = graphPoint.x - drag.offsetX;
      const nextY = graphPoint.y - drag.offsetY;
      setGraphData((previousGraphData) => {
        if (!previousGraphData) return previousGraphData;
        return {
          ...previousGraphData,
          nodes: previousGraphData.nodes.map((node) => (node.id === drag.nodeId ? { ...node, x: nextX, y: nextY } : node)),
        };
      });
      return;
    }
    const press = backgroundPressRef.current;
    if (handleCameraPointerMove(event) && press && press.pointerId === event.pointerId && !press.hasMoved) {
      press.hasMoved = Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) >= DRAG_THRESHOLD_PIXELS;
    }
  }, [canvasPoint, claimSettle, draggedNodeIdRef, handleCameraPointerMove, setGraphData, viewportRef]);

  const handleSvgPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = nodeDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      nodeDragRef.current = null;
      if (drag.hasMoved) {
        draggedNodeIdRef.current = null;
        setDraggingNodeId(null);
        setPinnedNodeIds((previous) => new Set(previous).add(drag.nodeId));
        startSettle(20);
        return;
      }
      // A cancelled press (the browser took the gesture) selects nothing.
      if (event.type !== "pointerup") return;
      if (drag.isAdditive) toggleExtraSelection(drag.nodeId);
      else focusNode(drag.nodeId);
      return;
    }
    const press = backgroundPressRef.current;
    handleCameraPointerUp(event);
    if (press && press.pointerId === event.pointerId) {
      backgroundPressRef.current = null;
      if (!press.hasMoved && event.type === "pointerup") clearSelection();
    }
  }, [clearSelection, draggedNodeIdRef, focusNode, handleCameraPointerUp, setPinnedNodeIds, startSettle, toggleExtraSelection]);

  const handleSvgDoubleClick = useCallback((event: ReactMouseEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest?.("[data-node-identifier]")) return;
    setAutoFollow(false);
    zoomBy(1.6, canvasPoint(event.clientX, event.clientY));
  }, [canvasPoint, zoomBy]);

  // -- Keyboard -------------------------------------------------------
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    // The details panel scrolls with the arrow keys; toolbar and legend
    // buttons pass shortcuts through to the canvas.
    const fromPanel = event.target !== event.currentTarget
      && !!(event.target as Element).closest?.('[data-graph-overlay="details"]');
    if (event.key === "Escape") {
      if (focusedNodeId || extraSelectedIds.size > 0) {
        event.preventDefault();
        clearSelection();
        focusCanvasQuietly();
      }
      return;
    }
    if (fromPanel || event.altKey || event.ctrlKey || event.metaKey) return;

    if (NAVIGATION_KEYS.has(event.key)) {
      event.preventDefault();
      if (visibleNodes.length === 0) return;
      const current = focusedNodeId && visibleNodes.some((node) => node.id === focusedNodeId) ? focusedNodeId : null;
      const target = current
        ? findNavigationTarget(visibleNodes, index, current, event.key as NavigationKey)
        : visibleNodes.find((node) => node.category === "session")
          ?? visibleNodes.find((node) => node.category === "agent")
          ?? visibleNodes[0];
      if (target) focusNode(target.id);
      return;
    }
    switch (event.key) {
      case "f":
      case "F":
        event.preventDefault();
        requestFit();
        break;
      case "+":
      case "=":
        event.preventDefault();
        setAutoFollow(false);
        zoomBy(1.25);
        break;
      case "-":
      case "_":
        event.preventDefault();
        setAutoFollow(false);
        zoomBy(0.8);
        break;
      case "0":
        event.preventDefault();
        setAutoFollow(false);
        setZoom(1);
        break;
      default:
        break;
    }
  }, [clearSelection, extraSelectedIds.size, focusCanvasQuietly, focusNode, focusedNodeId, index, requestFit, setZoom, visibleNodes, zoomBy]);

  // -- Render lists ---------------------------------------------------
  const edgeItems = useMemo<EdgeItem[]>(() => {
    const items: EdgeItem[] = [];
    for (const edge of edges) {
      if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) continue;
      const source = index.nodeById.get(edge.source);
      const target = index.nodeById.get(edge.target);
      if (!source || !target) continue;
      const key = edgeKey(edge);
      let variant: EdgeVariant = "default";
      if (selectionFlow?.edgeKeys.has(key)) variant = "selected";
      else if (liveFlow?.edgeKeys.has(key)) variant = "live";
      else if (legendFocus) {
        variant = resolveLegendKey(source) === legendFocus || resolveLegendKey(target) === legendFocus ? "default" : "muted";
      } else if (hasSelection) variant = "muted";
      const targetColor = colorOf(target);
      items.push({
        key,
        domId: `${instanceId}-e${stableHash(key)}`,
        geometry: edgeGeometry(source, target),
        sourceColor: colorOf(source),
        targetColor,
        markerId: variant === "selected"
          ? selectedMarkerId
          : variant === "live"
            ? liveMarkerId
            : `${instanceId}-arrow-${paletteIndex.get(targetColor) ?? 0}`,
        variant,
        isHighlighted: hoveredNodeId === source.id || hoveredNodeId === target.id
          || extraSelectedIds.has(source.id) || extraSelectedIds.has(target.id),
        isEntering: !reducedMotion && (enteringNodeIds.has(source.id) || enteringNodeIds.has(target.id)),
        isStatic: draggingNodeId === source.id || draggingNodeId === target.id,
        showParticles: variant === "live" && !reducedMotion,
      });
    }
    return items;
  }, [edges, hiddenNodeIds, index, selectionFlow, liveFlow, legendFocus, hasSelection, colorOf, instanceId, selectedMarkerId, liveMarkerId, paletteIndex, hoveredNodeId, extraSelectedIds, reducedMotion, enteringNodeIds, draggingNodeId]);

  const summary = useMemo(() => {
    let requestCount = 0;
    let failedCount = 0;
    let totalCost = 0;
    for (const node of nodes) {
      if (node.category !== "request" || node.id === PROACTIVE_PENDING_REQUEST_NODE_ID) continue;
      requestCount += 1;
      if (isFailedRequest(node)) failedCount += 1;
      totalCost += Number(node.metadata?.estimatedCost) || 0;
    }
    return { requestCount, failedCount, totalCost };
  }, [nodes]);

  const legendEntries = useMemo(() => {
    const counts = new Map<NodeCategory, number>();
    for (const node of nodes) {
      if (node.id === PROACTIVE_PENDING_REQUEST_NODE_ID) continue;
      const legendKey = resolveLegendKey(node);
      counts.set(legendKey, (counts.get(legendKey) ?? 0) + 1);
    }
    return LEGEND_ORDER.filter((legendKey) => counts.has(legendKey)).map((legendKey) => ({
      legendKey,
      count: counts.get(legendKey)!,
      color: NODE_COLORS[legendKey],
    }));
  }, [nodes]);

  const graphBounds = useMemo(() => computeGraphBounds(visibleNodes), [visibleNodes]);
  const visibleRect = visibleGraphRect(viewport, size.width, size.height);
  const showsMinimap = !compact && !!graphBounds && size.width > 560 && !boundsContain(visibleRect, graphBounds);
  const gridStep = gridStepForZoom(viewport.zoom);
  const isDraggingAnything = draggingNodeId !== null || isPanning;

  const handleMinimapNavigate = useCallback((graphPoint: GraphPoint, animate: boolean) => {
    setAutoFollow(false);
    const target = centerViewportOn(graphPoint, viewportRef.current.zoom, size.width, size.height, panelInset);
    if (animate) animateTo(target, 260);
    else jumpTo(target);
  }, [animateTo, jumpTo, panelInset, size.height, size.width, viewportRef]);

  const canvasStyle = { "--graph-live-color": liveColor } as CSSProperties;
  const canvasClassName = [
    styles['graph-canvas'],
    isLightCanvas ? styles['graph-canvas-light'] : "",
    isDraggingAnything ? styles['graph-canvas-grabbing'] : "",
  ].join(" ");

  // -- Empty state when no conversationId -----------------------------
  if (!conversationId) {
    return (
      <div className={styles['graph-root']}>
        <div className={canvasClassName} style={canvasStyle}>
          {!isLightCanvas && <StarfieldComponent className={styles['starfield']} panX={0} panY={0} />}
          <div className={styles['graph-empty-prompt']}>
            <Network size={compact ? 36 : 48} className={styles['graph-empty-prompt-icon']} />
            <div className={styles['graph-empty-prompt-title']}>No active conversation</div>
            <div className={styles['graph-empty-prompt-subtitle']}>
              Start or load a conversation to view its node graph.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles['graph-root']}>
      <div
        ref={canvasRef}
        className={canvasClassName}
        style={canvasStyle}
        tabIndex={0}
        role="application"
        aria-roledescription="conversation graph"
        aria-label="Conversation graph. Arrow keys move between nodes, F fits the view, plus and minus zoom, Escape clears the selection."
        onKeyDown={handleKeyDown}
      >
        {!isLightCanvas && (
          <StarfieldComponent className={styles['starfield']} panX={viewport.x} panY={viewport.y} />
        )}

        {graphData && (
          <svg
            className={styles['graph-svg']}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerUp}
            onDoubleClick={handleSvgDoubleClick}
          >
            <defs>
              <pattern
                id={`${instanceId}-grid`}
                width={gridStep}
                height={gridStep}
                patternUnits="userSpaceOnUse"
                patternTransform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
              >
                <circle cx={gridStep / 2} cy={gridStep / 2} r={1.1 / viewport.zoom} className={styles['graph-grid-dot']} />
              </pattern>
              {[...paletteIndex].map(([color, paletteSlot]) => (
                <radialGradient key={`orb-${paletteSlot}`} id={`${instanceId}-orb-${paletteSlot}`} cx="36%" cy="30%" r="78%">
                  <stop offset="0" style={{ stopColor: `color-mix(in oklch, ${color} 55%, white)` }} />
                  <stop offset="0.55" style={{ stopColor: color }} />
                  <stop offset="1" style={{ stopColor: `color-mix(in oklch, ${color} 70%, black)` }} />
                </radialGradient>
              ))}
              {[...paletteIndex].map(([color, paletteSlot]) => (
                <marker key={`arrow-${paletteSlot}`} id={`${instanceId}-arrow-${paletteSlot}`} viewBox="0 0 8 8" refX={7.5} refY={4} markerWidth={8} markerHeight={8} markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M 0 0.8 L 8 4 L 0 7.2 z" fill={color} />
                </marker>
              ))}
              <marker id={selectedMarkerId} viewBox="0 0 8 8" refX={7.5} refY={4} markerWidth={10} markerHeight={10} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M 0 0.8 L 8 4 L 0 7.2 z" className={styles['graph-marker-selected']} />
              </marker>
              <marker id={liveMarkerId} viewBox="0 0 8 8" refX={7.5} refY={4} markerWidth={10} markerHeight={10} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M 0 0.8 L 8 4 L 0 7.2 z" className={styles['graph-marker-live']} />
              </marker>
            </defs>

            <rect className={styles['graph-grid']} width="100%" height="100%" fill={`url(#${instanceId}-grid)`} />

            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
              <g>
                {edgeItems.map((item) => (
                  <ConversationGraphEdgeComponent
                    key={item.key}
                    domId={item.domId}
                    path={item.geometry.path}
                    startX={item.geometry.start.x}
                    startY={item.geometry.start.y}
                    endX={item.geometry.end.x}
                    endY={item.geometry.end.y}
                    sourceColor={item.sourceColor}
                    targetColor={item.targetColor}
                    markerId={item.markerId}
                    variant={item.variant}
                    isHighlighted={item.isHighlighted}
                    isEntering={item.isEntering}
                    isStatic={item.isStatic}
                    showParticles={item.showParticles}
                  />
                ))}
              </g>
              <g>
                {visibleNodes.map((node) => {
                  const color = colorOf(node);
                  const isLive = node.id === liveTargetId;
                  return (
                    <ConversationGraphNodeComponent
                      key={node.id}
                      node={node}
                      color={isLive ? liveColor : color}
                      orbGradientId={orbGradientId(color)}
                      labelDetail={labelDetail}
                      isSelected={selectedIds.has(node.id)}
                      isFocused={node.id === focusedNodeId}
                      isDimmed={legendFocus ? resolveLegendKey(node) !== legendFocus : hasSelection && !selectedIds.has(node.id) && !isLive}
                      isLive={isLive}
                      isInLiveFlow={!!liveFlow?.nodeIds.has(node.id)}
                      isPending={isPendingRequest(node) || node.id === PROACTIVE_PENDING_REQUEST_NODE_ID}
                      isFailed={isFailedRequest(node)}
                      isEntering={enteringNodeIds.has(node.id)}
                      isDragging={node.id === draggingNodeId}
                      isPinned={pinnedNodeIds.has(node.id)}
                      descendantCount={descendantCounts.get(node.id) ?? 0}
                      isCollapsed={collapsedIds.has(node.id)}
                      reducedMotion={reducedMotion}
                      toolEmojiMap={toolEmojiMap}
                      onNodePointerDown={handleNodePointerDown}
                      onNodeDoubleClick={zoomToNode}
                      onToggleCollapse={toggleCollapse}
                      onHoverChange={setHoveredNodeId}
                    />
                  );
                })}
              </g>
            </g>
          </svg>
        )}

        {!graphData && (
          <div className={styles['graph-empty-prompt']}>
            {isLoading
              ? <PanelLoadingSpinner />
              : <>
                  <Network size={compact ? 32 : 40} className={styles['graph-empty-prompt-icon']} />
                  <div className={styles['graph-empty-prompt-title']}>No graph data yet</div>
                  {!compact && (
                    <div className={styles['graph-empty-prompt-subtitle']}>
                      Nodes appear here as soon as the conversation makes its first request.
                    </div>
                  )}
                </>}
          </div>
        )}

        {graphData && !compact && summary.requestCount > 0 && (
          <div className={styles['graph-status']} data-graph-overlay="status">
            {isGenerating && (
              <span className={styles['graph-status-live']}>
                <span className={styles['graph-status-live-dot']} />
                Live
              </span>
            )}
            <span>{summary.requestCount} request{summary.requestCount === 1 ? "" : "s"}</span>
            {summary.totalCost > 0 && <span>{formatCostAdaptive(summary.totalCost)}</span>}
            {summary.failedCount > 0 && <span className={styles['graph-status-failed']}>{summary.failedCount} failed</span>}
          </div>
        )}

        {graphData && !compact && legendEntries.length > 0 && (
          <div className={styles['graph-legend']} data-graph-overlay="legend" role="group" aria-label="Legend — hover a category to highlight it">
            {legendEntries.map(({ legendKey, count, color }) => (
              <button
                key={legendKey}
                type="button"
                className={`${styles['graph-legend-item']} ${legendFocus === legendKey ? styles['graph-legend-item-active'] : ""}`}
                onPointerEnter={() => setLegendFocus(legendKey)}
                onPointerLeave={() => setLegendFocus(null)}
                onFocus={() => setLegendFocus(legendKey)}
                onBlur={() => setLegendFocus(null)}
                aria-pressed={legendFocus === legendKey}
              >
                <span className={styles['graph-legend-dot']} style={{ background: color }} />
                {LEGEND_LABELS[legendKey]}
                <span className={styles['graph-legend-count']}>{count}</span>
              </button>
            ))}
          </div>
        )}

        {graphData && (
          <div className={`${styles['graph-controls']} ${compact ? styles['graph-controls-compact'] : ""}`} data-graph-overlay="controls">
            {showsMinimap && (
              <ConversationGraphMinimapComponent
                nodes={visibleNodes}
                edges={edges}
                nodeById={index.nodeById}
                colorOf={colorOf}
                graphBounds={graphBounds!}
                visibleRect={visibleRect}
                onNavigate={handleMinimapNavigate}
              />
            )}
            <div className={styles['graph-toolbar']} role="toolbar" aria-label="Graph view">
              {isGenerating && !autoFollow && (
                <button type="button" className={`${styles['graph-toolbar-button']} ${styles['graph-toolbar-follow']}`} onClick={requestFit} title="Follow the live request">
                  <LocateFixed size={13} />
                  {!compact && <span>Follow</span>}
                </button>
              )}
              {!compact && (
                <>
                  <button type="button" className={styles['graph-toolbar-button']} onClick={() => { setAutoFollow(false); zoomBy(0.8); }} title="Zoom out (−)" aria-label="Zoom out">
                    <Minus size={13} />
                  </button>
                  <button type="button" className={`${styles['graph-toolbar-button']} ${styles['graph-zoom-readout']}`} onClick={() => { setAutoFollow(false); setZoom(1); }} title="Reset to 100% (0)" aria-label={`Zoom ${Math.round(viewport.zoom * 100)} percent, reset to 100`}>
                    {Math.round(viewport.zoom * 100)}%
                  </button>
                  <button type="button" className={styles['graph-toolbar-button']} onClick={() => { setAutoFollow(false); zoomBy(1.25); }} title="Zoom in (+)" aria-label="Zoom in">
                    <Plus size={13} />
                  </button>
                  <span className={styles['graph-toolbar-divider']} aria-hidden="true" />
                </>
              )}
              <button
                type="button"
                className={`${styles['graph-toolbar-button']} ${autoFollow ? styles['graph-toolbar-button-active'] : ""}`}
                onClick={requestFit}
                title="Fit to view (F)"
                aria-label="Fit to view"
                aria-pressed={autoFollow}
              >
                <Maximize size={13} />
              </button>
              {!compact && pinnedNodeIds.size > 0 && (
                <button type="button" className={styles['graph-toolbar-button']} onClick={restoreServerLayout} title="Put dragged nodes back" aria-label="Reset layout">
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {!compact && focusedNode && (
          <div data-graph-overlay="details">
            <ConversationGraphDetailPanelComponent
              key={focusedNode.id}
              node={focusedNode}
              color={colorOf(focusedNode)}
              connectionCount={neighborIds(index, focusedNode.id).size}
              toolEmojiMap={toolEmojiMap}
              onClose={() => { clearSelection(); focusCanvasQuietly(); }}
              onCenter={() => animateTo(centerViewportOn(focusedNode, viewportRef.current.zoom, size.width, size.height, panelInset))}
            />
          </div>
        )}

        <div className={styles['visually-hidden']} aria-live="polite">{announcement}</div>
      </div>
    </div>
  );
}
