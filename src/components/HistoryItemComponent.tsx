"use client";

import { useState, useEffect, useRef } from "react";

import { AGENT_IDS, DEFAULT_USERNAME } from "@/constants";

import { Download, Copy, Star, Trash2, ExternalLink } from "lucide-react";

import ModalityIconComponent from "./ModalityIconComponent";
import { ModelToolsRow } from "./ToolBadgeComponent";
import { resolveSubAgentEmoji } from "../utils/subAgentEmojis";

import styles from "./HistoryItemComponent.module.css";
import BadgeComponent from "./BadgeComponent";
import SoundService from "@/services/SoundService";
import { IconButtonComponent } from "@rodrigo-barraza/components-library";
import type { LucideIcon } from "lucide-react";
import {
  deriveAgentConversationState,
  AGENT_CONVERSATION_STATE_COLORS,
} from "../utils/agentConversationStates";
import type { AgentConversationState } from "../utils/agentConversationStates";
import { PHASE_TOKENS } from "../utils/statusBarPhaseTokens";
import type { StatusBarPhase } from "../utils/statusBarPhaseTokens";

interface HistoryItemTag {
  label: string;
  style?: React.CSSProperties;
}

interface AgentRef {
  id: string;
  name?: string;
}

interface HistoryItem {
  id: string;
  title?: string;
  subtitle?: string;
  updatedAt?: string;
  createdAt?: string;
  totalCost?: number;
  modalities?: Record<string, number | boolean>;
  modelName?: string | null;
  modelNames?: string[];
  providers?: string[];
  tags?: HistoryItemTag[];
  username?: string;
  agent?: string | AgentRef;
  parentConversationId?: string | null;
  hasSubAgents?: boolean;
  requestErrorCount?: number;
}

interface HistoryItemProps {
  item: HistoryItem;
  isActive?: boolean;
  onClick?: (item: HistoryItem) => void;
  onDelete?: (conversationId: string) => void;
  onDownload?: (conversationId: string) => void;
  onCopy?: (conversationId: string) => void;
  icon?: LucideIcon;
  readOnly?: boolean;
  admin?: boolean;
  isNew?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (conversationId: string) => void;
  className?: string;
  dataPanelClose?: boolean;
  onOpenInNewTab?: (item: HistoryItem) => void;
  isGenerating?: boolean;
  pendingBackgroundTasks?: number;
  isCondensed?: boolean;
  children?: React.ReactNode;
  subAgentNumber?: number | null;
  subAgentDepth?: number | null;
  hasSpawnedSubAgents?: boolean;
  isSubAgentsCollapsed?: boolean;
  onToggleSubAgents?: () => void;
  /** Persisted isActive from agent_conversations — if explicitly false, hides the activity dot */
  conversationIsActive?: boolean;
  /** Live execution phase from subAgentToolActivity — overrides the static CONVERSATION_STATE_TO_PHASE mapping */
  livePhase?: StatusBarPhase | null;
}

/**
 * HistoryItemComponent — a single row within HistoryList or any list that
 * needs the same visual treatment (admin association lists, etc.).
 *
 * Props:
 *   item          — { id, title, subtitle, updatedAt, createdAt, totalCost,
 *                     modalities, modelName, tags[], username }
 *   isActive      — boolean, highlights the row
 *   onClick       — (item) => void
 *   onDelete      — (id) => void  (omit to hide)
 *   onDownload    — (id) => void  (omit to hide)
 *   onCopy        — (id) => void  (omit to hide)

 *   readOnly      — disables destructive actions
 *   admin         — shows username tag, hides delete
 *   isNew         — shows NEW badge
 *   isFavorite    — boolean
 *   onToggleFavorite — (id) => void (omit to hide star)
 *   className     — extra root class
 *   dataPanelClose — adds data-panel-close-trigger attr (for mobile drawer close)
 *   children      — optional extra content appended inside the row
 */
