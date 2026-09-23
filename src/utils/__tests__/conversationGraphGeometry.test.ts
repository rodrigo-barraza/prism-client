/**
 * conversationGraphGeometry.test.ts
 *
 * The Nodes view camera and edge math. Zooming must keep the point under
 * the cursor fixed (the old wheel zoom scaled about the canvas centre),
 * a fit must hold the whole graph — labels included — inside the canvas,
 * and edges must leave and enter their nodes where the layout expects.
 */

import { describe, it, expect } from "vitest";
import {
  LABEL_ALLOWANCE,
  MAXIMUM_FIT_ZOOM,
  MAXIMUM_ZOOM,
  MINIMUM_ZOOM,
  centerViewportOn,
  computeGraphBounds,
  edgeGeometry,
  fitViewport,
  frameViewportOn,
  graphToScreen,
  interpolateViewport,
  screenToGraph,
  wheelZoomFactor,
  zoomAtPoint,
} from "../conversationGraphGeometry";

const node = (x: number, y: number, radius = 24) => ({ x, y, radius });

describe("zoomAtPoint", () => {
  it("keeps the graph point under the cursor fixed on screen", () => {
    const viewport = { zoom: 0.7, x: 120, y: -40 };
    const cursor = { x: 530, y: 310 };
    const graphPointUnderCursor = screenToGraph(viewport, cursor);

    const zoomed = zoomAtPoint(viewport, cursor, 1.8);

    const onScreenAfter = graphToScreen(zoomed, graphPointUnderCursor);
    expect(zoomed.zoom).toBeCloseTo(1.26);
    expect(onScreenAfter.x).toBeCloseTo(cursor.x);
    expect(onScreenAfter.y).toBeCloseTo(cursor.y);
  });

  it("clamps to the zoom range", () => {
    expect(zoomAtPoint({ zoom: 3.5, x: 0, y: 0 }, { x: 0, y: 0 }, 10).zoom).toBe(MAXIMUM_ZOOM);
    expect(zoomAtPoint({ zoom: 0.06, x: 0, y: 0 }, { x: 0, y: 0 }, 0.01).zoom).toBe(MINIMUM_ZOOM);
  });
});

describe("wheelZoomFactor", () => {
  it("is exponential, so equal and opposite deltas cancel", () => {
    expect(wheelZoomFactor(100, 0, false) * wheelZoomFactor(-100, 0, false)).toBeCloseTo(1);
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
  });

  it("reads line-mode deltas as pixels and zooms harder on a pinch", () => {
    expect(wheelZoomFactor(3, 1, false)).toBeCloseTo(wheelZoomFactor(48, 0, false));
    expect(wheelZoomFactor(-10, 0, true)).toBeGreaterThan(wheelZoomFactor(-10, 0, false));
  });

  it("caps a single huge delta so one flick cannot jump the whole range", () => {
    expect(wheelZoomFactor(-5000, 0, false)).toBeCloseTo(wheelZoomFactor(-120, 0, false));
  });
});

describe("computeGraphBounds", () => {
  it("reserves label room to the right of the rightmost node", () => {
    const bounds = computeGraphBounds([node(0, 0), node(300, 160)])!;
    expect(bounds).toEqual({ minX: -24, minY: -24, maxX: 324 + LABEL_ALLOWANCE, maxY: 184 });
  });

  it("returns null for an empty graph", () => {
    expect(computeGraphBounds([])).toBeNull();
  });
});

describe("fitViewport", () => {
  it("puts the whole bounds inside the canvas, padded, and centred", () => {
    const bounds = { minX: 0, minY: 0, maxX: 2400, maxY: 600 };
    const viewport = fitViewport(bounds, 1200, 800, 40);

    const topLeft = graphToScreen(viewport, { x: bounds.minX, y: bounds.minY });
    const bottomRight = graphToScreen(viewport, { x: bounds.maxX, y: bounds.maxY });
    expect(topLeft.x).toBeCloseTo(40);
    expect(bottomRight.x).toBeCloseTo(1160);
    expect(topLeft.y).toBeGreaterThanOrEqual(40);
    expect(bottomRight.y).toBeLessThanOrEqual(760);
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(400);
  });

  it("never magnifies a small graph past 1:1", () => {
    expect(fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 1600, 1000).zoom).toBe(MAXIMUM_FIT_ZOOM);
  });
});

describe("centring", () => {
  it("centres a point in the area left of a right-hand panel", () => {
    const viewport = centerViewportOn({ x: 500, y: 250 }, 0.8, 1400, 900, 368);
    expect(graphToScreen(viewport, { x: 500, y: 250 })).toEqual({ x: (1400 - 368) / 2, y: 450 });
  });

  it("frames a point at a fraction of the canvas", () => {
    const viewport = frameViewportOn({ x: 800, y: 1200 }, 0.5, 400, 600, 0.3, 0.62);
    const onScreen = graphToScreen(viewport, { x: 800, y: 1200 });
    expect(onScreen.x).toBeCloseTo(120);
    expect(onScreen.y).toBeCloseTo(372);
  });
});

describe("interpolateViewport", () => {
  it("starts and ends exactly at its endpoints", () => {
    const from = { zoom: 0.2, x: 10, y: 20 };
    const to = { zoom: 1.6, x: -300, y: 90 };
    expect(interpolateViewport(from, to, 0)).toEqual(from);
    const end = interpolateViewport(from, to, 1);
    expect(end.zoom).toBeCloseTo(1.6);
    expect(end.x).toBeCloseTo(-300);
    // Geometric zoom: halfway between 0.2 and 1.6 is their geometric mean.
    expect(interpolateViewport(from, to, 0.5).zoom).toBeCloseTo(Math.sqrt(0.2 * 1.6));
  });
});

describe("edgeGeometry", () => {
  it("runs a same-column chain edge from the source's bottom to the target's top", () => {
    const geometry = edgeGeometry(node(800, 80), node(800, 160));
    expect(geometry.start).toEqual({ x: 800, y: 104 });
    expect(geometry.end).toEqual({ x: 800, y: 136 });
  });

  it("leaves a column from the side and enters the next column from the opposite side", () => {
    const geometry = edgeGeometry(node(800, 240), node(1040, 400));
    expect(geometry.start).toEqual({ x: 824, y: 240 });
    expect(geometry.end).toEqual({ x: 1016, y: 400 });
    expect(geometry.path.startsWith("M 824 240 C")).toBe(true);
  });

  it("bows a back-edge out to the right instead of drawing over the chain", () => {
    const geometry = edgeGeometry(node(1040, 600), node(1040, 240));
    const numbers = geometry.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const controlXs = [numbers[2], numbers[4]];
    for (const controlX of controlXs) expect(controlX).toBeGreaterThan(1040 + 24);
  });
});
