"use client";

import { GitBranch } from "lucide-react";
import type { ForkLineage } from "../types/types";
import styles from "./ForkLineageComponent.module.css";

/**
 * "Forked from <source>" — a bar under the chat header of a forked
 * conversation; clicking it opens the source conversation.
 */
export default function ForkLineageComponent({
  lineage,
  onOpenSource,
}: {
  lineage: ForkLineage | null | undefined;
  onOpenSource?: (_conversationId: string) => void;
}) {
  if (!lineage) return null;
  const sourceTitle = lineage.title || "another conversation";
  const verb = lineage.position === "before" ? "Edited branch of" : "Forked from";
  const label = `${verb} ${sourceTitle}`;
  return (
    <div className={`fork-lineage-component ${styles['bar']}`}>
      <button
        type="button"
        className={styles['lineage']}
        onClick={() => onOpenSource?.(lineage.conversationId)}
        title={`${label} — open the original`}
        aria-label={`${label} — open the original`}
      >
        <GitBranch size={12} aria-hidden="true" />
        <span className={styles['label']}>
          {verb} <span className={styles['source']}>{sourceTitle}</span>
        </span>
      </button>
    </div>
  );
}
