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
import { EXECUTION_STATUS } from "../constants.ts";
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

const EXECUTION_STATUS_LABELS: Record<string, string> = {
  [EXECUTION_STATUS.RUNNING]: "Running",
  [EXECUTION_STATUS.COMPLETE]: "Complete",
  [EXECUTION_STATUS.COMPLETED]: "Complete",
  [EXECUTION_STATUS.FAILED]: "Failed",
  [EXECUTION_STATUS.STOPPED]: "Stopped",
  [EXECUTION_STATUS.PENDING]: "Pending",
};

const EXECUTION_STATUS_CLASSES: Record<string, string> = {
  [EXECUTION_STATUS.RUNNING]: "status-running",
  [EXECUTION_STATUS.COMPLETE]: "status-complete",
  [EXECUTION_STATUS.COMPLETED]: "status-complete",
  [EXECUTION_STATUS.FAILED]: "status-failed",
  [EXECUTION_STATUS.STOPPED]: "status-stopped",
  [EXECUTION_STATUS.PENDING]: "status-pending",
};

const CARD_STATE_CLASSES: Record<string, string> = {
  running: "sub-agent-card-running",
  complete: "sub-agent-card-complete",
  completed: "sub-agent-card-complete",
  failed: "sub-agent-card-failed",
  stopped: "sub-agent-card-stopped",
};


