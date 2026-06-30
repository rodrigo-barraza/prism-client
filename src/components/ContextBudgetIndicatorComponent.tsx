"use client";

import { useMemo } from "react";
import type { ContextBudget } from "../types/types";
import styles from "./ContextBudgetIndicatorComponent.module.css";

interface ContextBudgetIndicatorComponentProps {
  contextBudget: ContextBudget;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

export default function ContextBudgetIndicatorComponent({
  contextBudget,
}: ContextBudgetIndicatorComponentProps) {
  const {
    contextWindow,
    messageTokens,
    systemPromptTokens,
    toolSchemaTokens,
    totalInputTokens,
    availableOutputTokens,
    isClamped,
    toolCount,
    source,
  } = contextBudget;

  const utilizationPercentage = useMemo(
    () => Math.min((totalInputTokens / contextWindow) * 100, 100),
    [totalInputTokens, contextWindow],
  );

  const segmentPercentages = useMemo(() => {
    const messagesPercent = (messageTokens / contextWindow) * 100;
    const systemPercent = (systemPromptTokens / contextWindow) * 100;
    const toolsPercent = (toolSchemaTokens / contextWindow) * 100;
    const outputPercent = (availableOutputTokens / contextWindow) * 100;
    return { messagesPercent, systemPercent, toolsPercent, outputPercent };
  }, [messageTokens, systemPromptTokens, toolSchemaTokens, availableOutputTokens, contextWindow]);

  const severityLevel = useMemo(() => {
    if (utilizationPercentage >= 85 || isClamped) return "critical";
    if (utilizationPercentage >= 65) return "warning";
    return "nominal";
  }, [utilizationPercentage, isClamped]);
  return (
    <div
      className={styles["context-budget-indicator"]}
      data-severity={severityLevel}
    >
      <div className={styles["context-budget-bar"]}>
        <div
          className={styles["segment-messages"]}
          style={{ width: `${segmentPercentages.messagesPercent}%` }}
          title={`Messages: ${formatTokenCount(messageTokens)} tokens`}
        />
        <div
          className={styles["segment-system-prompt"]}
          style={{ width: `${segmentPercentages.systemPercent}%` }}
          title={`System prompt: ${formatTokenCount(systemPromptTokens)} tokens`}
        />
        <div
          className={styles["segment-tool-schemas"]}
          style={{ width: `${segmentPercentages.toolsPercent}%` }}
          title={`Tool schemas (${toolCount}): ${formatTokenCount(toolSchemaTokens)} tokens`}
        />
      </div>

      <div className={styles["context-budget-legend"]}>
        <div className={styles["legend-item"]}>
          <span className={`${styles["legend-dot"]} ${styles["legend-dot-messages"]}`} />
          <span>Messages ({formatTokenCount(messageTokens)})</span>
        </div>
        <div className={styles["legend-item"]}>
          <span className={`${styles["legend-dot"]} ${styles["legend-dot-system"]}`} />
          <span>System ({formatTokenCount(systemPromptTokens)})</span>
        </div>
        {toolCount > 0 && (
          <div className={styles["legend-item"]}>
            <span className={`${styles["legend-dot"]} ${styles["legend-dot-tools"]}`} />
            <span>Tools ({toolCount}: {formatTokenCount(toolSchemaTokens)})</span>
          </div>
        )}
      </div>

      <div className={styles["context-budget-labels"]}>
        <span className={styles["context-budget-usage"]}>
          {formatTokenCount(totalInputTokens)}{" "}
          <span className={styles["context-budget-separator"]}>/</span>{" "}
          {formatTokenCount(contextWindow)}
          {isClamped && (
            <span className={styles["context-budget-clamped-badge"]}>clamped</span>
          )}
        </span>

        <span className={styles["context-budget-available"]}>
          {formatTokenCount(availableOutputTokens)} available
        </span>
        {source && (
          <span
            className={styles["context-budget-source-badge"]}
            data-source={source}
          >
            {source === "reported" ? "✓ real" : "~ est"}
          </span>
        )}
      </div>
    </div>
  );
}
