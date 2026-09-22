"use client";

import { Clock } from "lucide-react";
import { ChipComponent } from "@rodrigo-barraza/components-library";
import type { QueuedTurn } from "../hooks/useNextTurnQueue";
import styles from "./QueuedTurnChipsComponent.module.css";

const LABEL_MAX_CHARACTERS = 48;

function chipLabel(turn: QueuedTurn): string {
  const attachmentCount = turn.images.length + (turn.files?.length ?? 0);
  const attachmentsLabel =
    attachmentCount > 0
      ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
      : "";
  const text = turn.text.trim().replace(/\s+/g, " ");
  if (!text) return attachmentsLabel;
  const shortText =
    text.length > LABEL_MAX_CHARACTERS ? `${text.slice(0, LABEL_MAX_CHARACTERS - 1)}…` : text;
  return attachmentsLabel ? `${shortText} · ${attachmentsLabel}` : shortText;
}

/**
 * The composer's next-turn queue: one removable chip per queued message,
 * in send order, above the input box.
 */
export default function QueuedTurnChipsComponent({
  items,
  onRemove,
}: {
  items: QueuedTurn[];
  onRemove: (_id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`queued-turn-chips-component ${styles['chips']}`}>
      <span className={styles['heading']}>
        {items.length === 1 ? "Queued for next turn" : `${items.length} queued — sent in order`}
      </span>
      <ul className={styles['list']} aria-label="Queued messages">
        {items.map((turn) => (
          <li key={turn.id}>
            <ChipComponent
              variant="input"
              icon={Clock}
              removable
              onRemove={() => onRemove(turn.id)}
              title={turn.text}
            >
              {chipLabel(turn)}
            </ChipComponent>
          </li>
        ))}
      </ul>
    </div>
  );
}
