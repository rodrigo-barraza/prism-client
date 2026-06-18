"use client";

import React from "react";
import {
  Type,
  Image,
  Volume2,
  Video,
  FileText as DocIcon,
  Hash,
} from "lucide-react";
import { BadgeComponent } from "@rodrigo-barraza/components-library";
import { MODALITY_COLORS } from "./WorkflowNodeConstantsComponent";
import styles from "./ModalityIconComponent.module.css";

interface ModalityDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number }>;
  color: string;
}

/**
 * INPUT_MODALITIES / OUTPUT_MODALITIES — data-driven icon definitions
 * for input and output modality badges. Modalities only — no tools.
 */
const INPUT_MODALITIES: ModalityDef[] = [
  {
    key: "textIn",
    label: "Text input",
    icon: Type,
    color: MODALITY_COLORS.text,
  },
  {
    key: "imageIn",
    label: "Image input",
    icon: Image,
    color: MODALITY_COLORS.image,
  },
  {
    key: "audioIn",
    label: "Audio input",
    icon: Volume2,
    color: MODALITY_COLORS.audio,
  },
  {
    key: "videoIn",
    label: "Video input",
    icon: Video,
    color: MODALITY_COLORS.video,
  },
  {
    key: "docIn",
    label: "Document input",
    icon: DocIcon,
    color: MODALITY_COLORS.pdf,
  },
];

const OUTPUT_MODALITIES: ModalityDef[] = [
  {
    key: "textOut",
    label: "Text output",
    icon: Type,
    color: MODALITY_COLORS.text,
  },
  {
    key: "imageOut",
    label: "Image output",
    icon: Image,
    color: MODALITY_COLORS.image,
  },
  {
    key: "audioOut",
    label: "Audio output",
    icon: Volume2,
    color: MODALITY_COLORS.audio,
  },
  {
    key: "embeddingOut",
    label: "Embedding output",
    icon: Hash,
    color: MODALITY_COLORS.embedding,
  },
];

export interface ModalityIconProps {
  modalities?: Record<string, number | boolean> | null;
  size?: number;
  className?: string;
}

function buildTooltipContent(
  activeInputs: ModalityDef[],
  activeOutputs: ModalityDef[],
): React.ReactNode {
  const inputLabels = activeInputs.map((definition) => definition.label);
  const outputLabels = activeOutputs.map((definition) => definition.label);
  const lines: string[] = [];
  if (inputLabels.length > 0) lines.push(`In: ${inputLabels.join(", ")}`);
  if (outputLabels.length > 0) lines.push(`Out: ${outputLabels.join(", ")}`);
  return lines.join(" · ");
}

/**
 * ModalityIconComponent — renders a compact row of input → output modality
 * icons inside a BadgeComponent pill. Modalities only — tool capabilities
 * are rendered by ModelToolsRow (ToolBadgeComponent).
 *
 * Props:
 *   modalities  — object with boolean keys (textIn, imageIn, textOut, etc.)
 *   size        — icon size in px (default 11)
 *   className   — extra root class name
 */
export default function ModalityIconComponent({
  modalities,
  size = 11,
  className,
}: ModalityIconProps) {
  if (!modalities) return null;

  const activeInputs = INPUT_MODALITIES.filter(
    (modality) => modalities[modality.key],
  );
  const activeOutputs = OUTPUT_MODALITIES.filter(
    (modality) => modalities[modality.key],
  );
  const hasInputs = activeInputs.length > 0;
  const hasOutputs = activeOutputs.length > 0;

  if (!hasInputs && !hasOutputs) return null;

  const tooltipContent = buildTooltipContent(activeInputs, activeOutputs);

  const renderIcon = (definition: ModalityDef) => {
    const Icon = definition.icon;
    return (
      <span
        key={definition.key}
        className={styles['modality-icon']}
        style={{ color: definition.color }}
      >
        <Icon size={size} />
      </span>
    );
  };

  return (
    <div className={`modality-icon-component ${styles['modalities-layout-row']} ${className || ""}`}>
      <BadgeComponent variant="modality" tooltip={tooltipContent}>
        {activeInputs.map(renderIcon)}
        {hasInputs && hasOutputs && (
          <span className={styles['modality-arrow']}>→</span>
        )}
        {activeOutputs.map(renderIcon)}
      </BadgeComponent>
    </div>
  );
}
