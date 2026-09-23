"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  clampZoom,
  easeOutCubic,
  interpolateViewport,
  viewportsNearlyEqual,
  wheelZoomFactor,
  zoomAtPoint,
  type GraphPoint,
  type GraphViewport,
} from "../utils/conversationGraphGeometry";

/* ═══════════════════════════════════════════════════════════════════
   useGraphViewport — the Nodes view camera
   ═══════════════════════════════════════════════════════════════════
   Owns zoom/pan, the canvas size, and every camera gesture: wheel and
   pinch zoom about the pointer, trackpad and drag panning, two-finger
   pinch on touch. Only one camera animation runs at a time; any new
   gesture or animation cancels the one in flight. */

export interface CanvasSize {
  width: number;
  height: number;
}

interface UseGraphViewportOptions {
  reducedMotion: boolean;
  /** A user gesture moved the camera — the view stops auto-following. */
  onUserCamera?: () => void;
}

const DEFAULT_CAMERA_DURATION = 420;

export default function useGraphViewport({ reducedMotion, onUserCamera }: UseGraphViewportOptions) {
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [viewport, setViewportState] = useState<GraphViewport>({ zoom: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const viewportRef = useRef(viewport);
  const animationFrameRef = useRef<number | null>(null);
  const onUserCameraRef = useRef(onUserCamera);
  useEffect(() => { onUserCameraRef.current = onUserCamera; }, [onUserCamera]);

  const pointersRef = useRef(new Map<number, GraphPoint>());
  const pinchRef = useRef<{ distance: number; midpoint: GraphPoint } | null>(null);

  const commitViewport = useCallback((next: GraphViewport) => {
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const jumpTo = useCallback((target: GraphViewport) => {
    cancelAnimation();
    commitViewport(target);
  }, [cancelAnimation, commitViewport]);

  const animateTo = useCallback((target: GraphViewport, duration = DEFAULT_CAMERA_DURATION) => {
    cancelAnimation();
    const start = viewportRef.current;
    if (reducedMotion || duration <= 0 || viewportsNearlyEqual(start, target)) {
      commitViewport(target);
      return;
    }
    let startTime: number | null = null;
    const step = (now: number) => {
      if (startTime === null) startTime = now;
      const progress = Math.min((now - startTime) / duration, 1);
      commitViewport(interpolateViewport(start, target, easeOutCubic(progress)));
      animationFrameRef.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    animationFrameRef.current = requestAnimationFrame(step);
  }, [cancelAnimation, commitViewport, reducedMotion]);

  const zoomBy = useCallback((factor: number, anchor?: GraphPoint, animate = true) => {
    const current = viewportRef.current;
    const point = anchor ?? { x: size.width / 2, y: size.height / 2 };
    const target = zoomAtPoint(current, point, factor);
    if (animate) animateTo(target, 220);
    else jumpTo(target);
  }, [animateTo, jumpTo, size.height, size.width]);

  const setZoom = useCallback((zoom: number) => {
    const current = viewportRef.current;
    zoomBy(clampZoom(zoom) / current.zoom);
  }, [zoomBy]);

  // -- Canvas size -------------------------------------------------
  useEffect(() => {
    if (!canvasElement) return;
    const measure = () => {
      const rect = canvasElement.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(canvasElement);
    return () => resizeObserver.disconnect();
  }, [canvasElement]);

  // -- Wheel: attached natively so preventDefault works (React's wheel
  //    listener is passive — the page scrolled while the graph zoomed).
  useEffect(() => {
    if (!canvasElement) return;
    const handleWheel = (event: WheelEvent) => {
      // Overlays inside the canvas (the detail panel) scroll themselves.
      if ((event.target as Element | null)?.closest?.("[data-graph-overlay]")) return;
      event.preventDefault();
      cancelAnimation();
      const rect = canvasElement.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const current = viewportRef.current;
      const isPinch = event.ctrlKey || event.metaKey;
      if (!isPinch && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
        const horizontal = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
        const vertical = event.shiftKey ? 0 : event.deltaY;
        commitViewport({ ...current, x: current.x - horizontal, y: current.y - vertical });
      } else {
        commitViewport(zoomAtPoint(current, anchor, wheelZoomFactor(event.deltaY, event.deltaMode, isPinch)));
      }
      onUserCameraRef.current?.();
    };
    canvasElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvasElement.removeEventListener("wheel", handleWheel);
  }, [canvasElement, cancelAnimation, commitViewport]);

  // -- Pointer pan + pinch -----------------------------------------
  const localPoint = useCallback((event: ReactPointerEvent) => {
    const rect = canvasElement?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, [canvasElement]);

  const pinchState = () => {
    const [pointA, pointB] = [...pointersRef.current.values()];
    return {
      distance: Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y) || 1,
      midpoint: { x: (pointA.x + pointB.x) / 2, y: (pointA.y + pointB.y) / 2 },
    };
  };

  /** Starts a pan (or, with a second finger, a pinch) from the background. */
  const handleBackgroundPointerDown = useCallback((event: ReactPointerEvent<Element>) => {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    cancelAnimation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, localPoint(event));
    if (pointersRef.current.size === 2) pinchRef.current = pinchState();
    setIsPanning(true);
  }, [cancelAnimation, localPoint]);

  /** Returns true when the move belonged to a camera gesture. */
  const handleCameraPointerMove = useCallback((event: ReactPointerEvent<Element>): boolean => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return false;
    const point = localPoint(event);
    pointersRef.current.set(event.pointerId, point);
    const current = viewportRef.current;

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const next = pinchState();
      const zoomed = zoomAtPoint(current, next.midpoint, next.distance / pinchRef.current.distance);
      commitViewport({
        ...zoomed,
        x: zoomed.x + (next.midpoint.x - pinchRef.current.midpoint.x),
        y: zoomed.y + (next.midpoint.y - pinchRef.current.midpoint.y),
      });
      pinchRef.current = next;
    } else {
      commitViewport({ ...current, x: current.x + (point.x - previous.x), y: current.y + (point.y - previous.y) });
    }
    onUserCameraRef.current?.();
    return true;
  }, [commitViewport, localPoint]);

  const handleCameraPointerUp = useCallback((event: ReactPointerEvent<Element>) => {
    if (!pointersRef.current.delete(event.pointerId)) return;
    pinchRef.current = pointersRef.current.size >= 2 ? pinchState() : null;
    if (pointersRef.current.size === 0) setIsPanning(false);
  }, []);

  useEffect(() => () => cancelAnimation(), [cancelAnimation]);

  return {
    canvasRef: setCanvasElement,
    canvasElement,
    size,
    isMeasured: size.width > 0 && size.height > 0,
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
  };
}
