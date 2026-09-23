"use client";

import { memo, useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GraphEdge, GraphNode } from "@rodrigo-barraza/utilities-library/graph";
import type { GraphBounds, GraphPoint } from "../utils/conversationGraphGeometry";
import styles from "./ConversationGraphMinimapComponent.module.css";

interface ConversationGraphMinimapProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  nodeById: ReadonlyMap<string, GraphNode>;
  colorOf: (node: GraphNode) => string;
  graphBounds: GraphBounds;
  visibleRect: GraphBounds;
  onNavigate: (graphPoint: GraphPoint, animate: boolean) => void;
}

const MINIMAP_PADDING = 40;

function ConversationGraphMinimapComponent({
  nodes,
  edges,
  nodeById,
  colorOf,
  graphBounds,
  visibleRect,
  onNavigate,
}: ConversationGraphMinimapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  // Frame both the graph and the viewport, so the viewport outline stays
  // on the map even when the camera has wandered off the graph.
  const minX = Math.min(graphBounds.minX, visibleRect.minX) - MINIMAP_PADDING;
  const minY = Math.min(graphBounds.minY, visibleRect.minY) - MINIMAP_PADDING;
  const maxX = Math.max(graphBounds.maxX, visibleRect.maxX) + MINIMAP_PADDING;
  const maxY = Math.max(graphBounds.maxY, visibleRect.maxY) + MINIMAP_PADDING;
  const spanWidth = Math.max(maxX - minX, 1);
  const spanHeight = Math.max(maxY - minY, 1);
  const strokeScale = Math.max(spanWidth, spanHeight) / 170;

  const toGraphPoint = useCallback((event: ReactPointerEvent<SVGSVGElement>): GraphPoint | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM?.();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const graphPoint = point.matrixTransform(matrix.inverse());
    return { x: graphPoint.x, y: graphPoint.y };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    isDraggingRef.current = true;
    const graphPoint = toGraphPoint(event);
    if (graphPoint) onNavigate(graphPoint, true);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    const graphPoint = toGraphPoint(event);
    if (graphPoint) onNavigate(graphPoint, false);
  };

  const endDrag = () => { isDraggingRef.current = false; };

  return (
    <div className={styles['minimap']} aria-hidden="true">
      <svg
        ref={svgRef}
        className={styles['minimap-canvas']}
        viewBox={`${minX} ${minY} ${spanWidth} ${spanHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g strokeWidth={strokeScale * 0.9} className={styles['minimap-edges']}>
          {edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) return null;
            return <line key={`${edge.source}→${edge.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
          })}
        </g>
        {nodes.map((node) => (
          <circle key={node.id} cx={node.x} cy={node.y} r={Math.max(node.radius, strokeScale * 4)} fill={colorOf(node)} />
        ))}
        <rect
          className={styles['minimap-viewport']}
          x={visibleRect.minX}
          y={visibleRect.minY}
          width={Math.max(visibleRect.maxX - visibleRect.minX, 1)}
          height={Math.max(visibleRect.maxY - visibleRect.minY, 1)}
          strokeWidth={strokeScale * 1.4}
          rx={strokeScale * 3}
        />
      </svg>
    </div>
  );
}

export default memo(ConversationGraphMinimapComponent);
