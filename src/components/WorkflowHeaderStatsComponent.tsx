"use client";

import { useMemo } from "react";
import type { ComponentType } from "react";
import { MessageSquare } from "lucide-react";
import ProviderLogo from "./ProviderLogosComponent";
import { MODALITY_ICONS } from "./WorkflowNodeConstantsComponent";
import type { WorkflowNode } from "../types/types";
import styles from "./WorkflowHeaderStatsComponent.module.css";

type ModalityKey = keyof typeof MODALITY_ICONS;

interface ModalityIconEntry {
  icon: ComponentType<{ size?: number; style?: React.CSSProperties; title?: string }>;
  label: string;
  color: string;
}

interface WorkflowModelEntry {
  provider: string;
  name: string;
}

interface WorkflowHeaderStatsProps {
  nodes?: WorkflowNode[];
  edgeCount?: number;
}

export default function WorkflowHeaderStatsComponent({
  nodes = [],
  edgeCount = 0,
}: WorkflowHeaderStatsProps) {
  const workflowStats = useMemo(() => {
    const modelNodes = nodes.filter((node) => !node.nodeType);
    const models: WorkflowModelEntry[] = [
      ...new Map(
        modelNodes.map((node) => [
          `${node.provider}:${node.modelName}`,
          { provider: node.provider || "", name: (node.displayName as string) || node.modelName || "" },
        ]),
      ).values(),
    ];
    const modalities = new Set<string>();
    for (const node of nodes) {
      if (node.nodeType === "input") {
        for (const modalityType of (node.outputTypes || [])) {
          if (modalityType !== "conversation") modalities.add(modalityType);
        }
      } else if (node.nodeType === "viewer") {
        for (const modalityType of (node.inputTypes || [])) {
          if (modalityType !== "conversation") modalities.add(modalityType);
        }
      }
    }
    const conversationCount = modelNodes.length;
    return { models, modalities: [...modalities], conversationCount };
  }, [nodes]);

  return (
    <>
      <span className={`workflow-header-stats-component ${styles['header-badge']}`}>
        {nodes.length} nodes · {edgeCount} edges
      </span>
      {workflowStats.modalities.length > 0 && (
        <span className={styles['header-badge']}>
          {workflowStats.modalities.map((modality) => {
            const iconEntry = MODALITY_ICONS[modality as ModalityKey] as ModalityIconEntry | undefined;
            if (!iconEntry) return null;
            const Icon = iconEntry.icon;
            return (
              <Icon
                key={modality}
                size={11}
                style={{ color: iconEntry.color }}
                title={iconEntry.label}
              />
            );
          })}
        </span>
      )}
      {workflowStats.models.length > 0 && (
        <span className={styles['header-badge']}>
          {workflowStats.models.map((modelEntry) => (
            <span
              key={`${modelEntry.provider}:${modelEntry.name}`}
              className={styles['header-model-tag']}
              title={modelEntry.name}
            >
              <ProviderLogo provider={modelEntry.provider} size={11} />
              {modelEntry.name}
            </span>
          ))}
        </span>
      )}
      {workflowStats.conversationCount > 0 && (
        <span
          className={styles['header-badge']}
          title="Conversations created per run"
        >
          <MessageSquare size={11} />
          {workflowStats.conversationCount}
        </span>
      )}
    </>
  );
}
