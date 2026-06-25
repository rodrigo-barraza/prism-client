"use client";

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
  isCondensed?: boolean;
  children?: React.ReactNode;
  subAgentNumber?: number | null;
  subAgentDepth?: number | null;
  hasSpawnedSubAgents?: boolean;
  isSubAgentsCollapsed?: boolean;
  onToggleSubAgents?: () => void;
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
  isCondensed = false,
  children,
  subAgentNumber,
  subAgentDepth,
  hasSpawnedSubAgents = false,
  isSubAgentsCollapsed = false,
  onToggleSubAgents,
}: HistoryItemProps) {
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
          {isGenerating && <span className={styles['generating-dot']} />}
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
    </div>
  );
}
