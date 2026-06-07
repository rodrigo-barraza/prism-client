"use client";

import {
  Trash2,
  User,
  MessageSquare,
  FolderKanban,
  ExternalLink,
} from "lucide-react";
import type { MemoryType, AgentMemory } from "../types/types";
import BadgeComponent from "./BadgeComponent";
import styles from "./MemoryCardComponent.module.css";

const TYPE_ICONS: Record<MemoryType, typeof User> = {
  user: User,
  feedback: MessageSquare,
  project: FolderKanban,
  reference: ExternalLink,
};

const TYPE_ICON_CLASSES: Record<MemoryType, string> = {
  user: "memory-icon-user",
  feedback: "memory-icon-feedback",
  project: "memory-icon-project",
  reference: "memory-icon-reference",
};

const TYPE_BADGE_CLASSES: Record<MemoryType, string> = {
  user: "badge-user",
  feedback: "badge-feedback",
  project: "badge-project",
  reference: "badge-reference",
};

interface MemoryCardComponentProps {
  memory: AgentMemory;
  isNew?: boolean;
  isConfirmingDelete?: boolean;
  onDeleteRequest: (memoryId: string) => void;
  onDeleteConfirm: (memoryId: string) => void;
  onDeleteCancel: () => void;
}

export default function MemoryCardComponent({
  memory,
  isNew = false,
  isConfirmingDelete = false,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: MemoryCardComponentProps) {
  const memoryId = memory.id || memory._id;
  const type = (memory.type || "project") as MemoryType;
  const IconComponent = TYPE_ICONS[type] || FolderKanban;
  const iconClass = TYPE_ICON_CLASSES[type] || "memory-icon-project";
  const badgeClass = TYPE_BADGE_CLASSES[type] || "badge-project";

  return (
    <div
      className={`memory-card-component ${styles["memory-card"]} ${isNew ? styles["is-new-memory"] : ""}`}
    >
      <div className={styles["memory-card-header"]}>
        <div className={`${styles["memory-icon"]} ${styles[iconClass]}`}>
          <IconComponent size={14} />
        </div>
        <div className={styles["memory-info"]}>
          <div className={styles["memory-title"]}>
            {memory.title ||
              (memory.content ? memory.content.substring(0, 60) : "Untitled")}
          </div>
          <div className={styles["memory-meta"]}>
            <span
              className={`${styles["memory-type-badge"]} ${styles[badgeClass]}`}
            >
              {type}
            </span>
            {memory.createdAt && (
              <BadgeComponent type="dateTime" date={memory.createdAt} />
            )}
          </div>
        </div>
        <button
          className={styles["delete-button"]}
          onClick={() => onDeleteRequest(isConfirmingDelete ? "" : memoryId)}
          title="Delete memory"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {memory.content && (
        <div className={styles["memory-content"]}>{memory.content}</div>
      )}

      {isConfirmingDelete && (
        <div className={styles["confirm-layout-row"]}>
          <span className={styles["confirm-label"]}>Delete this memory?</span>
          <button
            className={`${styles["confirm-button"]} ${styles["confirm-button-yes"]}`}
            onClick={() => onDeleteConfirm(memoryId)}
          >
            Delete
          </button>
          <button
            className={`${styles["confirm-button"]} ${styles["confirm-button-no"]}`}
            onClick={onDeleteCancel}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
