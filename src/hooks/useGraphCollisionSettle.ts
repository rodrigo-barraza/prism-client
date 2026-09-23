"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GraphData, GraphNode } from "@rodrigo-barraza/utilities-library/graph";

/* ═══════════════════════════════════════════════════════════════════
   useGraphCollisionSettle — pushes overlapping nodes apart
   ═══════════════════════════════════════════════════════════════════
   The server layout is collision-free; overlaps come from dragging (the
   dragged node shoulders its neighbours aside) and from pinned nodes
   meeting new arrivals. Two rendering instances can share one graph
   state (sidebar + main view) — only the owner runs the loop, so pushes
   apply once per frame, and dragging steals ownership. */

const PUSH_FACTOR = 0.35;
const MINIMUM_PUSH = 0.5;
const COLLISION_PADDING = 15;
const SETTLE_TAIL_FRAMES = 10;

interface UseGraphCollisionSettleOptions {
  nodesRef: MutableRefObject<GraphNode[]>;
  draggedNodeIdRef: MutableRefObject<string | null>;
  collisionOwnerRef: MutableRefObject<symbol | null>;
  setGraphData: Dispatch<SetStateAction<GraphData | null>>;
}

export default function useGraphCollisionSettle({
  nodesRef,
  draggedNodeIdRef,
  collisionOwnerRef,
  setGraphData,
}: UseGraphCollisionSettleOptions) {
  const instanceIdRef = useRef<symbol>(Symbol("graph-collision-instance"));
  const animationFrameRef = useRef<number | null>(null);
  const settleCountRef = useRef(0);
  const tickRef = useRef<FrameRequestCallback | null>(null);

  useEffect(() => {
    tickRef.current = () => {
      if (collisionOwnerRef.current !== instanceIdRef.current) {
        animationFrameRef.current = null;
        return;
      }
      const currentNodes = nodesRef.current;
      const draggedId = draggedNodeIdRef.current;
      const updates: Record<string, { x: number; y: number }> = {};

      for (let indexA = 0; indexA < currentNodes.length; indexA++) {
        for (let indexB = indexA + 1; indexB < currentNodes.length; indexB++) {
          const nodeA = currentNodes[indexA];
          const nodeB = currentNodes[indexB];
          const positionA = updates[nodeA.id] || { x: nodeA.x, y: nodeA.y };
          const positionB = updates[nodeB.id] || { x: nodeB.x, y: nodeB.y };
          const deltaX = positionB.x - positionA.x;
          const deltaY = positionB.y - positionA.y;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1;
          const overlap = nodeA.radius + nodeB.radius + COLLISION_PADDING - distance;
          if (overlap <= MINIMUM_PUSH) continue;

          const unitX = deltaX / distance;
          const unitY = deltaY / distance;
          const push = overlap * PUSH_FACTOR;
          if (nodeA.id === draggedId) {
            updates[nodeB.id] ??= { x: nodeB.x, y: nodeB.y };
            updates[nodeB.id].x += unitX * push;
            updates[nodeB.id].y += unitY * push;
          } else if (nodeB.id === draggedId) {
            updates[nodeA.id] ??= { x: nodeA.x, y: nodeA.y };
            updates[nodeA.id].x -= unitX * push;
            updates[nodeA.id].y -= unitY * push;
          } else {
            const halfPush = push / 2;
            updates[nodeA.id] ??= { x: nodeA.x, y: nodeA.y };
            updates[nodeB.id] ??= { x: nodeB.x, y: nodeB.y };
            updates[nodeA.id].x -= unitX * halfPush;
            updates[nodeA.id].y -= unitY * halfPush;
            updates[nodeB.id].x += unitX * halfPush;
            updates[nodeB.id].y += unitY * halfPush;
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
              updates[node.id] ? { ...node, x: updates[node.id].x, y: updates[node.id].y } : node,
            ),
          };
        });
      }

      if (draggedNodeIdRef.current || hasUpdates) {
        settleCountRef.current = SETTLE_TAIL_FRAMES;
        animationFrameRef.current = requestAnimationFrame(tickRef.current!);
      } else if (settleCountRef.current > 0) {
        settleCountRef.current -= 1;
        animationFrameRef.current = requestAnimationFrame(tickRef.current!);
      } else {
        animationFrameRef.current = null;
        collisionOwnerRef.current = null;
      }
    };

    const instanceId = instanceIdRef.current;
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      if (collisionOwnerRef.current === instanceId) collisionOwnerRef.current = null;
    };
  }, [collisionOwnerRef, draggedNodeIdRef, nodesRef, setGraphData]);

  /** Runs the loop for at least `frames` frames, unless another instance owns it. */
  const startSettle = useCallback((frames = 30) => {
    if (collisionOwnerRef.current && collisionOwnerRef.current !== instanceIdRef.current) return;
    if (animationFrameRef.current === null && tickRef.current) {
      collisionOwnerRef.current = instanceIdRef.current;
      settleCountRef.current = frames;
      animationFrameRef.current = requestAnimationFrame(tickRef.current);
    }
  }, [collisionOwnerRef]);

  /** A drag in this instance must run the loop here, pinned under the pointer. */
  const claimSettle = useCallback(() => {
    collisionOwnerRef.current = instanceIdRef.current;
    startSettle(30);
  }, [collisionOwnerRef, startSettle]);

  return { startSettle, claimSettle };
}
