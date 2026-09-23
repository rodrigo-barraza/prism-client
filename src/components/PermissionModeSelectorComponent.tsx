"use client";

import React from "react";
import { Ban, ClipboardList, FilePen, ShieldOff, ShieldQuestion, Sparkles } from "lucide-react";
import InfoBannerComponent from "./InfoBannerComponent";
import type { PermissionMode, PermissionModeInfo } from "../types/permissions";
import styles from "./PermissionModeSelectorComponent.module.css";

const MODE_ICONS: Record<PermissionMode, React.ComponentType<{ size?: number }>> = {
  default: ShieldQuestion,
  plan: ClipboardList,
  acceptEdits: FilePen,
  auto: Sparkles,
  dontAsk: Ban,
  bypass: ShieldOff,
};

interface PermissionModeSelectorProps {
  mode: PermissionMode;
  /** The modes on offer (GET /permissions/mode). Nothing renders without them. */
  modes: PermissionModeInfo[];
  onChange: (_mode: PermissionMode) => void;
  disabled?: boolean;
  /** A failed switch, or what the server said about the mode (a refused bypass). */
  message?: string | null;
}

/**
 * The conversation's permission mode, above the composer: which tool calls
 * run without asking. A mode the user may not pick (bypass without the owner
 * flag) is listed but disabled, with the reason. While bypass is on, a
 * banner says so — every call runs without a card.
 */
export default function PermissionModeSelectorComponent({
  mode,
  modes,
  onChange,
  disabled = false,
  message,
}: PermissionModeSelectorProps) {
  if (modes.length === 0) return null;
  const current = modes.find((entry) => entry.id === mode);
  const ModeIcon = MODE_ICONS[mode] ?? ShieldQuestion;

  return (
    <div className={`permission-mode-selector-component ${styles["container"]}`}>
      {mode === "bypass" && (
        <InfoBannerComponent variant="danger" className={styles["bypass-banner"]}>
          <strong>Bypass mode</strong> — tool calls run without asking. Deny rules, ask rules, hooks that
          ask and protected paths (.git, .env, Prism configuration) still hold.
        </InfoBannerComponent>
      )}
      <div className={styles["row"]}>
        <label className={`${styles["label"]} ${styles[`is-mode-${mode}`] ?? ""}`}>
          <ModeIcon size={12} />
          <span className={styles["label-text"]}>Mode</span>
          <select
            className={styles["select"]}
            value={mode}
            disabled={disabled}
            aria-label="Permission mode"
            title={current?.description}
            onChange={(event) => onChange(event.target.value as PermissionMode)}
          >
            {modes.map((entry) => (
              <option
                key={entry.id}
                value={entry.id}
                disabled={!entry.available && entry.id !== mode}
                title={entry.unavailableReason ?? entry.note ?? entry.description}
              >
                {entry.label}
                {!entry.available ? " (owner only)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className={styles["description"]}>{current?.note ?? current?.description}</span>
      </div>
      {message && (
        <div className={styles["message"]} role="alert">
          {message}
        </div>
      )}
    </div>
  );
}
