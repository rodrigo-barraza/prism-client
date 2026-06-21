"use client";

import {
  WorkflowNode as IWorkflowNode,
  WorkflowConnection,
} from "../types/types";
import { useState, useRef, useCallback, useEffect } from "react";
import { X, Eye, EyeOff, PanelLeftClose, PanelLeft } from "lucide-react";
import WorkflowNode from "./WorkflowNodeComponent";
import StarfieldComponent from "./StarfieldComponent";
import {
  MODALITY_COLORS,
  CONFIG_AREA_HEIGHT,
  getBaseModality,
  getAssetContentHeight,
  getNodeWidth,
  getNodeHeight,
  getPortPosition,
  edgePath,
} from "./WorkflowNodeConstantsComponent";
import styles from "./WorkflowCanvasComponent.module.css";
import { LS_WORKFLOW_EXPANDED_NODES, LS_WORKFLOW_VIEWS } from "../constants";

const COLLISION_PADDING = 20; // min gap between nodes

export default function WorkflowCanvas({
  nodes,
  connections,
  onUpdateNodePosition,
  onDeleteNode,
  onAddConnection,
  onDeleteConnection,
  onUpdateNodeContent,
  onUpdateNodeConfig,
  onUpdateFileInput,
  onDuplicateNode,
  nodeStatuses = {},
  nodeResults = {},
  selectedNodeId,
  onSelectNode,
  activeWorkflowId,
  readOnly = false,
  isLoadingWorkflow = false,
  sidebarVisible = true,
  onToggleSidebar,
}: {
  nodes: IWorkflowNode[];
  connections: WorkflowConnection[];
  onUpdateNodePosition: (nodeId: string, pos: { x: number; y: number }) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddConnection: (conn: {
    sourceNodeId: string;
    sourceModality: string;
    targetNodeId: string;
    targetModality: string;
  }) => void;
  onDeleteConnection: (connId: string) => void;
  onUpdateNodeContent?: (nodeId: string, content: string) => void;
  onUpdateNodeConfig?: (nodeId: string, key: string, value: unknown) => void;
  onUpdateFileInput?: (
    nodeId: string,
    content: string | ArrayBuffer | null,
    mimeType: string | null,
  ) => void;
  onDuplicateNode?: (node: IWorkflowNode) => void;
  nodeStatuses?: Record<string, string>;
  nodeResults?: Record<string, unknown>;
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  activeWorkflowId?: string | null;
  readOnly?: boolean;
  isLoadingWorkflow?: boolean;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<IWorkflowNode | null>(null);
  const [dragging, setDragging] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [connecting, setConnecting] = useState<{
    sourceNodeId: string;
    sourceModality: string;
    sourceIndex: number;
  } | null>(null);
  const [connectingMouse, setConnectingMouse] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const stored = localStorage.getItem(LS_WORKFLOW_EXPANDED_NODES);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set<string>();
    }
  });
  // -- View persistence helpers --
  const getStoredViews = () => {
    try {
      return JSON.parse(localStorage.getItem(LS_WORKFLOW_VIEWS) || "{}");
    } catch {
      return {};
    }
  };

  const [pan, setPan] = useState(() => {
    if (!activeWorkflowId || typeof window === "undefined")
      return { x: 0, y: 0 };
    const saved = getStoredViews()[activeWorkflowId!];
    return saved ? { x: saved.x, y: saved.y } : { x: 0, y: 0 };
  });
  const [zoom, setZoom] = useState(() => {
    if (!activeWorkflowId || typeof window === "undefined") return 1;
    const saved = getStoredViews()[activeWorkflowId!];
    return saved ? saved.zoom : 1;
  });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number }>(
    { x: 0, y: 0, panX: 0, panY: 0 },
  );
  const [hoveredPort, setHoveredPort] = useState<{
    nodeId: string;
    type: "input" | "output";
    modality: string;
  } | null>(null);
  const prevWorkflowIdRef = useRef<string | undefined>(activeWorkflowId);

  // Save current view whenever pan/zoom changes
  useEffect(() => {
    if (!activeWorkflowId) return;
    const views = getStoredViews();
    views[activeWorkflowId] = { x: pan.x, y: pan.y, zoom };
    try {
      localStorage.setItem(LS_WORKFLOW_VIEWS, JSON.stringify(views));
    } catch {
      /* ignore */
    }
  }, [pan, zoom, activeWorkflowId]);

  // Restore view when switching workflows

  useEffect(() => {
    if (activeWorkflowId !== prevWorkflowIdRef.current) {
      const saved = getStoredViews()[activeWorkflowId!];
      setPan(saved ? { x: saved.x, y: saved.y } : { x: 0, y: 0 }); // sync from localStorage
      setZoom(saved ? saved.zoom : 1); // sync from localStorage
      prevWorkflowIdRef.current = activeWorkflowId;
    }
  }, [activeWorkflowId]);

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3;

  // Convert screen coordinates to SVG coordinates
  const screenToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: clientX, y: clientY };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  // Node dragging (mouse)
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onSelectNode?.(nodeId);
      const node = nodes.find((node: IWorkflowNode) => node.id === nodeId);
      if (!node) return;
      const svgPos = screenToSvg(e.clientX, e.clientY);
      setDragging({
        nodeId,
        offsetX: svgPos.x - (node.position?.x || 0),
        offsetY: svgPos.y - (node.position?.y || 0),
      });
    },
    [nodes, screenToSvg, onSelectNode],
  );

  // -- Touch support --
  const touchRef = useRef<{
    type: string | null;
    lastDist: number;
    nodeId: string | null;
  }>({ type: null, lastDist: 0, nodeId: null });

  const getTouchDist = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches: TouchList, rect: DOMRect) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
    y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
  });

  // Node dragging (touch)
  const handleNodeTouchStart = useCallback(
    (e: React.TouchEvent, nodeId: string) => {
      if (e.touches.length !== 1) return;
      e.stopPropagation();
      e.preventDefault();
      onSelectNode?.(nodeId);
      const node = nodes.find((node: IWorkflowNode) => node.id === nodeId);
      if (!node) return;
      const touch = e.touches[0];
      const svgPos = screenToSvg(touch.clientX, touch.clientY);
      touchRef.current = { type: "drag", nodeId, lastDist: 0 };
      setDragging({
        nodeId,
        offsetX: svgPos.x - (node.position?.x || 0),
        offsetY: svgPos.y - (node.position?.y || 0),
      });
    },
    [nodes, screenToSvg, onSelectNode],
  );

  // Panning — starts when clicking on empty canvas background
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const element = e.target as HTMLElement;
      const isContainerOrSvg =
        element === containerRef.current ||
        element === (svgRef.current as unknown as HTMLElement);
      const isGridBg =
        element.classList?.contains?.(styles['starfield']) ||
        element.tagName === "CANVAS";
      const isInsideInteractive = element.closest?.(
        "[data-workflow-node], [data-workflow-connection]",
      );
      if (
        isContainerOrSvg ||
        isGridBg ||
        (!isInsideInteractive && containerRef.current?.contains(element))
      ) {
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          panX: pan.x,
          panY: pan.y,
        };
      }
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging) {
        const svgPos = screenToSvg(e.clientX, e.clientY);
        onUpdateNodePosition(dragging.nodeId, {
          x: svgPos.x - dragging.offsetX,
          y: svgPos.y - dragging.offsetY,
        });
      }
      if (connecting) {
        const svgPos = screenToSvg(e.clientX, e.clientY);
        setConnectingMouse(svgPos);
      }
      if (isPanning) {
        setPan({
          x: panStart.current.panX + (e.clientX - panStart.current.x),
          y: panStart.current.panY + (e.clientY - panStart.current.y),
        });
      }
    },
    [dragging, connecting, isPanning, screenToSvg, onUpdateNodePosition],
  );

  // -- Collision repulsion via requestAnimationFrame (only while dragging) --
  // Keep refs to the latest values so the RAF loop always sees fresh state.
  const nodesRef = useRef<IWorkflowNode[]>(nodes);
  const onUpdatePosRef = useRef(onUpdateNodePosition);
  const draggingRef = useRef(dragging);
  const expandedInputsRef = useRef<Set<string>>(expandedInputs);
  const rafRef = useRef<number | null>(null);
  const settleCountRef = useRef<number>(0);
  const collisionTickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    onUpdatePosRef.current = onUpdateNodePosition;
  }, [onUpdateNodePosition]);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);
  useEffect(() => {
    expandedInputsRef.current = expandedInputs;
  }, [expandedInputs]);

  // Define the tick function once via ref so it can self-schedule
  useEffect(() => {
    const PUSH_FACTOR = 0.35;
    const MIN_PUSH = 0.5;

    // Use calculated dimensions instead of getBBox (foreignObject content isn't measured reliably)
    const getNodeBox = (node: IWorkflowNode) => {
      const expanded = expandedInputsRef.current;
      const isExpanded =
        node.nodeType === "viewer"
          ? !expanded.has(node.id)
          : expanded.has(node.id);
      return {
        w: getNodeWidth(node),
        h: getNodeHeight(node, isExpanded),
      };
    };

    collisionTickRef.current = () => {
      const currentNodes = nodesRef.current;
      const dragId =
        (draggingRef.current as { nodeId?: string })?.nodeId || null;
      const updates: Record<string, { x: number; y: number }> = {};

      for (let agent = 0; agent < currentNodes.length; agent++) {
        for (let current = agent + 1; current < currentNodes.length; current++) {
          const nA = currentNodes[agent];
          const nB = currentNodes[current];
          const boxA = getNodeBox(nA);
          const boxB = getNodeBox(nB);

          const aCx = (nA.position?.x || 0) + boxA.w / 2;
          const aCy = (nA.position?.y || 0) + boxA.h / 2;
          const bCx = (nB.position?.x || 0) + boxB.w / 2;
          const bCy = (nB.position?.y || 0) + boxB.h / 2;

          const overlapX =
            boxA.w / 2 + boxB.w / 2 + COLLISION_PADDING - Math.abs(aCx - bCx);
          const overlapY =
            boxA.h / 2 + boxB.h / 2 + COLLISION_PADDING - Math.abs(aCy - bCy);

          if (overlapX > MIN_PUSH && overlapY > MIN_PUSH) {
            const aIsDragged = nA.id === dragId;
            const bIsDragged = nB.id === dragId;

            if (overlapX < overlapY) {
              const push = overlapX * PUSH_FACTOR;
              const direction = bCx >= aCx ? 1 : -1;
              if (aIsDragged) {
                if (!updates[nB.id])
                  updates[nB.id] = { ...(nB.position || { x: 0, y: 0 }) };
                updates[nB.id].x += direction * push;
              } else if (bIsDragged) {
                if (!updates[nA.id])
                  updates[nA.id] = { ...(nA.position || { x: 0, y: 0 }) };
                updates[nA.id].x -= direction * push;
              } else {
                const half = push / 2;
                if (!updates[nA.id])
                  updates[nA.id] = { ...(nA.position || { x: 0, y: 0 }) };
                if (!updates[nB.id])
                  updates[nB.id] = { ...(nB.position || { x: 0, y: 0 }) };
                updates[nA.id].x -= direction * half;
                updates[nB.id].x += direction * half;
              }
            } else {
              const push = overlapY * PUSH_FACTOR;
              const direction = bCy >= aCy ? 1 : -1;
              if (aIsDragged) {
                if (!updates[nB.id])
                  updates[nB.id] = { ...(nB.position || { x: 0, y: 0 }) };
                updates[nB.id].y += direction * push;
              } else if (bIsDragged) {
                if (!updates[nA.id])
                  updates[nA.id] = { ...(nA.position || { x: 0, y: 0 }) };
                updates[nA.id].y -= direction * push;
              } else {
                const half = push / 2;
                if (!updates[nA.id])
                  updates[nA.id] = { ...(nA.position || { x: 0, y: 0 }) };
                if (!updates[nB.id])
                  updates[nB.id] = { ...(nB.position || { x: 0, y: 0 }) };
                updates[nA.id].y -= direction * half;
                updates[nB.id].y += direction * half;
              }
            }
          }
        }
      }

      const hasUpdates = Object.keys(updates).length > 0;
      for (const [id, pos] of Object.entries(updates)) {
        onUpdatePosRef.current(id, pos);
      }

      // Keep running while dragging, or until nodes fully settle
      if (draggingRef.current) {
        settleCountRef.current = 10; // buffer frames after drag ends
        rafRef.current = requestAnimationFrame(
          collisionTickRef.current as FrameRequestCallback,
        );
      } else if (hasUpdates) {
        // Still have overlaps — keep going, reset buffer
        settleCountRef.current = 10;
        rafRef.current = requestAnimationFrame(
          collisionTickRef.current as FrameRequestCallback,
        );
      } else if (settleCountRef.current > 0) {
        // No overlaps this frame, but run a few more to catch settling
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

  // Helper: kick off the collision loop (used by drag and toggle-all)
  const startCollisionLoop = useCallback((frames = 30) => {
    if (!rafRef.current && collisionTickRef.current) {
      settleCountRef.current = frames;
      rafRef.current = requestAnimationFrame(
        collisionTickRef.current as FrameRequestCallback,
      );
    }
  }, []);

  // Start collision loop when dragging begins
  useEffect(() => {
    if (dragging) startCollisionLoop(30);
  }, [dragging, startCollisionLoop]);

  // Resolve overlaps when a different workflow is loaded
  useEffect(() => {
    if (nodes.length > 0 && activeWorkflowId) {
      // Wait one frame for positions to settle, then run collision resolution
      setTimeout(() => startCollisionLoop(60), 80);
    }
  }, [activeWorkflowId, nodes.length, startCollisionLoop]);

  const handleMouseUp = useCallback(() => {
    if (dragging) setDragging(null);
    if (isPanning) setIsPanning(false);
    if (connecting && !hoveredPort) {
      setConnecting(null);
      setConnectingMouse(null);
    }
  }, [dragging, isPanning, connecting, hoveredPort]);

  // Zoom — scroll wheel zooms toward cursor
  // Use a ref so rapid wheel events always read the latest zoom (avoids stale closures)
  const zoomRef = useRef<number>(zoom);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentZoom = zoomRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * delta));
    const ratio = newZoom / currentZoom;

    // Update ref synchronously so next wheel event sees the latest value
    zoomRef.current = newZoom;

    setPan((prev) => ({
      x: mouseX - ratio * (mouseX - prev.x),
      y: mouseY - ratio * (mouseY - prev.y),
    }));
    setZoom(newZoom);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    const container = containerRef.current;
    container?.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    // -- Touch handlers --
    const handleTouchStart = (e: TouchEvent) => {
      if (!container?.contains(e.target as Node)) return;

      if (e.touches.length === 2) {
        // Pinch-zoom start
        e.preventDefault();
        touchRef.current = {
          type: "pinch",
          lastDist: getTouchDist(e.touches),
          nodeId: null,
        };
        return;
      }

      if (e.touches.length === 1 && touchRef.current.type !== "drag") {
        // Canvas pan start (only if not already dragging a node)
        const touch = e.touches[0];
        const element = e.target as HTMLElement;
        const isInsideNode = element.closest?.("[data-workflow-node]");
        if (!isInsideNode) {
          e.preventDefault();
          touchRef.current = { type: "pan", nodeId: null, lastDist: 0 };
          setIsPanning(true);
          panStart.current = {
            x: touch.clientX,
            y: touch.clientY,
            panX: pan.x,
            panY: pan.y,
          };
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchState = touchRef.current;

      if (touchState.type === "pinch" && e.touches.length === 2) {
        e.preventDefault();
        const rect = container?.getBoundingClientRect();
        if (!rect) return;
        const newDist = getTouchDist(e.touches);
        const center = getTouchCenter(e.touches, rect);
        const scale = newDist / touchState.lastDist;
        const currentZoom = zoomRef.current;
        const newZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, currentZoom * scale),
        );
        const ratio = newZoom / currentZoom;
        zoomRef.current = newZoom;
        setPan((prev) => ({
          x: center.x - ratio * (center.x - prev.x),
          y: center.y - ratio * (center.y - prev.y),
        }));
        setZoom(newZoom);
        touchRef.current.lastDist = newDist;
        return;
      }

      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      if (touchState.type === "drag" && dragging) {
        e.preventDefault();
        const svgPos = screenToSvg(touch.clientX, touch.clientY);
        onUpdateNodePosition(dragging.nodeId, {
          x: svgPos.x - dragging.offsetX,
          y: svgPos.y - dragging.offsetY,
        });
        return;
      }

      if (touchState.type === "pan" && isPanning) {
        e.preventDefault();
        setPan({
          x: panStart.current.panX + (touch.clientX - panStart.current.x),
          y: panStart.current.panY + (touch.clientY - panStart.current.y),
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        if (dragging) setDragging(null);
        if (isPanning) setIsPanning(false);
        touchRef.current = { type: null, lastDist: 0, nodeId: null };
      } else if (e.touches.length === 1 && touchRef.current.type === "pinch") {
        // Went from 2 fingers to 1 — switch to pan
        const touch = e.touches[0];
        touchRef.current = { type: "pan", nodeId: null, lastDist: 0 };
        setIsPanning(true);
        panStart.current = {
          x: touch.clientX,
          y: touch.clientY,
          panX: pan.x,
          panY: pan.y,
        };
      }
    };

    container?.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      container?.removeEventListener("wheel", handleWheel);
      container?.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    pan,
    dragging,
    isPanning,
    screenToSvg,
    onUpdateNodePosition,
  ]);

  // Keyboard copy-paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in inputs or textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (!selectedNodeId) return;
        const node = nodes.find((node: IWorkflowNode) => node.id === selectedNodeId);
        if (!node) return;
        clipboardRef.current = structuredClone(node);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (readOnly || !clipboardRef.current) return;
        e.preventDefault();
        onDuplicateNode?.(clipboardRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, nodes, onDuplicateNode, readOnly]);

  // Output port click — start edge (blocked in readOnly)
  const handleOutputPortClick = useCallback(
    (e: React.MouseEvent, nodeId: string, modality: string, index: number) => {
      e.stopPropagation();
      if (readOnly) return;
      if (connecting) {
        setConnecting(null);
        setConnectingMouse(null);
        return;
      }
      setConnecting({
        sourceNodeId: nodeId,
        sourceModality: modality,
        sourceIndex: index,
      });
      const svgPos = screenToSvg(e.clientX, e.clientY);
      setConnectingMouse(svgPos);
    },
    [connecting, screenToSvg, readOnly],
  );

  // Input port click — complete edge (blocked in readOnly)
  const handleInputPortClick = useCallback(
    (e: React.MouseEvent, nodeId: string, modality: string) => {
      e.stopPropagation();
      if (readOnly) return;
      if (!connecting) return;

      if (
        getBaseModality(connecting.sourceModality) !== getBaseModality(modality)
      )
        return;
      if (connecting.sourceNodeId === nodeId) return;

      const existingConn = connections.find(
        (connection: WorkflowConnection) =>
          connection.targetNodeId === nodeId && connection.targetModality === modality,
      );
      if (existingConn) return;

      onAddConnection({
        sourceNodeId: connecting.sourceNodeId,
        sourceModality: connecting.sourceModality,
        targetNodeId: nodeId,
        targetModality: modality,
      });

      setConnecting(null);
      setConnectingMouse(null);
    },
    [connecting, connections, onAddConnection, readOnly],
  );

  // Toggle expanded state for a node
  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedInputs((prev) => {
      const next = new Set<string>(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      try {
        localStorage.setItem(
          LS_WORKFLOW_EXPANDED_NODES,
          JSON.stringify([...next]),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Compute expanded state for a specific node
  const isNodeExpanded = useCallback(
    (node: IWorkflowNode) => {
      if (node.nodeType === "viewer") {
        return !expandedInputs.has(node.id); // viewers expanded by default
      }
      return expandedInputs.has(node.id);
    },
    [expandedInputs],
  );

  // Toggle ALL nodes expanded/collapsed at once
  const handleToggleAllExpand = useCallback(() => {
    setExpandedInputs((prev) => {
      // Count how many nodes are currently expanded
      const expandedCount = nodes.filter((node: IWorkflowNode) => {
        if (node.nodeType === "viewer") return !prev.has(node.id);
        return prev.has(node.id);
      }).length;
      const mostExpanded = expandedCount > nodes.length / 2;

      // If most are expanded → collapse all; otherwise expand all
      const next = new Set<string>();
      if (!mostExpanded) {
        // Expand all: add non-viewers, remove viewers (inverted logic)
        for (const node of nodes) {
          if (node.nodeType !== "viewer") next.add(node.id);
        }
      } else {
        // Collapse all: add viewers (inverted), remove non-viewers
        for (const node of nodes) {
          if (node.nodeType === "viewer") next.add(node.id);
        }
      }
      try {
        localStorage.setItem(
          LS_WORKFLOW_EXPANDED_NODES,
          JSON.stringify([...next]),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
    // Resolve overlaps after React renders the new node sizes
    setTimeout(() => startCollisionLoop(60), 50);
  }, [nodes, startCollisionLoop]);

  const allExpanded =
    nodes.length > 0 &&
    nodes.filter((node: IWorkflowNode) => isNodeExpanded(node)).length >
      nodes.length / 2;

  // Compute the vertical offset for a node's ports (used by edge routing)
  const getExpandedOffset = useCallback(
    (node: IWorkflowNode) => {
      const expanded = isNodeExpanded(node);
      if (!node.nodeType && expandedInputs.has(node.id)) {
        return CONFIG_AREA_HEIGHT;
      }
      if (expanded && node.nodeType) {
        return getAssetContentHeight(node);
      }
      return 0;
    },
    [expandedInputs, isNodeExpanded],
  );

  // Render edges
  const renderConnection = (conn: WorkflowConnection) => {
    const sourceNode = nodes.find(
      (node: IWorkflowNode) => node.id === conn.sourceNodeId,
    );
    const targetNode = nodes.find(
      (node: IWorkflowNode) => node.id === conn.targetNodeId,
    );
    if (!sourceNode || !targetNode) return null;

    const sourceIndex = (sourceNode.outputTypes || []).indexOf(
      conn.sourceModality,
    );
    const targetIndex = (targetNode.inputTypes || []).indexOf(
      conn.targetModality,
    );
    if (sourceIndex === -1 || targetIndex === -1) return null;

    const sourceOffset = getExpandedOffset(sourceNode);
    const targetOffset = getExpandedOffset(targetNode);

    const sourcePos = getPortPosition(
      sourceNode,
      "output",
      sourceIndex,
      sourceOffset,
    );
    const targetPos = getPortPosition(
      targetNode,
      "input",
      targetIndex,
      targetOffset,
    );
    const color =
      (MODALITY_COLORS as Record<string, string>)[conn.sourceModality] || "#888";

    const sourceStatus = nodeStatuses[conn.sourceNodeId];
    const isRunning = sourceStatus === "running";
    const isDone = sourceStatus === "done";
    const isActive = isRunning || isDone;
    const workflowIsRunning = Object.values(nodeStatuses).some(
      (state) => state === "running",
    );
    const isEdgeSelected =
      conn.sourceNodeId === selectedNodeId ||
      conn.targetNodeId === selectedNodeId;
    const isEdgeFlowing = workflowIsRunning ? isRunning : isEdgeSelected;

    return (
      <g
        key={conn.id}
        className={`${styles['connection-group']}${isEdgeFlowing ? ` ${styles['connection-selected']}` : ""}`}
        data-workflow-connection
      >
        <path
          d={edgePath(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y)}
          stroke="transparent"
          strokeWidth={12}
          fill="none"
          className={styles['connection-hit-area']}
          onClick={() => onSelectNode(conn.sourceNodeId)}
        />
        <path
          d={edgePath(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y)}
          stroke={
            isRunning
              ? "url(#prism-gradient)"
              : isDone
                ? "url(#done-gradient)"
                : color
          }
          strokeWidth={isActive ? 3 : 2}
          fill="none"
          strokeOpacity={isActive ? 1 : 0.7}
          className={styles['connection-line']}
        />
        {!readOnly && (
          <foreignObject
            x={(sourcePos.x + targetPos.x) / 2 - 8}
            y={(sourcePos.y + targetPos.y) / 2 - 8}
            width={16}
            height={16}
            className={styles['connection-delete-wrapper']}
          >
            <button
              className={styles['connection-delete-button']}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                if (conn.id) onDeleteConnection(conn.id);
              }}
              title="Delete edge"
            >
              <X size={10} />
            </button>
          </foreignObject>
        )}
      </g>
    );
  };

  // Render the "in-progress" edge line
  const renderConnectingLine = () => {
    if (!connecting || !connectingMouse) return null;
    const sourceNode = nodes.find((node: IWorkflowNode) => node.id === connecting.sourceNodeId);
    if (!sourceNode) return null;

    const sourceIndex = (sourceNode.outputTypes || []).indexOf(
      connecting.sourceModality,
    );
    if (sourceIndex === -1) return null;

    const srcOffset = getExpandedOffset(sourceNode);
    const sourcePos = getPortPosition(
      sourceNode,
      "output",
      sourceIndex,
      srcOffset,
    );
    const color =
      (MODALITY_COLORS as Record<string, string>)[connecting.sourceModality] ||
      "#888";

    return (
      <path
        d={edgePath(
          sourcePos.x,
          sourcePos.y,
          (connectingMouse as { x: number; y: number }).x,
          (connectingMouse as { x: number; y: number }).y,
        )}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="6 3"
        fill="none"
        strokeOpacity={0.5}
        className={styles['connecting-line']}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className={`workflow-canvas-component ${styles['canvas']}${isPanning ? ` ${styles['panning']}` : ""}`}
      onMouseDown={handleCanvasMouseDown}
    >
      <StarfieldComponent
        className={styles['starfield']}
        panX={pan.x}
        panY={pan.y}
      />

      {nodes.length === 0 && !isLoadingWorkflow && (
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']}>⟡</div>
          <div className={styles['empty-title']}>Start Building Your Workflow</div>
          <div className={styles['empty-subtitle']}>
            Add models and assets from the sidebar to begin chaining them
            together
          </div>
        </div>
      )}

      <svg ref={svgRef} className={styles['svg']} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient
            id="prism-gradient"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="300"
            y2="300"
          >
            <stop offset="0%" stopColor="#ff0000" />
            <stop offset="16%" stopColor="#ff8800" />
            <stop offset="33%" stopColor="#ffff00" />
            <stop offset="50%" stopColor="#00ff88" />
            <stop offset="66%" stopColor="#0088ff" />
            <stop offset="83%" stopColor="#8800ff" />
            <stop offset="100%" stopColor="#ff0088" />
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="0 150 150"
              to="360 150 150"
              dur="2s"
              repeatCount="indefinite"
            />
          </linearGradient>
          <linearGradient
            id="done-gradient"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="300"
            y2="300"
          >
            <stop offset="0%" stopColor="#f0b429" />
            <stop offset="50%" stopColor="#d4a017" />
            <stop offset="100%" stopColor="#10b981" />
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="0 150 150"
              to="360 150 150"
              dur="4s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {connections.map(renderConnection)}
          {renderConnectingLine()}
          {nodes.map((node: IWorkflowNode) => (
            <WorkflowNode
              key={node.id}
              node={node}
              inputTypes={node.inputTypes || []}
              outputTypes={node.outputTypes || []}
              status={nodeStatuses[node.id]}
              results={nodeResults[node.id] as { error?: string } | undefined}
              isSelected={selectedNodeId === node.id}
              isExpanded={isNodeExpanded(node)}
              connecting={connecting}
              hoveredPort={hoveredPort}
              connections={connections}
              nodeStatuses={nodeStatuses}
              onMouseDown={handleNodeMouseDown}
              onTouchStart={handleNodeTouchStart}
              onInputPortClick={handleInputPortClick}
              onOutputPortClick={handleOutputPortClick}
              onPortHover={setHoveredPort}
              onPortLeave={() => setHoveredPort(null)}
              onDelete={readOnly ? undefined : onDeleteNode}
              onUpdateContent={onUpdateNodeContent}
              onUpdateConfig={onUpdateNodeConfig}
              onUpdateFileInput={onUpdateFileInput}
              onToggleExpand={handleToggleExpand}
              onSelectNode={onSelectNode}
              readOnly={readOnly}
            />
          ))}
        </g>
      </svg>

      {nodes.length > 0 && (
        <div className={styles['canvas-toolbar']}>
          {onToggleSidebar && (
            <button
              className={`${styles['toolbar-button']} ${sidebarVisible ? styles['toolbar-button-element-is-active-state'] : ""}`}
              onClick={onToggleSidebar}
              title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarVisible ? (
                <PanelLeftClose size={14} />
              ) : (
                <PanelLeft size={14} />
              )}
            </button>
          )}
          <button
            className={styles['toolbar-button']}
            onClick={handleToggleAllExpand}
            title={
              allExpanded ? "Collapse all node info" : "Expand all node info"
            }
          >
            {allExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )}

      {nodes.length > 0 && !readOnly && (
        <div className={styles['instructions']}>
          Click an <strong>output port</strong> then an{" "}
          <strong>input port</strong> of the same type to connect
        </div>
      )}
    </div>
  );
}
