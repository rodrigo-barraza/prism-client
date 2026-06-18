"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import PrismService from "../services/PrismService";
import ToolsApiService from "../services/ToolsApiService";
import ToolDetailModalComponent, {
  type ToolDetailStats,
} from "./ToolDetailModalComponent";
import type { ToolSchema } from "../types/types";
import styles from "./ToolLinkComponent.module.css";

interface ToolLinkComponentProps {
  toolName: string;
  children?: React.ReactNode;
}

interface AgentMinimal {
  id: string;
  name: string;
  enabledToolNames?: string[];
  toolCount?: number;
}

interface ExtendedToolStats extends ToolDetailStats {
  topModels?: { model: string; provider: string; count: number }[];
  topAgents?: { agent: string; count: number }[];
  avgLatency?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  successCount?: number;
  failureCount?: number;
  firstUsed?: string;
  lastUsed?: string;
  minLatency?: number;
  maxLatency?: number;
  errorRate?: number;
  totalTransferBytes?: number;
}

export default function ToolLinkComponent({
  toolName,
  children,
}: ToolLinkComponentProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalData, setModalData] = useState<{
    tool: ToolSchema;
    agents: { id: string; name: string }[];
    stats: ToolDetailStats;
    allTools: ToolSchema[];
  } | null>(null);

  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (modalData) {
      setIsModalOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const [
        toolSchemas,
        agentPersonasList,
        prismToolStatistics,
        toolCallApiStatistics,
      ] = await Promise.all([
        PrismService.getBuiltInToolSchemas(undefined),
        PrismService.getAgentPersonas().catch(() => []),
        PrismService.getToolStats().catch(() => []),
        ToolsApiService.getToolCallStats().catch(() => null) as Promise<{
          byTool?: Array<{
            toolName: string;
            count: number;
            avgMs: number;
            minMs: number;
            maxMs: number;
            errorRate: number;
            totalTransferBytes: number;
          }>;
        } | null>,
      ]);

      const matchedToolSchema = (toolSchemas || []).find(
        (toolItem) => toolItem.name.toLowerCase() === toolName.toLowerCase(),
      );

      if (!matchedToolSchema) {
        console.error(`Tool not found: ${toolName}`);
        setIsLoading(false);
        return;
      }

      // Build tool-agent mapping
      const enabledToolAgents = ((agentPersonasList as AgentMinimal[]) || [])
        .filter((agent) => {
          if (!agent.enabledToolNames) return false;
          if (agent.enabledToolNames.includes("*")) return false;
          return agent.enabledToolNames.includes(matchedToolSchema.name);
        })
        .map((agent) => ({ id: agent.id, name: agent.name }));

      // Build stats
      const toolStatsMap: Record<string, ExtendedToolStats> = {};
      for (const statistics of prismToolStatistics || []) {
        toolStatsMap[statistics.tool] = statistics;
      }
      if (toolCallApiStatistics && toolCallApiStatistics.byTool) {
        for (const toolStat of toolCallApiStatistics.byTool) {
          const toolNameKey = toolStat.toolName;
          const existingStats = toolStatsMap[toolNameKey] || {};
          toolStatsMap[toolNameKey] = {
            ...existingStats,
            tool: toolNameKey,
            totalCalls: toolStat.count,
            avgLatency: toolStat.avgMs,
            minLatency: toolStat.minMs,
            maxLatency: toolStat.maxMs,
            errorRate: toolStat.errorRate,
            totalTransferBytes: toolStat.totalTransferBytes,
          };
        }
      }

      const finalToolStats =
        toolStatsMap[matchedToolSchema.name] || ({} as ToolDetailStats);

      setModalData({
        tool: matchedToolSchema,
        agents: enabledToolAgents,
        stats: finalToolStats,
        allTools: toolSchemas || [],
      });
      setIsModalOpen(true);
    } catch (error) {
      console.error("Failed to load tool details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={styles["tool-link-button"]}
        onClick={handleClick}
        disabled={isLoading}
      >
        {children || toolName}
        {isLoading && <span className={styles["is-loading-state-spinner-element"]} />}
      </button>

      {isModalOpen &&
        modalData &&
        createPortal(
          <ToolDetailModalComponent
            tool={modalData.tool}
            agents={modalData.agents}
            stats={modalData.stats}
            allTools={modalData.allTools}
            onClose={handleClose}
          />,
          document.body,
        )}
    </>
  );
}
