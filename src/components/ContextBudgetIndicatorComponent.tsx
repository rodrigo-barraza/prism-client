"use client";

import { useMemo } from "react";
import type { ContextBudget } from "../types/types";
import styles from "./ContextBudgetIndicatorComponent.module.css";

interface ContextBudgetIndicatorComponentProps {
  contextBudget: ContextBudget;
  estimatedDraftTokens?: number;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

interface BudgetCategory {
  key: string;
  label: string;
  tokens: number;
  segmentClass: string;
  dotClass: string;
}

export default function ContextBudgetIndicatorComponent({
  contextBudget,
  estimatedDraftTokens = 0,
}: ContextBudgetIndicatorComponentProps) {
  const {
    contextWindow,
    messageTokens,
    systemPromptTokens,
    toolSchemaTokens,
    skillTokens = 0,
    totalInputTokens,
    availableOutputTokens,
    isClamped,
    toolCount,
    source,
  } = contextBudget;

  const isBaselineMode = messageTokens === 0;

  const utilizationPercentage = useMemo(
    () => Math.min((totalInputTokens / contextWindow) * 100, 100),
    [totalInputTokens, contextWindow],
  );

  // Categories in Claude Code display order:
  // System prompt → System tools → Skills → Messages (→ Draft)
  const categories = useMemo<BudgetCategory[]>(() => {
    const list: BudgetCategory[] = [
      {
        key: "system-prompt",
        label: "System prompt",
        tokens: systemPromptTokens,
        segmentClass: styles["segment-system-prompt"],
        dotClass: styles["legend-dot-system"],
      },
      {
        key: "system-tools",
        label: toolCount > 0 ? `System tools (${toolCount})` : "System tools",
        tokens: toolSchemaTokens,
        segmentClass: styles["segment-tool-schemas"],
        dotClass: styles["legend-dot-tools"],
      },
      {
        key: "skills",
        label: "Skills",
        tokens: skillTokens,
        segmentClass: styles["segment-skills"],
        dotClass: styles["legend-dot-skills"],
      },
      {
        key: "messages",
        label: "Messages",
        tokens: isBaselineMode ? 0 : messageTokens,
        segmentClass: styles["segment-messages"],
        dotClass: styles["legend-dot-messages"],
      },
    ];
    if (estimatedDraftTokens > 0) {
      list.push({
        key: "draft",
        label: "Draft (est.)",
        tokens: estimatedDraftTokens,
        segmentClass: styles["segment-draft-input"],
        dotClass: styles["legend-dot-draft"],
      });
    }
    return list;
  }, [
    systemPromptTokens,
    toolSchemaTokens,
    skillTokens,
    messageTokens,
    isBaselineMode,
    toolCount,
    estimatedDraftTokens,
  ]);

  const visibleCategories = categories.filter(
    (category) => category.tokens > 0,
  );

  const severityLevel = useMemo(() => {
    if (utilizationPercentage >= 85 || isClamped) return "critical";
    if (utilizationPercentage >= 65) return "warning";
    return "nominal";
  }, [utilizationPercentage, isClamped]);

  const percentageOf = (tokens: number) =>
    ((tokens / contextWindow) * 100).toFixed(1);

  return (
    <div
      className={styles["context-budget-indicator"]}
      data-severity={severityLevel}
      data-baseline={isBaselineMode || undefined}
    >
      <div className={styles["context-budget-header"]}>
        <span className={styles["context-budget-usage"]}>
          {formatTokenCount(totalInputTokens)}{" "}
          <span className={styles["context-budget-separator"]}>/</span>{" "}
          {formatTokenCount(contextWindow)} tokens{" "}
          <span className={styles["context-budget-percent"]}>
            ({Math.round(utilizationPercentage)}%)
          </span>
          {isClamped && (
            <span className={styles["context-budget-clamped-badge"]}>
              clamped
            </span>
          )}
        </span>

        <span className={styles["context-budget-header-right"]}>
          <span className={styles["context-budget-available"]}>
            {formatTokenCount(availableOutputTokens)} free
          </span>
          {isBaselineMode ? (
            <span
              className={styles["context-budget-source-badge"]}
              data-source="baseline"
            >
              ◈ baseline
            </span>
          ) : (
            source && (
              <span
                className={styles["context-budget-source-badge"]}
                data-source={source}
              >
                {source === "reported" ? "✓ real" : "~ est"}
              </span>
            )
          )}
        </span>
      </div>

      <div className={styles["context-budget-bar"]}>
        {visibleCategories.map((category) => (
          <div
            key={category.key}
            className={category.segmentClass}
            style={{ width: `${(category.tokens / contextWindow) * 100}%` }}
            title={`${category.label}: ${formatTokenCount(category.tokens)} tokens (${percentageOf(category.tokens)}%)`}
          />
        ))}
      </div>

      <div className={styles["context-budget-legend"]}>
        {visibleCategories.map((category) => (
          <div
            key={category.key}
            className={styles["legend-item"]}
            title={`${percentageOf(category.tokens)}% of context window`}
          >
            <span className={`${styles["legend-dot"]} ${category.dotClass}`} />
            <span className={styles["legend-label"]}>{category.label}</span>
            <span className={styles["legend-count"]}>
              {formatTokenCount(category.tokens)}
            </span>
          </div>
        ))}
        <div
          className={`${styles["legend-item"]} ${styles["legend-item-free"]}`}
          title={`${percentageOf(Math.max(contextWindow - totalInputTokens, 0))}% of context window`}
        >
          <span
            className={`${styles["legend-dot"]} ${styles["legend-dot-free"]}`}
          />
          <span className={styles["legend-label"]}>Free space</span>
          <span className={styles["legend-count"]}>
            {formatTokenCount(Math.max(contextWindow - totalInputTokens, 0))}
          </span>
        </div>
      </div>
    </div>
  );
}