/* Active conversation states that should show the inline progress bar. */
const ACTIVE_CONVERSATION_STATES = new Set<AgentConversationState>([
  "generating",
  "orchestrating",
  "sub-agents-running",
  "background-tasks",
  "active",
]);

/**
 * Maps an AgentConversationState to the nearest StatusBarPhase
 * so non-active items (sub-agents) derive the correct gradient palette.
 */
const CONVERSATION_STATE_TO_PHASE: Record<AgentConversationState, StatusBarPhase | null> = {
  generating:              "generating",
  orchestrating:           "delegating",
  "sub-agents-running":    "delegating",
  "background-tasks":      "synthesizing",
  active:                  "starting",
  "completed-with-errors": null,
  completed:               null,
};

const FALLBACK_PROGRESS_ASYMPTOTIC_TIME_CONSTANT_MS = 15_000;
const FALLBACK_PROGRESS_TICK_MS = 150;
const FALLBACK_PROGRESS_MAX_SYNTHETIC = 0.99;

export default function HistoryItemComponent({
  item,
  isActive = false,
  onClick,
  onDelete,
  onDownload,
  onCopy,

  readOnly = false,
  admin = false,
  isNew = false,
  isFavorite = false,
  onToggleFavorite,
  className,
  dataPanelClose = false,
  onOpenInNewTab,
  isGenerating = false,
  pendingBackgroundTasks,
  isCondensed = false,
  children,
  subAgentNumber,
  subAgentDepth,
  hasSpawnedSubAgents = false,
  isSubAgentsCollapsed = false,
  onToggleSubAgents,
  conversationIsActive,
  livePhase,
}: HistoryItemProps) {
  const conversationState = deriveAgentConversationState({
    isActive: conversationIsActive,
    isGenerating,
    pendingBackgroundTasks,
    hasSubAgents: item.hasSubAgents,
    requestErrorCount: item.requestErrorCount,
  });
  const dotColors = AGENT_CONVERSATION_STATE_COLORS[conversationState];

  /* When a livePhase is provided, override the generating-dot color with the
     phase's pulse color so the sidebar dot matches the conversation-view bar. */
  const livePhasePulseColor = livePhase ? PHASE_TOKENS[livePhase]?.overlay?.pulse : null;
  const resolvedDotColor = livePhasePulseColor ?? dotColors.primary;

  /* ── Inline progress bar ──
     Active conversation: reads width + colors from :root CSS vars published by
     StatusBarComponent (single source of truth, zero duplication).
     Non-active running items (sub-agents): run their own asymptotic timer and
     derive gradient colors from PHASE_TOKENS via conversation state. */
  const isInlineProgressActive = ACTIVE_CONVERSATION_STATES.has(conversationState);

  /* For the currently-active conversation, the StatusBar already publishes
     --live-status-bar-progress and --live-phase-gradient-stop-{1-7} to :root.
     The CSS will consume them directly — no JS state needed.

     For non-active items (sub-agents visible in the sidebar while not selected),
     we need a local asymptotic timer + local gradient stops. */
  const needsLocalTimer = isInlineProgressActive && !isActive;

  const [localProgressPercentage, setLocalProgressPercentage] = useState(0);
  const localProgressStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!needsLocalTimer) {
      setLocalProgressPercentage(0);
      localProgressStartRef.current = null;
      return;
    }

    if (localProgressStartRef.current === null) {
      localProgressStartRef.current = performance.now();
    }

    const intervalId = setInterval(() => {
      const elapsed = performance.now() - (localProgressStartRef.current ?? performance.now());
      const synthetic = Math.min(
        FALLBACK_PROGRESS_MAX_SYNTHETIC,
        1 - Math.exp(-elapsed / FALLBACK_PROGRESS_ASYMPTOTIC_TIME_CONSTANT_MS),
      );
      setLocalProgressPercentage(Math.round(synthetic * 100));
    }, FALLBACK_PROGRESS_TICK_MS);

    return () => clearInterval(intervalId);
  }, [needsLocalTimer]);

  /* Build inline styles only for non-active items (sub-agents).
     Active items consume :root CSS vars — no inline styles needed.
     When a livePhase is provided (from subAgentToolActivity), prefer it
     over the static CONVERSATION_STATE_TO_PHASE mapping so the bar's
     gradient palette matches the actual execution phase visible in the
     conversation StatusBarComponent. */
  const staticPhase = CONVERSATION_STATE_TO_PHASE[conversationState];
  const inlineProgressPhase = livePhase ?? staticPhase;
  const phaseTokens = inlineProgressPhase ? PHASE_TOKENS[inlineProgressPhase] : undefined;
  const localGradientStops = phaseTokens?.gradientStops;
  const localPulseColor = phaseTokens?.overlay?.pulse;

  const localFillStyle: React.CSSProperties | undefined = needsLocalTimer
    ? {
        width: `${localProgressPercentage}%`,
        ...(localGradientStops ? {
          "--gradient-stop-1": localGradientStops[0],
          "--gradient-stop-2": localGradientStops[1],
          "--gradient-stop-3": localGradientStops[2],
          "--gradient-stop-4": localGradientStops[3],
          "--gradient-stop-5": localGradientStops[4],
          "--gradient-stop-6": localGradientStops[5],
          "--gradient-stop-7": localGradientStops[6],
        } : {}),
      } as React.CSSProperties
    : undefined;

  const localTrackStyle: React.CSSProperties | undefined = needsLocalTimer && localPulseColor
    ? { "--phase-pulse": localPulseColor } as React.CSSProperties
    : undefined;

  const itemDate = item.updatedAt || item.createdAt;
  const modalities = item.modalities || {};
  const hasModalities = modalities && Object.keys(modalities).length > 0;
  const hasModel = (item.modelNames?.length ?? 0) > 0 || item.modelName;

  const INPUT_KEYS = ["textIn", "imageIn", "audioIn", "videoIn", "docIn"];
  const OUTPUT_KEYS = ["textOut", "imageOut", "audioOut", "embeddingOut"];
  const TOOL_KEYS = [
    "thinking",
    "functionCalling",
    "webSearch",
    "codeExecution",
    "computerUse",
    "fileSearch",
    "urlContext",
    "imageGeneration",
  ];

  const hasInputOutputModalities =
    modalities &&
    Object.keys(modalities).some(
      (key) =>
        (INPUT_KEYS.includes(key) || OUTPUT_KEYS.includes(key)) &&
        modalities[key],
    );

  const hasActiveTools =
    modalities &&
    Object.keys(modalities).some(
      (key) => TOOL_KEYS.includes(key) && modalities[key],
    );

  const AGENT_DISPLAY_NAMES: Record<string, string> = {
    CODING: "Coding Agent",
    LUPOS: "Lupos",
    STICKERS: "Clankerbox",
    LIGHTS: "Lights",
    OOG: "Oog",
    OMNI: "Omni",
    IMAGE: "Image Agent",
  };

  const getAgentDisplayName = (agent: string | AgentRef): string => {
    if (!agent) return "";
    const id = typeof agent === "string" ? agent : agent.id || "";
    const name = typeof agent === "object" ? agent.name : "";

    if (AGENT_DISPLAY_NAMES[id]) {
      return AGENT_DISPLAY_NAMES[id];
    }
    if (name && name !== id) {
      return name;
    }
    return id.charAt(0).toUpperCase() + id.slice(1).toLowerCase();
  };

  return (
    <div
      className={`history-item-component ${styles['item']} ${isActive ? styles['is-active-state'] : ""} ${className || ""}`}
      {...SoundService.interactive(() => onClick?.(item))}
      {...(dataPanelClose ? { "data-panel-close-trigger": true } : {})}
      onContextMenu={
        onOpenInNewTab
          ? (event: React.MouseEvent) => {
              if (event.target instanceof HTMLElement && event.target.closest?.(`.${styles['actions']}`))
                return;
              event.preventDefault();
              onOpenInNewTab(item);
            }
          : undefined
      }
    >
      {onToggleFavorite && (
        <button
          className={`${styles['favorite-button']} ${isFavorite ? styles['favorite-button-is-active-state'] : ""}`}
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            onToggleFavorite(item.id);
          }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}
      <div className={styles['content']}>
        {/* Row 1: time + tags (left) · agentBadge + cost (right) */}
        <div className={styles['top-layout-row']}>
          <div className={styles['top-left']}>
            <BadgeComponent type="dateTime" date={itemDate} />
            {admin &&
              item.username &&
              item.username !== "unknown" &&
              item.username !== DEFAULT_USERNAME && (
                <span className={styles['username-tag']}>{item.username}</span>
              )}
            {item.tags?.map((tag: HistoryItemTag) => (
              <span key={tag.label} className={styles['tag']} style={tag.style}>
                {tag.label}
              </span>
            ))}
          </div>
          <div className={styles['top-right']}>
            {item.agent &&
              (() => {
                const agentId =
                  typeof item.agent === "string"
                    ? item.agent
                    : item.agent.id || "";
                if (!agentId || agentId === AGENT_IDS.NONE) return null;

                const resolvedAgent =
                  typeof item.agent === "string"
                    ? { id: item.agent, name: item.agent }
                    : item.agent;

                return (
                  <span
                    className={styles['agent-badge']}
                    data-agent-identifier={agentId}
                  >
                    <BadgeComponent
                      type="agent"
                      agent={resolvedAgent}
                      size={14}
                      iconSize={9}
                    />
                    <span className={styles['agent-badge-name']}>
                      {getAgentDisplayName(item.agent)}
                    </span>
                  </span>
                );
              })()}
          </div>
        </div>

        {/* Row 2: title */}
        <div className={styles['title']}>
          {(conversationIsActive !== false || isGenerating) && (
            <span
              className={`${styles['generating-dot']} ${isGenerating ? styles['generating-dot-is-animating'] : styles['generating-dot-is-idle']}`}
              style={{ "--generating-dot-phase-color": resolvedDotColor } as React.CSSProperties}
            />
          )}
          {item.title || "Untitled"}
          {isNew && <span className={styles['new-badge']}>NEW</span>}
        </div>

        {/* Row 3: model badge & cost badge (when condensed) */}
        {(hasModel || (isCondensed && item.totalCost !== undefined && item.totalCost > 0)) && (
          <div className={styles['model-badge-and-cost-container']}>
            {hasModel && (
              <BadgeComponent
                type="model"
                models={
                  (item.modelNames?.length ?? 0) > 0
                    ? (item.modelNames || []).filter((name): name is string => typeof name === "string")
                    : [item.modelName].filter((name): name is string => typeof name === "string")
                }
                providers={item.providers}
                className={styles['model-badge']}
                noHover
              />
            )}
            {isCondensed && item.totalCost !== undefined && item.totalCost > 0 && (
              <BadgeComponent
                type="cost"
                cost={item.totalCost ?? 0}
                showIcon={false}
                className={styles['cost-badge-right-aligned']}
              />
            )}
          </div>
        )}

        {/* Row 3b: sub-agent indicator emojis + collapse toggle */}
        {(item.parentConversationId || item.hasSubAgents || hasSpawnedSubAgents) && (
          <div className={styles['sub-agent-indicators-row']}>
            {(item.hasSubAgents || hasSpawnedSubAgents) && (
              <button
                className={`${styles['sub-agent-collapse-toggle']} ${hasSpawnedSubAgents && isSubAgentsCollapsed ? styles['sub-agent-collapse-toggle-is-collapsed'] : ''}`}
                onClick={hasSpawnedSubAgents && onToggleSubAgents ? (event: React.MouseEvent) => {
                  event.stopPropagation();
                  onToggleSubAgents();
                } : undefined}
                title={hasSpawnedSubAgents && onToggleSubAgents
                  ? (isSubAgentsCollapsed ? 'Show sub-agents' : 'Hide sub-agents')
                  : 'Parent Agent (spawned sub-agents)'}
                aria-expanded={hasSpawnedSubAgents ? !isSubAgentsCollapsed : undefined}
                aria-label={hasSpawnedSubAgents
                  ? (isSubAgentsCollapsed ? 'Expand sub-agent tree' : 'Collapse sub-agent tree')
                  : 'Parent agent'}
                style={!hasSpawnedSubAgents || !onToggleSubAgents ? { cursor: 'default' } : undefined}
              >
                <span className={styles['parent-agent-emoji']}>
                  {hasSpawnedSubAgents && isSubAgentsCollapsed ? '📁' : '📂'}
                </span>
              </button>
            )}
            {item.parentConversationId && (
              <span className={styles['sub-agent-hat-emoji']} title="Sub-Agent">
                {resolveSubAgentEmoji(subAgentDepth ?? 1)}{subAgentNumber != null && (
                  <span className={styles['sub-agent-number']}>{subAgentNumber}</span>
                )}
              </span>
            )}
            {item.parentConversationId && subAgentDepth != null && subAgentDepth > 0 && (
              <span className={styles['sub-agent-depth-emoji']} title={`Nesting Depth: ${subAgentDepth}`}>
                🪜<span className={styles['sub-agent-depth-number']}>{subAgentDepth}</span>
              </span>
            )}
          </div>
        )}

        {/* Row 4: tool badge row */}
        {!isCondensed && hasActiveTools && (
          <ModelToolsRow tools={modalities} variant="condensed" />
        )}

        {/* Row 5: very bottom row - modalities (left) & cost badge (right) */}
        {!isCondensed &&
          (hasInputOutputModalities ||
            (item.totalCost !== undefined && item.totalCost > 0)) && (
            <div className={styles['bottom-layout-row']}>
              <div className={styles['bottom-left']}>
                {hasInputOutputModalities && (
                  <ModalityIconComponent modalities={modalities} />
                )}
              </div>
              <BadgeComponent
                type="cost"
                cost={item.totalCost ?? 0}
                showIcon={false}
              />
            </div>
          )}

        {children}
      </div>
      {/* Actions */}
      <div className={styles['actions']}>
        {onDownload && (
          <IconButtonComponent
            icon={<Download size={12} />}
            onClick={(event: React.MouseEvent) => {
              event.stopPropagation();
              onDownload(item.id);
            }}
            tooltip="Download"
            hoverReveal
          />
        )}
        {onCopy && (
          <IconButtonComponent
            icon={<Copy size={12} />}
            onClick={(event: React.MouseEvent) => {
              event.stopPropagation();
              onCopy(item.id);
            }}
            tooltip="Copy"
            hoverReveal
          />
        )}
        {!readOnly && !admin && !item.parentConversationId && onDelete && (
          <IconButtonComponent
            icon={<Trash2 size={12} />}
            onClick={(event: React.MouseEvent) => {
              event.stopPropagation();
              onDelete(item.id);
            }}
            tooltip="Delete"
            variant="destructive"
            hoverReveal
          />
        )}
        {onOpenInNewTab && (
          <IconButtonComponent
            icon={<ExternalLink size={12} />}
            onClick={(event: React.MouseEvent) => {
              event.stopPropagation();
              onOpenInNewTab(item);
            }}
            tooltip="Open in New Tab"
            hoverReveal
          />
        )}
      </div>
      {/* ── Inline progress bar ── */}
      {isInlineProgressActive && (
        <div
          className={`${styles['inline-progress-bar-track']}${isActive ? ` ${styles['inline-progress-bar-track-is-active-conversation']}` : ''}`}
          style={localTrackStyle}
        >
          <div
            className={`${styles['inline-progress-bar-fill']}${isActive ? ` ${styles['inline-progress-bar-fill-is-active-conversation']}` : ''}`}
            style={localFillStyle}
          />
        </div>
      )}
    </div>
  );
}
