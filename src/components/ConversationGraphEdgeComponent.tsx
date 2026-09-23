"use client";

import { memo } from "react";
import type { CSSProperties } from "react";
import styles from "./ConversationGraphEdgeComponent.module.css";

export type EdgeVariant = "default" | "muted" | "selected" | "live";

export interface ConversationGraphEdgeProps {
  /** Instance-scoped DOM id stem — two mounted graphs never share one. */
  domId: string;
  path: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  sourceColor: string;
  targetColor: string;
  markerId: string;
  variant: EdgeVariant;
  isHighlighted: boolean;
  isEntering: boolean;
  /** An endpoint is being dragged — follow the pointer, don't glide. */
  isStatic: boolean;
  showParticles: boolean;
}

const PARTICLE_COUNT = 3;
const PARTICLE_PERIOD_SECONDS = 1.8;

function ConversationGraphEdgeComponent({
  domId,
  path,
  startX,
  startY,
  endX,
  endY,
  sourceColor,
  targetColor,
  markerId,
  variant,
  isHighlighted,
  isEntering,
  isStatic,
  showParticles,
}: ConversationGraphEdgeProps) {
  const gradientId = `${domId}-gradient`;
  const pathId = `${domId}-path`;
  const className = [
    styles['edge'],
    styles[`edge-${variant}`],
    isHighlighted ? styles['edge-highlighted'] : "",
    isEntering ? styles['edge-entering'] : "",
  ].join(" ");

  return (
    <g className={className}>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
          <stop offset="0" stopColor={sourceColor} />
          <stop offset="1" stopColor={targetColor} />
        </linearGradient>
      </defs>
      <path
        id={pathId}
        d={path}
        // The CSS `d` property is what transitions (Chromium, Firefox);
        // the attribute is the fallback where `d` is not a CSS property.
        style={{ d: `path("${path}")` } as CSSProperties}
        className={`${styles['edge-line']} ${isStatic ? styles['edge-line-static'] : ""}`}
        stroke={`url(#${gradientId})`}
        pathLength={isEntering ? 1 : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {showParticles && Array.from({ length: PARTICLE_COUNT }, (_, particleIndex) => (
        <circle key={particleIndex} r={2.8} className={styles['edge-particle']}>
          <animateMotion
            dur={`${PARTICLE_PERIOD_SECONDS}s`}
            begin={`${(-particleIndex * PARTICLE_PERIOD_SECONDS) / PARTICLE_COUNT}s`}
            repeatCount="indefinite"
            rotate="auto"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </g>
  );
}

export default memo(ConversationGraphEdgeComponent);
