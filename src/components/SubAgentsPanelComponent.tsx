"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import {
  Users,
  RefreshCw,
  Wrench,
  Clock,
  GitBranch,
  FileCode,
  Layers,
} from "lucide-react";
import { POLL_FAST } from "@rodrigo-barraza/utilities-library";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import { renderToolName, formatDuration } from "@rodrigo-barraza/utilities-library";
import ModalityIconComponent from "./ModalityIconComponent";
import BadgeComponent from "./BadgeComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import type { SubAgentToolActivityItem } from "./MessageListComponent";
import type { CoordinatorSubAgent } from "../types/types";
import styles from "./SubAgentsPanelComponent.module.css";

const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  complete: "Complete",
  failed: "Failed",
  stopped: "Stopped",
  pending: "Pending",
};

const STATUS_CLASS: Record<string, string> = {
  running: "status-running",
  complete: "status-complete",
  failed: "status-failed",
  stopped: "status-stopped",
  pending: "status-pending",
};

const CARD_CLASS: Record<string, string> = {
  running: "sub-agent-card-running",
  complete: "sub-agent-card-complete",
  failed: "sub-agent-card-failed",
  stopped: "sub-agent-card-stopped",
};

function getAgentNumber(agentId: string | undefined) {
  const match =
    typeof agentId === "string" ? agentId.match(/agent-([a-zA-Z0-9_]+)/) : null;
  return match ? match[1].toUpperCase() : agentId;
}

