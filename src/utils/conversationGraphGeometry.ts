/* ═══════════════════════════════════════════════════════════════════
   Conversation graph geometry — pure viewport and edge math
   ═══════════════════════════════════════════════════════════════════
   The canvas draws graph space through one transform:
     screen = graph × zoom + (x, y)
   so zooming about a point, fitting and centring are all closed-form
   and testable without a DOM. */

export interface GraphViewport {
  zoom: number;
  x: number;
  y: number;
}

export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

interface PositionedCircle extends GraphPoint {
  radius: number;
}

export const MINIMUM_ZOOM = 0.05;
export const MAXIMUM_ZOOM = 4;
/** Auto-fit never magnifies past 1:1 — a three-node graph stays life-size. */
export const MAXIMUM_FIT_ZOOM = 1;
/** Below this, labels are unreadable; the live camera follows instead of fitting. */
export const READABLE_ZOOM = 0.55;
/** Labels, model lines and tool pills sit to the right of each node. */
export const LABEL_ALLOWANCE = 180;

export function clampZoom(zoom: number): number {
  return Math.min(MAXIMUM_ZOOM, Math.max(MINIMUM_ZOOM, zoom));
}

export function screenToGraph(viewport: GraphViewport, screenPoint: GraphPoint): GraphPoint {
  return {
    x: (screenPoint.x - viewport.x) / viewport.zoom,
    y: (screenPoint.y - viewport.y) / viewport.zoom,
  };
}

export function graphToScreen(viewport: GraphViewport, graphPoint: GraphPoint): GraphPoint {
  return {
    x: graphPoint.x * viewport.zoom + viewport.x,
    y: graphPoint.y * viewport.zoom + viewport.y,
  };
}

/** Zooms by `factor` keeping the graph point under `screenPoint` fixed. */
export function zoomAtPoint(viewport: GraphViewport, screenPoint: GraphPoint, factor: number): GraphViewport {
  const nextZoom = clampZoom(viewport.zoom * factor);
  const scale = nextZoom / viewport.zoom;
  return {
    zoom: nextZoom,
    x: screenPoint.x - (screenPoint.x - viewport.x) * scale,
    y: screenPoint.y - (screenPoint.y - viewport.y) * scale,
  };
}

/** Wheel delta → zoom factor. Exponential, so a trackpad's many small
    deltas and a mouse's few large ones zoom at the same rate per pixel;
    pinch (ctrl+wheel) is finer-grained, so it gets a larger gain. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, isPinch: boolean): number {
  const pixelDelta = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const gain = isPinch ? 0.01 : 0.0022;
  return Math.exp(-Math.max(-120, Math.min(120, pixelDelta)) * gain);
}

export function computeGraphBounds(nodes: readonly PositionedCircle[], labelAllowance = LABEL_ALLOWANCE): GraphBounds | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxX = Math.max(maxX, node.x + node.radius + labelAllowance);
    maxY = Math.max(maxY, node.y + node.radius);
  }
  return { minX, minY, maxX, maxY };
}

/** Viewport that shows `bounds` inside a `width × height` canvas with
    `padding` screen pixels on every side, never above `maximumZoom`. */
export function fitViewport(
  bounds: GraphBounds,
  width: number,
  height: number,
  padding = 48,
  maximumZoom = MAXIMUM_FIT_ZOOM,
): GraphViewport {
  const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const usableWidth = Math.max(width - padding * 2, 1);
  const usableHeight = Math.max(height - padding * 2, 1);
  const zoom = clampZoom(Math.min(usableWidth / boundsWidth, usableHeight / boundsHeight, maximumZoom));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return { zoom, x: width / 2 - centerX * zoom, y: height / 2 - centerY * zoom };
}

/** Viewport that puts `point` at the centre of the visible area. A panel
    covering the right edge shifts that centre left by half its width. */
export function centerViewportOn(
  point: GraphPoint,
  zoom: number,
  width: number,
  height: number,
  rightInset = 0,
): GraphViewport {
  const visibleCenterX = (width - rightInset) / 2;
  return { zoom, x: visibleCenterX - point.x * zoom, y: height / 2 - point.y * zoom };
}

/** Viewport that puts `point` at a fraction of the canvas — a chain that
    grows downward reads best with its newest node below centre, its label
    room to the right. */
export function frameViewportOn(
  point: GraphPoint,
  zoom: number,
  width: number,
  height: number,
  horizontalFraction: number,
  verticalFraction: number,
): GraphViewport {
  return { zoom, x: width * horizontalFraction - point.x * zoom, y: height * verticalFraction - point.y * zoom };
}

export function interpolateViewport(from: GraphViewport, to: GraphViewport, progress: number): GraphViewport {
  // Zoom interpolates geometrically so a 0.1 → 1 flight feels even.
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, progress);
  return {
    zoom,
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

export function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

export function viewportsNearlyEqual(viewportA: GraphViewport, viewportB: GraphViewport): boolean {
  return Math.abs(viewportA.zoom - viewportB.zoom) < 0.002
    && Math.abs(viewportA.x - viewportB.x) < 0.75
    && Math.abs(viewportA.y - viewportB.y) < 0.75;
}

/** The graph-space rectangle the canvas currently shows. */
export function visibleGraphRect(viewport: GraphViewport, width: number, height: number): GraphBounds {
  const topLeft = screenToGraph(viewport, { x: 0, y: 0 });
  const bottomRight = screenToGraph(viewport, { x: width, y: height });
  return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
}

/* ── Edges ─────────────────────────────────────────────────────────── */

export interface EdgeGeometry {
  path: string;
  start: GraphPoint;
  end: GraphPoint;
}

/** A smooth cubic edge between two circles.
    - Across columns it leaves the source's side and enters the target's
      opposite side, bowing horizontally.
    - Within a column it leaves bottom→top (or top→bottom), a straight run.
    - A back-edge within a column (target above) bows out to the right so
      it never lies on top of the chain it loops over. */
export function edgeGeometry(source: PositionedCircle, target: PositionedCircle): EdgeGeometry {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const sameColumn = Math.abs(deltaX) < Math.max(source.radius, target.radius) * 2;

  if (!sameColumn) {
    const direction = Math.sign(deltaX) || 1;
    const start = { x: source.x + direction * source.radius, y: source.y };
    const end = { x: target.x - direction * target.radius, y: target.y };
    const handle = Math.max(28, Math.abs(end.x - start.x) * 0.5);
    return {
      path: `M ${start.x} ${start.y} C ${start.x + direction * handle} ${start.y} ${end.x - direction * handle} ${end.y} ${end.x} ${end.y}`,
      start,
      end,
    };
  }

  if (deltaY >= 0) {
    const start = { x: source.x, y: source.y + source.radius };
    const end = { x: target.x, y: target.y - target.radius };
    const handle = Math.max(10, (end.y - start.y) * 0.45);
    return {
      path: `M ${start.x} ${start.y} C ${start.x} ${start.y + handle} ${end.x} ${end.y - handle} ${end.x} ${end.y}`,
      start,
      end,
    };
  }

  // Back-edge: out of the source's right side, around, into the target's right side.
  const bulge = Math.max(60, Math.abs(deltaY) * 0.35);
  const start = { x: source.x + source.radius * 0.7, y: source.y - source.radius * 0.7 };
  const end = { x: target.x + target.radius * 0.7, y: target.y + target.radius * 0.7 };
  return {
    path: `M ${start.x} ${start.y} C ${start.x + bulge} ${start.y - bulge * 0.4} ${end.x + bulge} ${end.y + bulge * 0.4} ${end.x} ${end.y}`,
    start,
    end,
  };
}
