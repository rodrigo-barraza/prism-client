"use client";

import {
  Trash2,
  User,
  MessageSquare,
  FolderKanban,
  ExternalLink,
  AtSign,
  MessageCircle,
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
  onDeleteRequest: (_memoryId: string) => void;
  onDeleteConfirm: (_memoryId: string) => void;
  onDeleteCancel: () => void;
  /** Filter the list to memories about this Discord user (LUPOS memories). */
  onFilterAboutUser?: (_userId: string) => void;
  /** Filter the list to memories revealed by this Discord user. */
  onFilterSourceUser?: (_userId: string) => void;
}

export default function MemoryCardComponent({
  memory,
  isNew = false,
  isConfirmingDelete = false,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onFilterAboutUser,
  onFilterSourceUser,
}: MemoryCardComponentProps) {
  const memoryId = memory.id || memory._id;
  const type = (memory.type || "project") as MemoryType;
  const IconComponent = TYPE_ICONS[type] || FolderKanban;
  const iconClass = TYPE_ICON_CLASSES[type] || "memory-icon-project";
  const badgeClass = TYPE_BADGE_CLASSES[type] || "badge-project";

  // Discord (LUPOS) attribution — who the memory is about, and who said it
  const aboutName = memory.aboutUsername || memory.aboutUserId;
  const sourceName = memory.sourceUsername || memory.sourceUserId;
  const isSelfReported =
    memory.aboutUserId && memory.aboutUserId === memory.sourceUserId;
  const isSuperseded = Boolean(memory.validTo);

  return (
    <div
      className={`memory-card-component ${styles["memory-card"]} ${isNew ? styles["is-new-memory"] : ""} ${isSuperseded ? styles["is-superseded"] : ""}`}
    >
      <div className={`${styles["memory-icon"]} ${styles[iconClass]}`}>
        <IconComponent size={13} />
      </div>
      <div className={styles["memory-body"]}>
        <div className={styles["memory-title-line"]}>
          <span className={styles["memory-title"]}>
            {memory.title ||
              (memory.content ? memory.content.substring(0, 60) : "Untitled")}
          </span>
          <div className={styles["memory-actions"]}>
            <button
              className={styles["delete-button"]}
              onClick={() => onDeleteRequest(isConfirmingDelete ? "" : memoryId)}
              title="Delete memory"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        <div className={styles["memory-meta"]}>
          <span
            className={`${styles["memory-type-badge"]} ${styles[badgeClass]}`}
          >
            {type}
          </span>
          {aboutName && (
            <button
              type="button"
              className={styles["memory-user-badge"]}
              onClick={
                memory.aboutUserId && onFilterAboutUser
                  ? () => onFilterAboutUser(memory.aboutUserId!)
                  : undefined
              }
              disabled={!memory.aboutUserId || !onFilterAboutUser}
              title={`About ${aboutName}${memory.aboutUserId ? ` (${memory.aboutUserId})` : ""}${isSelfReported ? " — self-reported" : ""}`}
            >
              <AtSign size={9} />
              {aboutName}
            </button>
          )}
          {sourceName && !isSelfReported && (
            <button
              type="button"
              className={`${styles["memory-user-badge"]} ${styles["memory-user-badge-source"]}`}
              onClick={
                memory.sourceUserId && onFilterSourceUser
                  ? () => onFilterSourceUser(memory.sourceUserId!)
                  : undefined
              }
              disabled={!memory.sourceUserId || !onFilterSourceUser}
              title={`Said by ${sourceName}${memory.sourceUserId ? ` (${memory.sourceUserId})` : ""}`}
            >
              <MessageCircle size={9} />
              by {sourceName}
            </button>
          )}
          {memory.createdAt && (
            <BadgeComponent type="dateTime" date={memory.createdAt} />
          )}
          {isSuperseded && (
            <span
              className={styles["memory-superseded-badge"]}
              title={`Superseded${memory.closedReason ? ` — ${memory.closedReason}` : ""}. Kept for history; excluded from active recall.`}
            >
              superseded
            </span>
          )}
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
    </div>
  );
}