export default function SubAgentsPanelComponent({
  conversationId,
  refreshKey,
  onCountChange,
  onMaxDepthChange,
  onActionsChange,
  subAgentToolActivity = {},
}: {
  conversationId: string;
  refreshKey?: number;
  onCountChange?: (_count: number) => void;
  onMaxDepthChange?: (_depth: number) => void;
  onActionsChange?: (_actions: ReactNode) => void;
  subAgentToolActivity?: Record<string, SubAgentToolActivityItem>;
}) {
  const [subAgentList, setSubAgentList] = useState<CoordinatorSubAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasInitialDataBeenLoaded = useRef<boolean>(false);
  const pollingIntervalReference = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- Load --------------------------------------------------

  const fetchCoordinatorSubAgents = useCallback(async () => {
    if (!hasInitialDataBeenLoaded.current) {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const apiResponse = await PrismService.getCoordinatorSubAgents(conversationId);
      const subAgents = apiResponse.subAgents || [];
      setSubAgentList(subAgents);
      onCountChange?.(subAgents.length);
      onMaxDepthChange?.(
        subAgents.reduce((maximumDepth, subAgent) => Math.max(maximumDepth, subAgent.recursionDepth ?? 0), 0),
      );
      hasInitialDataBeenLoaded.current = true;
    } catch (error: unknown) {
      console.error("Failed to load sub-agents:", error);
      if (!hasInitialDataBeenLoaded.current) {
        setErrorMessage(getErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, onCountChange, onMaxDepthChange]);

  // Reset on conversation change
  useEffect(() => {
    hasInitialDataBeenLoaded.current = false;
    setSubAgentList([]);
  }, [conversationId]);

  // Initial load + external refresh
  useEffect(() => {
    fetchCoordinatorSubAgents();
  }, [fetchCoordinatorSubAgents, refreshKey]);

  // Auto-poll while any sub-agent is running (every 3s)
  useEffect(() => {
    const isAnySubAgentRunning = subAgentList.some(
      (subAgentItem) => subAgentItem.status === EXECUTION_STATUS.RUNNING,
    );

    if (isAnySubAgentRunning) {
      pollingIntervalReference.current = setInterval(fetchCoordinatorSubAgents, POLL_FAST);
    } else {
      if (pollingIntervalReference.current) {
        clearInterval(pollingIntervalReference.current);
      }
    }

    return () => {
      if (pollingIntervalReference.current) {
        clearInterval(pollingIntervalReference.current);
      }
    };
  }, [subAgentList, fetchCoordinatorSubAgents]);

  // -- Push header action buttons to parent SidebarTabHeader ---
  useEffect(() => {
    onActionsChange?.(
      <ButtonComponent
        variant="text"
        size="small"
        icon={RefreshCw}
        iconSize={11}
        onClick={fetchCoordinatorSubAgents}
        disabled={isLoading}
        title="Refresh sub-agents"
      />,
    );
  }, [onActionsChange, fetchCoordinatorSubAgents, isLoading]);

  // Clear actions on unmount
  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Loading -------------------------------------------------

  if (isLoading) {
    return (
      <div className={styles['container']}>
        <PanelLoadingSpinner />
      </div>
    );
  }

  // -- Error --------------------------------------------------

  if (errorMessage) {
    return (
      <div className={styles['container']}>
        <div className={styles['error']}>Failed to load sub-agents: {errorMessage}</div>
      </div>
    );
  }

  // ═══ Render ═══════════════════════════════════════════════

  return (
    <div className={`sub-agents-panel-component ${styles['container']}`}>
      {/* -- Empty ------------------------------------------- */}
      {subAgentList.length === 0 && (
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
      {subAgentList.map((subAgentItem, subAgentIndex) => {
        const executionStatusLabel = EXECUTION_STATUS_LABELS[subAgentItem.status] || subAgentItem.status;
        const executionStatusClass = EXECUTION_STATUS_CLASSES[subAgentItem.status] || "status-pending";
        const subAgentCardClass = CARD_STATE_CLASSES[subAgentItem.status] || "";
        const isSubAgentRunning = subAgentItem.status === EXECUTION_STATUS.RUNNING;
        const isSubAgentComplete = subAgentItem.status === EXECUTION_STATUS.COMPLETE || subAgentItem.status === EXECUTION_STATUS.COMPLETED;

        // Sub-agents are text-in → text-out agents
        const subAgentModalities = { textIn: true, textOut: true };

        return (
          <div
            key={subAgentItem.agentId}
            className={`${styles['sub-agent-card']} ${subAgentCardClass ? styles[subAgentCardClass] : ""}`}
          >
            {/* -- Title row (HistoryItem-style) --------------- */}
            <div className={styles['title-layout-row']}>
              <span className={styles['agent-badge']}>
                Agent {subAgentItem.globalSpawnIndex != null ? subAgentItem.globalSpawnIndex + 1 : subAgentIndex + 1}
              </span>
              {typeof subAgentItem.recursionDepth === "number" && subAgentItem.recursionDepth > 0 && (
                <span className={styles['depth-badge']}>
                  <Layers size={9} />
                  Depth {subAgentItem.recursionDepth}
                </span>
              )}
              <span className={`${styles['sub-agent-status']} ${styles[executionStatusClass]}`}>
                {executionStatusLabel}
              </span>
            </div>

            {/* Description */}
            {subAgentItem.description && (
              <div className={styles['sub-agent-description']}>
                {subAgentItem.description}
              </div>
            )}

            {/* -- Meta row (time, cost — HistoryItem-style) -- */}
            <div className={styles['meta']}>
              {(subAgentItem.durationMs ?? 0) > 0 && (
                <span
                  className={`${styles['meta-item']} ${isSubAgentRunning ? styles['duration-live'] : ""}`}
                >
                  <Clock size={10} />
                  {formatDuration(subAgentItem.durationMs ?? 0)}
                </span>
              )}
              <BadgeComponent
                type="cost"
                cost={subAgentItem.totalCost}
                mini
                showIcon={false}
              />
              {/* Live tool count from SSE (or fallback to API count) */}
              {(() => {
                const subAgentAgentId = subAgentItem.agentId ?? subAgentItem.id;
                const liveSubAgentActivity = subAgentToolActivity[subAgentAgentId];
                const totalToolCallCount = Math.max(
                  liveSubAgentActivity?.toolCount || 0,
                  subAgentItem.toolCallCount || 0,
                );
                return totalToolCallCount > 0 ? (
                  <span className={styles['meta-item']}>
                    <Wrench size={10} />
                    {totalToolCallCount} tool{totalToolCallCount !== 1 ? "s" : ""}
                  </span>
                ) : null;
              })()}
              {subAgentItem.branchName && (
                <span className={styles['meta-item']}>
                  <GitBranch size={10} />
                  {subAgentItem.branchName}
                </span>
              )}
            </div>

            {/* -- Model badge ---------------------------------- */}
            {subAgentItem.resolvedModel && (
              <BadgeComponent
                type="model"
                models={[subAgentItem.resolvedModel.replace(/-\d{8}$/, "")]}
                provider={subAgentItem.provider}
                mini
                className={styles['model-badge']}
              />
            )}

            {/* -- Modality icons ------------------------------- */}
            {isSubAgentComplete && (
              <ModalityIconComponent modalities={subAgentModalities} size={10} />
            )}

            {/* -- Live tool activity (SSE-driven) -------------- */}
            {isSubAgentRunning && (() => {
              const subAgentAgentId = subAgentItem.agentId ?? subAgentItem.id;
              const liveSubAgentActivity = subAgentToolActivity[subAgentAgentId];
              if (!liveSubAgentActivity?.currentTool) return null;
              return (
                <div className={styles['live-activity']}>
                  <span className={styles['live-dot']} />
                  <Wrench size={9} />
                  <span className={styles['live-tool-name']}>
                    {renderToolName(liveSubAgentActivity.currentTool)}
                  </span>
                  {(liveSubAgentActivity.iteration ?? 0) > 0 && (
                    <span className={styles['live-iteration']}>
                      iter {liveSubAgentActivity.iteration}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* -- Tool names breakdown ─────────────────────── */}
            {subAgentItem.toolNames && Object.keys(subAgentItem.toolNames).length > 0 && (
              <div className={styles['tool-names-row']}>
                {Object.entries(subAgentItem.toolNames)
                  .sort(([, countA], [, countB]) => countB - countA)
                  .map(([toolName, toolCallFrequency]) => (
                    <span key={toolName} className={styles['tool-name-pill']}>
                      {renderToolName(toolName)}
                      {toolCallFrequency > 1 && (
                        <span className={styles['tool-name-count']}>×{toolCallFrequency}</span>
                      )}
                    </span>
                  ))}
              </div>
            )}

            {/* Files */}
            {(subAgentItem.files?.length ?? 0) > 0 && (
              <div className={styles['sub-agent-files']}>
                {subAgentItem.files!.map((filePath: string, fileIndex: number) => (
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