export default function SubAgentsPanel({
  conversationId,
  refreshKey,
  onCountChange,
  onMaxDepthChange,
  onActionsChange,
  subAgentToolActivity = {},
}: {
  conversationId: string;
  refreshKey?: number;
  onCountChange?: (count: number) => void;
  onMaxDepthChange?: (depth: number) => void;
  onActionsChange?: (actions: ReactNode) => void;
  subAgentToolActivity?: Record<string, SubAgentToolActivityItem>;
}) {
  const [subAgents, setSubAgents] = useState<CoordinatorSubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef<boolean>(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- Load --------------------------------------------------

  const loadSubAgents = useCallback(async () => {
    if (!hasData.current) setLoading(true);
    setError(null);
    try {
      const result = await PrismService.getCoordinatorSubAgents(conversationId);
      const list = result.subAgents || [];
      setSubAgents(list);
      onCountChange?.(list.length);
      onMaxDepthChange?.(
        list.reduce((maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0), 0),
      );
      hasData.current = true;
    } catch (error: unknown) {
      console.error("Failed to load sub-agents:", error);
      if (!hasData.current) setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [conversationId, onCountChange, onMaxDepthChange]);

  // Reset on conversation change
  useEffect(() => {
    hasData.current = false;
    setSubAgents([]);
  }, [conversationId]);

  // Initial load + external refresh
  useEffect(() => {
    loadSubAgents();
  }, [loadSubAgents, refreshKey]);

  // Auto-poll while any sub-agent is running (every 3s)
  useEffect(() => {
    const hasRunning = subAgents.some((subAgentItem) => subAgentItem.status === "running");

    if (hasRunning) {
      pollRef.current = setInterval(loadSubAgents, POLL_FAST);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [subAgents, loadSubAgents]);

  // -- Push header action buttons to parent SidebarTabHeader ---
  useEffect(() => {
    onActionsChange?.(
      <ButtonComponent
        variant="text"
        size="small"
        icon={RefreshCw}
        iconSize={11}
        onClick={loadSubAgents}
        disabled={loading}
        title="Refresh sub-agents"
      />,
    );
  }, [onActionsChange, loadSubAgents, loading]);

  // Clear actions on unmount
  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Loading -------------------------------------------------

  if (loading) {
    return (
      <div className={styles['container']}>
        <PanelLoadingSpinner />
      </div>
    );
  }

  // -- Error --------------------------------------------------

  if (error) {
    return (
      <div className={styles['container']}>
        <div className={styles['error']}>Failed to load sub-agents: {error}</div>
      </div>
    );
  }

  // ═══ Render ═══════════════════════════════════════════════

  return (
    <div className={`sub-agents-panel-component ${styles['container']}`}>
      {/* -- Empty ------------------------------------------- */}
      {subAgents.length === 0 && (
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']}>
            <Users size={24} />
          </div>
          <div className={styles['empty-title']}>No sub-agents</div>
          <div className={styles['empty-subtitle']}>
            Sub-agents are spawned by the coordinator when it decomposes tasks into
            parallel sub-agents. Use the
            <strong> team_create</strong> tool to create sub-agents.
          </div>
        </div>
      )}

      {/* -- Sub-agent list ------------------------------------ */}
      {subAgents.map((subAgent) => {
        const statusLabel = STATUS_LABEL[subAgent.status] || subAgent.status;
        const statusClass = STATUS_CLASS[subAgent.status] || "status-pending";
        const cardClass = CARD_CLASS[subAgent.status] || "";
        const isLive = subAgent.status === "running";
        const isComplete = subAgent.status === "complete";

        // Sub-agents are text-in → text-out agents
        const subAgentModalities = { textIn: true, textOut: true };

        return (
          <div
            key={subAgent.agentId}
            className={`${styles['sub-agent-card']} ${cardClass ? styles[cardClass] : ""}`}
          >
            {/* -- Title row (HistoryItem-style) --------------- */}
            <div className={styles['title-layout-row']}>
              <span className={styles['agent-badge']}>
                Agent {getAgentNumber(subAgent.agentId)}
              </span>
              {typeof subAgent.recursionDepth === "number" && subAgent.recursionDepth > 0 && (
                <span className={styles['depth-badge']}>
                  <Layers size={9} />
                  Depth {subAgent.recursionDepth}
                </span>
              )}
              <span className={`${styles['sub-agent-status']} ${styles[statusClass]}`}>
                {statusLabel}
              </span>
            </div>

            {/* Description */}
            {subAgent.description && (
              <div className={styles['sub-agent-description']}>
                {subAgent.description}
              </div>
            )}

            {/* -- Meta row (time, cost — HistoryItem-style) -- */}
            <div className={styles['meta']}>
              {(subAgent.durationMs ?? 0) > 0 && (
                <span
                  className={`${styles['meta-item']} ${isLive ? styles['duration-live'] : ""}`}
                >
                  <Clock size={10} />
                  {formatDuration(subAgent.durationMs ?? 0)}
                </span>
              )}
              <BadgeComponent
                type="cost"
                cost={subAgent.totalCost}
                mini
                showIcon={false}
              />
              {/* Live tool count from SSE (or fallback to API count) */}
              {(() => {
                const subAgentAgentId = subAgent.agentId ?? subAgent.id;
                const liveActivity = subAgentToolActivity[subAgentAgentId];
                const toolCount = Math.max(
                  liveActivity?.toolCount || 0,
                  subAgent.toolCallCount || 0,
                );
                return toolCount > 0 ? (
                  <span className={styles['meta-item']}>
                    <Wrench size={10} />
                    {toolCount} tool{toolCount !== 1 ? "s" : ""}
                  </span>
                ) : null;
              })()}
              {subAgent.branchName && (
                <span className={styles['meta-item']}>
                  <GitBranch size={10} />
                  {subAgent.branchName}
                </span>
              )}
            </div>

            {/* -- Model badge ---------------------------------- */}
            {subAgent.resolvedModel && (
              <BadgeComponent
                type="model"
                models={[subAgent.resolvedModel.replace(/-\d{8}$/, "")]}
                provider={subAgent.provider}
                mini
                className={styles['model-badge']}
              />
            )}

            {/* -- Modality icons ------------------------------- */}
            {isComplete && (
              <ModalityIconComponent modalities={subAgentModalities} size={10} />
            )}

            {/* -- Live tool activity (SSE-driven) -------------- */}
            {isLive && (() => {
              const subAgentAgentId = subAgent.agentId ?? subAgent.id;
              const activity = subAgentToolActivity[subAgentAgentId];
              if (!activity?.currentTool) return null;
              return (
                <div className={styles['live-activity']}>
                  <span className={styles['live-dot']} />
                  <Wrench size={9} />
                  <span className={styles['live-tool-name']}>
                    {renderToolName(activity.currentTool)}
                  </span>
                  {(activity.iteration ?? 0) > 0 && (
                    <span className={styles['live-iteration']}>
                      iter {activity.iteration}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* -- Tool names breakdown ─────────────────────── */}
            {subAgent.toolNames && Object.keys(subAgent.toolNames).length > 0 && (
              <div className={styles['tool-names-row']}>
                {Object.entries(subAgent.toolNames)
                  .sort(([, countA], [, countB]) => countB - countA)
                  .map(([toolName, callCount]) => (
                    <span key={toolName} className={styles['tool-name-pill']}>
                      {renderToolName(toolName)}
                      {callCount > 1 && (
                        <span className={styles['tool-name-count']}>×{callCount}</span>
                      )}
                    </span>
                  ))}
              </div>
            )}

            {/* Files */}
            {(subAgent.files?.length ?? 0) > 0 && (
              <div className={styles['sub-agent-files']}>
                {subAgent.files!.map((filePath: string, fileIndex: number) => (
                  <span key={fileIndex} className={styles['sub-agent-file']} title={filePath}>
                    <FileCode
                      size={9}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: 2,
                      }}
                    />
                    {filePath.split("/").pop()}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
