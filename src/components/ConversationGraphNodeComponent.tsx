"use client";

import { memo } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { GraphNode } from "@rodrigo-barraza/utilities-library/graph";
import { formatCostAdaptive, formatElapsedTime } from "@rodrigo-barraza/utilities-library";
import ProviderLogo, { resolveProviderLogoKey } from "./ProviderLogosComponent";
import { cleanModelName } from "./BadgeComponent";
import {
  AGENT_EMOJI,
  CONVERSATION_EMOJI,
  PROJECT_EMOJI,
  resolveSubAgentEmoji,
} from "../utils/subAgentEmojis";
import {
  NODE_LABELS,
  PROACTIVE_PENDING_REQUEST_NODE_ID,
  isAgentNode,
  requestToolNames,
} from "../utils/conversationGraphModel";
import styles from "./ConversationGraphNodeComponent.module.css";

/** How much text a node carries at the current zoom. */
export type NodeLabelDetail = 0 | 1 | 2;

export interface ConversationGraphNodeProps {
  node: GraphNode;
  color: string;
  orbGradientId: string;
  labelDetail: NodeLabelDetail;
  isSelected: boolean;
  isFocused: boolean;
  isDimmed: boolean;
  isLive: boolean;
  isInLiveFlow: boolean;
  isPending: boolean;
  isFailed: boolean;
  isEntering: boolean;
  isDragging: boolean;
  isPinned: boolean;
  descendantCount: number;
  isCollapsed: boolean;
  reducedMotion: boolean;
  toolEmojiMap: Map<string, string>;
  onNodePointerDown: (event: ReactPointerEvent<SVGGElement>, nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onHoverChange: (nodeId: string | null) => void;
}

const LABEL_CHARACTER_LIMIT = 26;
const TOOL_PILL_LIMIT = 4;
const TURN_EMOJI = "🗨️";
const USER_EMOJI = "👤";

function truncate(text: string, limit = LABEL_CHARACTER_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function numberMetadata(node: GraphNode, key: string): number | null {
  const value = node.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function primaryLabel(node: GraphNode): string {
  if (node.id === PROACTIVE_PENDING_REQUEST_NODE_ID) return "waiting for the model…";
  if (node.category === "request") {
    const operation = node.metadata?.operation;
    return truncate(typeof operation === "string" && operation ? operation : node.label);
  }
  return truncate(node.label || NODE_LABELS[node.category]);
}

function requestCountPhrase(node: GraphNode): string | null {
  const requestCount = numberMetadata(node, "requestCount");
  if (requestCount === null) return null;
  const cost = numberMetadata(node, "totalCost");
  const requests = `${requestCount} request${requestCount === 1 ? "" : "s"}`;
  return cost ? `${requests} · ${formatCostAdaptive(cost)}` : requests;
}

/** One quiet line under the label — what an at-a-glance reader wants. */
function secondaryLabel(node: GraphNode, isPending: boolean, isFailed: boolean): string | null {
  switch (node.category) {
    case "request": {
      const parts: string[] = [];
      if (isFailed) parts.push("failed");
      else if (isPending) parts.push("running…");
      const model = node.metadata?.model;
      if (typeof model === "string" && model) parts.push(cleanModelName(model));
      const duration = numberMetadata(node, "duration");
      if (duration && !isPending) parts.push(formatElapsedTime(duration));
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "subagent": {
      const depthLabel = `Sub-agent · L${node.depth ?? 1}`;
      const requests = requestCountPhrase(node);
      return requests ? `${depthLabel} · ${requests}` : depthLabel;
    }
    case "agent":
    case "session":
      return requestCountPhrase(node) ?? NODE_LABELS[node.category];
    case "turn": {
      const turnIndex = numberMetadata(node, "turnIndex");
      return turnIndex !== null ? `Turn ${turnIndex + 1}` : "Turn";
    }
    default:
      return NODE_LABELS[node.category];
  }
}

function nodeEmoji(node: GraphNode): string {
  switch (node.category) {
    case "session": return CONVERSATION_EMOJI;
    case "agent": return AGENT_EMOJI;
    case "subagent": return resolveSubAgentEmoji(node.depth ?? 1);
    case "project": return PROJECT_EMOJI;
    case "user": return USER_EMOJI;
    case "turn": return TURN_EMOJI;
    default: return "🔗";
  }
}

function NodeIcon({ node, radius }: { node: GraphNode; radius: number }) {
  const provider = node.category === "request" ? node.metadata?.provider : null;
  if (typeof provider === "string" && provider) {
    const iconSize = Math.round(radius * 0.95);
    return (
      <foreignObject
        x={-iconSize / 2}
        y={-iconSize / 2}
        width={iconSize}
        height={iconSize}
        className={styles['node-provider-icon']}
      >
        <div className={styles['node-provider-icon-inner']}>
          <ProviderLogo provider={resolveProviderLogoKey(provider)} size={Math.round(radius * 0.72)} />
        </div>
      </foreignObject>
    );
  }
  if (node.id === PROACTIVE_PENDING_REQUEST_NODE_ID) {
    return <text className={styles['node-pending-glyph']} dominantBaseline="central" textAnchor="middle">•••</text>;
  }
  return (
    <text className={styles['node-emoji']} dominantBaseline="central" textAnchor="middle" fontSize={radius * 1.05}>
      {nodeEmoji(node)}
    </text>
  );
}

function ToolPills({ toolNames, toolEmojiMap }: { toolNames: string[]; toolEmojiMap: Map<string, string> }) {
  const shown = toolNames.slice(0, TOOL_PILL_LIMIT);
  const hiddenCount = toolNames.length - shown.length;
  return (
    <foreignObject x={0} y={14} width={200} height={40} className={styles['node-tool-pills']}>
      <div className={styles['node-tool-pill-row']}>
        {shown.map((toolName) => {
          const toolEmoji = toolEmojiMap.get(toolName);
          return (
            <span key={toolName} className={styles['node-tool-pill']}>
              {toolEmoji?.startsWith("http")
                ? <img src={toolEmoji} alt="" className={styles['node-tool-pill-image']} />
                : <span aria-hidden="true">{toolEmoji || "⚙"}</span>}
              {toolName}
            </span>
          );
        })}
        {hiddenCount > 0 && <span className={styles['node-tool-pill']}>+{hiddenCount}</span>}
      </div>
    </foreignObject>
  );
}

function ConversationGraphNodeComponent({
  node,
  color,
  orbGradientId,
  labelDetail,
  isSelected,
  isFocused,
  isDimmed,
  isLive,
  isInLiveFlow,
  isPending,
  isFailed,
  isEntering,
  isDragging,
  isPinned,
  descendantCount,
  isCollapsed,
  reducedMotion,
  toolEmojiMap,
  onNodePointerDown,
  onNodeDoubleClick,
  onToggleCollapse,
  onHoverChange,
}: ConversationGraphNodeProps) {
  const radius = node.radius || 24;
  const badgeOffset = radius * 0.74;
  const toolNames = node.category === "request" ? requestToolNames(node) : [];
  const secondary = labelDetail >= 2 ? secondaryLabel(node, isPending, isFailed) : null;
  const showsLabel = labelDetail >= 1 || isSelected || isLive;
  const isAgent = isAgentNode(node);

  const groupClassName = [
    styles['node'],
    isDragging ? styles['node-dragging'] : "",
    isDimmed ? styles['node-dimmed'] : "",
  ].join(" ");
  const bodyClassName = [
    styles['node-body'],
    isEntering && !reducedMotion ? styles['node-entering'] : "",
    isSelected ? styles['node-selected'] : "",
    isFocused ? styles['node-focused'] : "",
    isLive ? styles['node-live'] : "",
    isInLiveFlow ? styles['node-in-live-flow'] : "",
    isFailed ? styles['node-failed'] : "",
  ].join(" ");

  return (
    <g
      className={groupClassName}
      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
      data-node-identifier={node.id}
      onPointerDown={(event) => onNodePointerDown(event, node.id)}
      onDoubleClick={() => onNodeDoubleClick(node.id)}
      onPointerEnter={() => onHoverChange(node.id)}
      onPointerLeave={() => onHoverChange(null)}
    >
      <title>{`${NODE_LABELS[node.category]}: ${node.label}`}</title>
      <g className={styles['node-lift']}>
        <g className={bodyClassName} style={{ "--node-color": color } as CSSProperties}>
          {isEntering && isAgent && !reducedMotion && <circle r={radius + 30} className={styles['node-spawn-ripple']} />}
          {(isSelected || isLive || isFocused) && <circle r={radius + 12} className={styles['node-halo']} />}
          <circle r={radius + 7} className={styles['node-hit-area']} />
          {(isPending || isLive) && !isFailed && (
            <circle r={radius + 5.5} pathLength={100} className={styles['node-spinner']} />
          )}
          {isSelected && <circle r={radius + 4} className={styles['node-selection-ring']} />}
          <circle r={radius} fill={`url(#${orbGradientId})`} className={styles['node-orb']} data-node-body="true" />
          <ellipse cx={-radius * 0.26} cy={-radius * 0.44} rx={radius * 0.5} ry={radius * 0.27} className={styles['node-gloss']} />
          <NodeIcon node={node} radius={radius} />

          {node.category === "request" && typeof node.sequenceNumber === "number" && (
            <g transform={`translate(${badgeOffset} ${-badgeOffset})`} className={styles['node-badge']}>
              <rect x={-11} y={-8} width={22} height={16} rx={8} className={styles['node-badge-plate']} />
              <text dominantBaseline="central" textAnchor="middle" className={styles['node-badge-text']}>
                {node.sequenceNumber > 99 ? "99+" : node.sequenceNumber}
              </text>
            </g>
          )}

          {isFailed && (
            <g transform={`translate(${badgeOffset} ${badgeOffset})`} className={styles['node-failed-badge']}>
              <circle r={8.5} />
              <text dominantBaseline="central" textAnchor="middle">!</text>
            </g>
          )}

          {isPinned && !isDragging && (
            <circle cx={-badgeOffset} cy={badgeOffset} r={3.5} className={styles['node-pin-dot']} />
          )}

          {descendantCount > 0 && (
            <g
              transform={`translate(${-badgeOffset} ${-badgeOffset})`}
              className={styles['node-collapse-toggle']}
              role="button"
              aria-label={isCollapsed ? `Expand ${descendantCount} sub-agents` : "Collapse sub-agents"}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse(node.id);
              }}
            >
              <rect x={isCollapsed ? -13 : -9} y={-9} width={isCollapsed ? 26 : 18} height={18} rx={9} />
              <text dominantBaseline="central" textAnchor="middle">{isCollapsed ? `+${descendantCount}` : "−"}</text>
            </g>
          )}
        </g>
      </g>

      {showsLabel && (
        <g className={styles['node-label']} transform={`translate(${radius + 10} 0)`}>
          <text className={styles['node-label-primary']} y={secondary ? -6 : 0} dominantBaseline="central">
            {primaryLabel(node)}
          </text>
          {secondary && (
            <text className={styles['node-label-secondary']} y={9} dominantBaseline="central">
              {truncate(secondary, 40)}
            </text>
          )}
          {labelDetail >= 2 && toolNames.length > 0 && <ToolPills toolNames={toolNames} toolEmojiMap={toolEmojiMap} />}
        </g>
      )}
    </g>
  );
}

export default memo(ConversationGraphNodeComponent);
