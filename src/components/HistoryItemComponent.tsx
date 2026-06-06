"use client";

import { Download, Copy, Star, Trash2, ExternalLink } from "lucide-react";

import ModalityIconComponent from "./ModalityIconComponent";
import { ModelToolsRow } from "./ToolBadgeComponent";

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
  parentAgentSessionId?: string | null;
}

interface HistoryItemProps {
  item: HistoryItem;
  isActive?: boolean;
  onClick?: (item: HistoryItem) => void;
  onDelete?: (id: string) => void;
  onDownload?: (id: string) => void;
  onCopy?: (id: string) => void;
  icon?: LucideIcon;
  readOnly?: boolean;
  admin?: boolean;
  isNew?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  className?: string;
  dataPanelClose?: boolean;
  onOpenInNewTab?: (item: HistoryItem) => void;
  isGenerating?: boolean;
  isCondensed?: boolean;
  children?: React.ReactNode;
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
      className={`${styles['item']} ${isActive ? styles['is-active-state'] : ""} ${className || ""}`}
      {...SoundService.interactive(() => onClick?.(item))}
      {...(dataPanelClose ? { "data-panel-close-trigger": true } : {})}
      onContextMenu={
        onOpenInNewTab
          ? (e: React.MouseEvent) => {
              // Only show custom context on right-click of the main item area
              // (not on action buttons which have their own handlers)
              if ((e.target as HTMLElement).closest?.(`.${styles['actions']}`))
                return;
              e.preventDefault();
              onOpenInNewTab(item);
            }
          : undefined
      }
    >
      {onToggleFavorite && (
        <button
          className={`${styles['favorite-button']} ${isFavorite ? styles['favorite-button-active'] : ""}`}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onToggleFavorite(item.id);
          }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star size={12} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}
      <div className={styles['content']}>
        {/* Row 1: time + tags (left) · agentBadge + cost (right) */}
        <div className={styles['top-row']}>
          <div className={styles['top-left']}>
            <BadgeComponent type="dateTime" date={itemDate} />
            {admin &&
              item.username &&
              item.username !== "unknown" &&
              item.username !== "anonymous" && (
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
                if (!agentId || agentId === "NONE") return null;

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
            {item.parentAgentSessionId && (
              <span className={styles['worker-hat-emoji']} title="Worker/Sub Agent">
                👷
              </span>
            )}
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
                    ? (item.modelNames!.filter(Boolean) as string[])
                    : ([item.modelName].filter(Boolean) as string[])
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

        {/* Row 4: tool badge row */}
        {!isCondensed && hasActiveTools && (
          <ModelToolsRow tools={modalities} variant="condensed" />
        )}

        {/* Row 5: very bottom row - modalities (left) & cost badge (right) */}
        {!isCondensed &&
          (hasInputOutputModalities ||
            (item.totalCost !== undefined && item.totalCost > 0)) && (
            <div className={styles['bottom-row']}>
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
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDownload(item.id);
            }}
            tooltip="Download"
            hoverReveal
          />
        )}
        {onCopy && (
          <IconButtonComponent
            icon={<Copy size={12} />}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCopy(item.id);
            }}
            tooltip="Copy"
            hoverReveal
          />
        )}
        {!readOnly && !admin && onDelete && (
          <IconButtonComponent
            icon={<Trash2 size={12} />}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
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
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
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
