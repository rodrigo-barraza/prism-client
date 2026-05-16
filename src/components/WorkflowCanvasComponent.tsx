"use client";

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
  // @ts-ignore
  // @ts-ignore
  nodes: any,
  // @ts-ignore
  // @ts-ignore
  connections: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateNodePosition: any,
  // @ts-ignore
  // @ts-ignore
  onDeleteNode: any,
  // @ts-ignore
  // @ts-ignore
  onAddConnection: any,
  // @ts-ignore
  // @ts-ignore
  onDeleteConnection: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateNodeContent: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateNodeConfig: any,
  // @ts-ignore
  // @ts-ignore
  onUpdateFileInput: any,
  // @ts-ignore
  // @ts-ignore
  onDuplicateNode: any,
  nodeStatuses = {},
  nodeResults = {},
  // @ts-ignore
  // @ts-ignore
  selectedNodeId: any,
  // @ts-ignore
  // @ts-ignore
  onSelectNode: any,
  // @ts-ignore
  // @ts-ignore
  activeWorkflowId: any,
  readOnly = false,
  isLoadingWorkflow = false,
  sidebarVisible = true,
  // @ts-ignore
  // @ts-ignore
  onToggleSidebar: any,
}) {
  const svgRef = useRef<any>(null);
  const containerRef = useRef<any>(null);
  const clipboardRef = useRef<any>(null);
  const [dragging, setDragging] = useState<any>(null);
  const [connecting, setConnecting] = useState<any>(null);
  const [connectingMouse, setConnectingMouse] = useState<any>(null);
  const [expandedInputs, setExpandedInputs] = useState<any>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(LS_WORKFLOW_EXPANDED_NODES);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
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

  const [pan, setPan] = useState<any>(() => {
    // @ts-ignore
    if (!activeWorkflowId || typeof window === "undefined")
      return { x: 0, y: 0 };
    // @ts-ignore
    const saved = getStoredViews()[activeWorkflowId];
    return saved ? { x: saved.x, y: saved.y } : { x: 0, y: 0 };
  });
  const [zoom, setZoom] = useState<any>(() => {
    // @ts-ignore
    if (!activeWorkflowId || typeof window === "undefined") return 1;
    // @ts-ignore
    const saved = getStoredViews()[activeWorkflowId];
    return saved ? saved.zoom : 1;
  });
  const [isPanning, setIsPanning] = useState<any>(false);
  const panStart = useRef<any>({ x: 0, y: 0, panX: 0, panY: 0 });
  const [hoveredPort, setHoveredPort] = useState<any>(null);
  // @ts-ignore
  const prevWorkflowIdRef = useRef<any>(activeWorkflowId);

  // Save current view whenever pan/zoom changes
  useEffect(() => {
    // @ts-ignore
    if (!activeWorkflowId) return;
    const views = getStoredViews();
    // @ts-ignore
    views[activeWorkflowId] = { x: pan.x, y: pan.y, zoom };
    try {
      localStorage.setItem(LS_WORKFLOW_VIEWS, JSON.stringify(views));
    } catch {
      /* ignore */
    }
  // @ts-ignore
  }, [pan, zoom, activeWorkflowId]);

  // Restore view when switching workflows

  useEffect(() => {
    // @ts-ignore
    if (activeWorkflowId !== prevWorkflowIdRef.current) {
      // @ts-ignore
      const saved = getStoredViews()[activeWorkflowId];
      setPan(saved ? { x: saved.x, y: saved.y } : { x: 0, y: 0 }); // sync from localStorage
      setZoom(saved ? saved.zoom : 1); // sync from localStorage
      // @ts-ignore
      prevWorkflowIdRef.current = activeWorkflowId;
    }
  // @ts-ignore
  }, [activeWorkflowId]);

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3;

  // Convert screen coordinates to SVG coordinates
  const screenToSvg = useCallback(
    (clientX: any, clientY: any) => {
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
    (e: any, nodeId: any) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      // @ts-ignore
      onSelectNode?.(nodeId);
      // @ts-ignore
      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node) return;
      const svgPos = screenToSvg(e.clientX, e.clientY);
      setDragging({
        nodeId,
        offsetX: svgPos.x - node.position.x,
        offsetY: svgPos.y - node.position.y,
      });
    },
    // @ts-ignore
    // @ts-ignore
    [nodes, screenToSvg, onSelectNode],
  );

  // -- Touch support --
  const touchRef = useRef<any>({ type: null, lastDist: 0, nodeId: null });

  const getTouchDist = (touches: any) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches: any, rect: any) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
    y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
  });

  // Node dragging (touch)
  const handleNodeTouchStart = useCallback(
    (e: any, nodeId: any) => {
      if (e.touches.length !== 1) return;
      e.stopPropagation();
      e.preventDefault();
      // @ts-ignore
      onSelectNode?.(nodeId);
      // @ts-ignore
      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node) return;
      const touch = e.touches[0];
      const svgPos = screenToSvg(touch.clientX, touch.clientY);
      touchRef.current = { type: "drag", nodeId };
      setDragging({
        nodeId,
        offsetX: svgPos.x - node.position.x,
        offsetY: svgPos.y - node.position.y,
      });
    },
    // @ts-ignore
    // @ts-ignore
    [nodes, screenToSvg, onSelectNode],
  );

  // Panning — starts when clicking on empty canvas background
  const handleCanvasMouseDown = useCallback(
    (e: any) => {
      if (e.button !== 0) return;
      const el = e.target;
      const isContainerOrSvg =
        el === containerRef.current || el === svgRef.current;
      const isGridBg =
        el.classList?.contains?.(styles.starfield) || el.tagName === "CANVAS";
      const isInsideInteractive = el.closest?.(
        "[data-workflow-node], [data-workflow-connection]",
      );
      if (
        isContainerOrSvg ||
        isGridBg ||
        (!isInsideInteractive && containerRef.current?.contains(el))
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
    (e: any) => {
      if (dragging) {
        const svgPos = screenToSvg(e.clientX, e.clientY);
        // @ts-ignore
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
    // @ts-ignore
    [dragging, connecting, isPanning, screenToSvg, onUpdateNodePosition],
  );

  // -- Collision repulsion via requestAnimationFrame (only while dragging) --
  // Keep refs to the latest values so the RAF loop always sees fresh state.
  // @ts-ignore
  const nodesRef = useRef<any>(nodes);
  // @ts-ignore
  const onUpdatePosRef = useRef<any>(onUpdateNodePosition);
  const draggingRef = useRef<any>(dragging);
  const expandedInputsRef = useRef<any>(expandedInputs);
  const rafRef = useRef<any>(null);
  const settleCountRef = useRef<any>(0);
  const collisionTickRef = useRef<any>(null);

  useEffect(() => {
    // @ts-ignore
    nodesRef.current = nodes;
  // @ts-ignore
  }, [nodes]);
  useEffect(() => {
    // @ts-ignore
    onUpdatePosRef.current = onUpdateNodePosition;
  // @ts-ignore
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
    const getNodeBox = (node: any) => {
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
      const dragId = draggingRef.current?.nodeId || null;
      const updates = {};

      for (let a = 0; a < currentNodes.length; a++) {
        for (let b = a + 1; b < currentNodes.length; b++) {
          const nA = currentNodes[a];
          const nB = currentNodes[b];
          const boxA = getNodeBox(nA);
          const boxB = getNodeBox(nB);

          const aCx = nA.position.x + boxA.w / 2;
          const aCy = nA.position.y + boxA.h / 2;
          const bCx = nB.position.x + boxB.w / 2;
          const bCy = nB.position.y + boxB.h / 2;

          const overlapX =
            boxA.w / 2 + boxB.w / 2 + COLLISION_PADDING - Math.abs(aCx - bCx);
          const overlapY =
            boxA.h / 2 + boxB.h / 2 + COLLISION_PADDING - Math.abs(aCy - bCy);

          if (overlapX > MIN_PUSH && overlapY > MIN_PUSH) {
            const aIsDragged = nA.id === dragId;
            const bIsDragged = nB.id === dragId;

            if (overlapX < overlapY) {
              const push = overlapX * PUSH_FACTOR;
              const dir = bCx >= aCx ? 1 : -1;
              if (aIsDragged) {
                // @ts-ignore
                // @ts-ignore
                if (!updates[nB.id]) updates[nB.id] = { ...nB.position };
                // @ts-ignore
                updates[nB.id].x += dir * push;
              } else if (bIsDragged) {
                // @ts-ignore
                // @ts-ignore
                if (!updates[nA.id]) updates[nA.id] = { ...nA.position };
                // @ts-ignore
                updates[nA.id].x -= dir * push;
              } else {
                const half = push / 2;
                // @ts-ignore
                // @ts-ignore
                if (!updates[nA.id]) updates[nA.id] = { ...nA.position };
                // @ts-ignore
                // @ts-ignore
                if (!updates[nB.id]) updates[nB.id] = { ...nB.position };
                // @ts-ignore
                updates[nA.id].x -= dir * half;
                // @ts-ignore
                updates[nB.id].x += dir * half;
              }
            } else {
              const push = overlapY * PUSH_FACTOR;
              const dir = bCy >= aCy ? 1 : -1;
              if (aIsDragged) {
                // @ts-ignore
                // @ts-ignore
                if (!updates[nB.id]) updates[nB.id] = { ...nB.position };
                // @ts-ignore
                updates[nB.id].y += dir * push;
              } else if (bIsDragged) {
                // @ts-ignore
                // @ts-ignore
                if (!updates[nA.id]) updates[nA.id] = { ...nA.position };
                // @ts-ignore
                updates[nA.id].y -= dir * push;
              } else {
                const half = push / 2;
                // @ts-ignore
                // @ts-ignore
                if (!updates[nA.id]) updates[nA.id] = { ...nA.position };
                // @ts-ignore
                // @ts-ignore
                if (!updates[nB.id]) updates[nB.id] = { ...nB.position };
                // @ts-ignore
                updates[nA.id].y -= dir * half;
                // @ts-ignore
                updates[nB.id].y += dir * half;
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
        rafRef.current = requestAnimationFrame(collisionTickRef.current);
      } else if (hasUpdates) {
        // Still have overlaps — keep going, reset buffer
        settleCountRef.current = 10;
        rafRef.current = requestAnimationFrame(collisionTickRef.current);
      } else if (settleCountRef.current > 0) {
        // No overlaps this frame, but run a few more to catch settling
        settleCountRef.current--;
        rafRef.current = requestAnimationFrame(collisionTickRef.current);
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
      rafRef.current = requestAnimationFrame(collisionTickRef.current);
    }
  }, []);

  // Start collision loop when dragging begins
  useEffect(() => {
    if (dragging) startCollisionLoop(30);
  }, [dragging, startCollisionLoop]);

  // Resolve overlaps when a different workflow is loaded
  useEffect(() => {
    // @ts-ignore
    // @ts-ignore
    if (nodes.length > 0 && activeWorkflowId) {
      // Wait one frame for positions to settle, then run collision resolution
      setTimeout(() => startCollisionLoop(60), 80);
    }
  // @ts-ignore
  // @ts-ignore
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
  const zoomRef = useRef<any>(zoom);

  const handleWheel = useCallback((e: any) => {
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

    setPan((prev: any) => ({
      x: mouseX - ratio * (mouseX - prev.x),
      y: mouseY - ratio * (mouseY - prev.y),
    }));
    setZoom(newZoom);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    const container = containerRef.current;
    container?.addEventListener("wheel", handleWheel, { passive: false });

    // -- Touch handlers --
    const handleTouchStart = (e: any) => {
      if (!container?.contains(e.target)) return;

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
        const el = e.target;
        const isInsideNode = el.closest?.("[data-workflow-node]");
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

    const handleTouchMove = (e: any) => {
      const t = touchRef.current;

      if (t.type === "pinch" && e.touches.length === 2) {
        e.preventDefault();
        const rect = container?.getBoundingClientRect();
        if (!rect) return;
        const newDist = getTouchDist(e.touches);
        const center = getTouchCenter(e.touches, rect);
        const scale = newDist / t.lastDist;
        const currentZoom = zoomRef.current;
        const newZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, currentZoom * scale),
        );
        const ratio = newZoom / currentZoom;
        zoomRef.current = newZoom;
        setPan((prev: any) => ({
          x: center.x - ratio * (center.x - prev.x),
          y: center.y - ratio * (center.y - prev.y),
        }));
        setZoom(newZoom);
        touchRef.current.lastDist = newDist;
        return;
      }

      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      if (t.type === "drag" && dragging) {
        e.preventDefault();
        const svgPos = screenToSvg(touch.clientX, touch.clientY);
        // @ts-ignore
        onUpdateNodePosition(dragging.nodeId, {
          x: svgPos.x - dragging.offsetX,
          y: svgPos.y - dragging.offsetY,
        });
        return;
      }

      if (t.type === "pan" && isPanning) {
        e.preventDefault();
        setPan({
          x: panStart.current.panX + (touch.clientX - panStart.current.x),
          y: panStart.current.panY + (touch.clientY - panStart.current.y),
        });
      }
    };

    const handleTouchEnd = (e: any) => {
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
    // @ts-ignore
    onUpdateNodePosition,
  ]);

  // Keyboard copy-paste
  useEffect(() => {
    const handleKeyDown = (e: any) => {
      // Skip when typing in inputs or textareas
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable)
        return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        // @ts-ignore
        if (!selectedNodeId) return;
        // @ts-ignore
        // @ts-ignore
        const node = nodes.find((n: any) => n.id === selectedNodeId);
        if (!node) return;
        clipboardRef.current = structuredClone(node);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (readOnly || !clipboardRef.current) return;
        e.preventDefault();
        // @ts-ignore
        onDuplicateNode?.(clipboardRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // @ts-ignore
  // @ts-ignore
  // @ts-ignore
  }, [selectedNodeId, nodes, onDuplicateNode, readOnly]);

  // Output port click — start edge (blocked in readOnly)
  const handleOutputPortClick = useCallback(
    (e: any, nodeId: any, modality: any, index: any) => {
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
    (e: any, nodeId: any, modality: any) => {
      e.stopPropagation();
      if (readOnly) return;
      if (!connecting) return;

      if (
        getBaseModality(connecting.sourceModality) !== getBaseModality(modality)
      )
        return;
      if (connecting.sourceNodeId === nodeId) return;

      // @ts-ignore
      const existingConn = connections.find(
        (c: any) => c.targetNodeId === nodeId && c.targetModality === modality,
      );
      if (existingConn) return;

      // @ts-ignore
      onAddConnection({
        sourceNodeId: connecting.sourceNodeId,
        sourceModality: connecting.sourceModality,
        targetNodeId: nodeId,
        targetModality: modality,
      });

      setConnecting(null);
      setConnectingMouse(null);
    },
    // @ts-ignore
    // @ts-ignore
    [connecting, connections, onAddConnection, readOnly],
  );

  // Toggle expanded state for a node
  const handleToggleExpand = useCallback((nodeId: any) => {
    setExpandedInputs((prev: any) => {
      const next = new Set(prev);
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
    (node: any) => {
      if (node.nodeType === "viewer") {
        return !expandedInputs.has(node.id); // viewers expanded by default
      }
      return expandedInputs.has(node.id);
    },
    [expandedInputs],
  );

  // Toggle ALL nodes expanded/collapsed at once
  const handleToggleAllExpand = useCallback(() => {
    setExpandedInputs((prev: any) => {
      // Count how many nodes are currently expanded
      // @ts-ignore
      const expandedCount = nodes.filter((n: any) => {
        if (n.nodeType === "viewer") return !prev.has(n.id);
        return prev.has(n.id);
      }).length;
      // @ts-ignore
      const mostExpanded = expandedCount > nodes.length / 2;

      // If most are expanded → collapse all; otherwise expand all
      const next = new Set();
      if (!mostExpanded) {
        // Expand all: add non-viewers, remove viewers (inverted logic)
        // @ts-ignore
        for (const n of nodes) {
          if (n.nodeType !== "viewer") next.add(n.id);
        }
      } else {
        // Collapse all: add viewers (inverted), remove non-viewers
        // @ts-ignore
        for (const n of nodes) {
          if (n.nodeType === "viewer") next.add(n.id);
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
  // @ts-ignore
  }, [nodes, startCollisionLoop]);

  const allExpanded =
    // @ts-ignore
    nodes.length > 0 &&
    // @ts-ignore
    // @ts-ignore
    nodes.filter((n: any) => isNodeExpanded(n)).length > nodes.length / 2;

  // Compute the vertical offset for a node's ports (used by edge routing)
  const getExpandedOffset = useCallback(
    (node: any) => {
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
  const renderConnection = (conn: any) => {
    // @ts-ignore
    const sourceNode = nodes.find((n: any) => n.id === conn.sourceNodeId);
    // @ts-ignore
    const targetNode = nodes.find((n: any) => n.id === conn.targetNodeId);
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
    // @ts-ignore
    const color = MODALITY_COLORS[conn.sourceModality] || "#888";

    // @ts-ignore
    const sourceStatus = nodeStatuses[conn.sourceNodeId];
    const isRunning = sourceStatus === "running";
    const isDone = sourceStatus === "done";
    const isActive = isRunning || isDone;
    const workflowIsRunning = Object.values(nodeStatuses).some(
      (s) => s === "running",
    );
    const isEdgeSelected =
      // @ts-ignore
      conn.sourceNodeId === selectedNodeId ||
      // @ts-ignore
      conn.targetNodeId === selectedNodeId;
    const isEdgeFlowing = workflowIsRunning ? isRunning : isEdgeSelected;

    return (
      <g
        key={conn.id}
        className={`${styles.connectionGroup}${isEdgeFlowing ? ` ${styles.connectionSelected}` : ""}`}
        data-workflow-connection
      >
        <path
          d={edgePath(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y)}
          stroke="transparent"
          strokeWidth={12}
          fill="none"
          className={styles.connectionHitArea}
          // @ts-ignore
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
          className={`${styles.connectionLine}${isActive ? ` ${styles.prismLine}` : ""}`}
        />
        {!readOnly && (
          <foreignObject
            x={(sourcePos.x + targetPos.x) / 2 - 8}
            y={(sourcePos.y + targetPos.y) / 2 - 8}
            width={16}
            height={16}
            className={styles.connectionDeleteWrapper}
          >
            <button
              className={styles.connectionDeleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                // @ts-ignore
                onDeleteConnection(conn.id);
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
    // @ts-ignore
    const sourceNode = nodes.find((n: any) => n.id === connecting.sourceNodeId);
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
    // @ts-ignore
    const color = MODALITY_COLORS[connecting.sourceModality] || "#888";

    return (
      <path
        d={edgePath(
          sourcePos.x,
          sourcePos.y,
          connectingMouse.x,
          connectingMouse.y,
        )}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="6 3"
        fill="none"
        strokeOpacity={0.5}
        className={styles.connectingLine}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.canvas}${isPanning ? ` ${styles.panning}` : ""}`}
      onMouseDown={handleCanvasMouseDown}
    >
      {/* @ts-ignore */}
      <StarfieldComponent
        className={styles.starfield}
        panX={pan.x}
        panY={pan.y}
      />

      {/* @ts-ignore */}
      {nodes.length === 0 && !isLoadingWorkflow && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>⟡</div>
          <div className={styles.emptyTitle}>Start Building Your Workflow</div>
          <div className={styles.emptySubtitle}>
            Add models and assets from the sidebar to begin chaining them
            together
          </div>
        </div>
      )}

      <svg ref={svgRef} className={styles.svg} style={{ overflow: "visible" }}>
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
          {/* @ts-ignore */}
          {connections.map(renderConnection)}
          {renderConnectingLine()}
          {/* @ts-ignore */}
          {nodes.map((node: any) => (
            <WorkflowNode
              key={node.id}
              node={node}
              // @ts-ignore
              status={nodeStatuses[node.id]}
              // @ts-ignore
              results={nodeResults[node.id]}
              // @ts-ignore
              isSelected={selectedNodeId === node.id}
              isExpanded={isNodeExpanded(node)}
              connecting={connecting}
              hoveredPort={hoveredPort}
              // @ts-ignore
              connections={connections}
              nodeStatuses={nodeStatuses}
              onMouseDown={handleNodeMouseDown}
              onTouchStart={handleNodeTouchStart}
              onInputPortClick={handleInputPortClick}
              onOutputPortClick={handleOutputPortClick}
              onPortHover={setHoveredPort}
              onPortLeave={() => setHoveredPort(null)}
              // @ts-ignore
              onDelete={readOnly ? undefined : onDeleteNode}
              // @ts-ignore
              onUpdateContent={onUpdateNodeContent}
              // @ts-ignore
              onUpdateConfig={onUpdateNodeConfig}
              // @ts-ignore
              onUpdateFileInput={onUpdateFileInput}
              onToggleExpand={handleToggleExpand}
              // @ts-ignore
              onSelectNode={onSelectNode}
              readOnly={readOnly}
            />
          ))}
        </g>
      </svg>

      {/* @ts-ignore */}
      {nodes.length > 0 && (
        <div className={styles.canvasToolbar}>
          {/* @ts-ignore */}
          {onToggleSidebar && (
            <button
              className={`${styles.toolbarBtn} ${sidebarVisible ? styles.toolbarBtnActive : ""}`}
              // @ts-ignore
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
            className={styles.toolbarBtn}
            onClick={handleToggleAllExpand}
            title={
              allExpanded ? "Collapse all node info" : "Expand all node info"
            }
          >
            {allExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )}

      {/* @ts-ignore */}
      {nodes.length > 0 && !readOnly && (
        <div className={styles.instructions}>
          Click an <strong>output port</strong> then an{" "}
          <strong>input port</strong> of the same type to connect
        </div>
      )}
    </div>
  );
}
