"use client";

import { useState } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Zap,
  RotateCcw,
} from "lucide-react";
import type { ApprovalPreview, ApprovalDecision, ApprovalScope } from "../types/types";
import AlwaysAllowControlComponent from "./AlwaysAllowControlComponent";
import styles from "./ApprovalCardComponent.module.css";

const TIER_CONFIG = {
  1: { label: "Auto", color: "var(--color-success)", icon: ShieldCheck },
  2: { label: "Write", color: "var(--color-warning)", icon: Shield },
  3: { label: "Danger", color: "var(--color-danger)", icon: ShieldAlert },
};

type TierLevel = keyof typeof TIER_CONFIG;

const RETRY_AFTER_RESTART_TEXT =
  "The server restarted while this call was running. It may have partly run, and its result was lost. Run it again?";

export interface ApprovalCardDecision {
  decision: ApprovalDecision;
  reason?: string;
  editedArgs?: Record<string, unknown>;
  scope?: ApprovalScope;
}

interface ApprovalCardProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  tier?: TierLevel;
  preview?: ApprovalPreview;
  /**
   * The server restarted while this call was running: it may have partly
   * run. The card asks whether to run it AGAIN — not for permission.
   */
  retryAfterRestart?: boolean;
  /** The server's words for why it asks. */
  retryReason?: string;
  /** Other calls of the same batch still waiting — offers "Allow the rest of this batch". */
  otherPendingInBatch?: number;
  /** A decision for this card is in flight. */
  isSubmitting?: boolean;
  /** Resolves to an error to show on the card, or null once the decision went through. */
  onDecide: (_decision: ApprovalCardDecision) => Promise<string | null>;
  /** Offers "Always allow…": saves a permission rule, then allows this call. */
  alwaysAllow?: { conversationId?: string | null; workspaceRoot?: string | null };
  /** Set when a sub-agent asked — named on the card. */
  subAgentDescription?: string;
}

type Mode = "idle" | "deny" | "edit";

function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return styles["diff-header"];
  if (line.startsWith("@@")) return styles["diff-hunk"];
  if (line.startsWith("+")) return styles["diff-added"];
  if (line.startsWith("-")) return styles["diff-removed"];
  return styles["diff-context"];
}

/**
 * One tool call that needs the user's permission, decided on its own:
 * Allow · Deny (with an optional reason the agent will see) · Edit the
 * arguments and allow · Allow the rest of this batch · Auto-approve this
 * conversation. Shows the call's full arguments and, for file writes, the
 * diff it would apply.
 */
export default function ApprovalCardComponent({
  toolName,
  toolArgs = {},
  tier = 2,
  preview,
  retryAfterRestart = false,
  retryReason,
  otherPendingInBatch = 0,
  isSubmitting = false,
  onDecide,
  alwaysAllow,
  subAgentDescription,
}: ApprovalCardProps) {
  const tierInfo = TIER_CONFIG[tier] || TIER_CONFIG[2];
  const TierIcon = tierInfo.icon;
  const argumentsJson = JSON.stringify(toolArgs, null, 2);

  const [mode, setMode] = useState<Mode>("idle");
  // With a diff to read, the raw arguments start folded away.
  const [showArguments, setShowArguments] = useState(!preview);
  const [reason, setReason] = useState("");
  const [editedJson, setEditedJson] = useState(argumentsJson);
  const [error, setError] = useState<string | null>(null);

  const submit = async (decision: ApprovalCardDecision) => {
    setError(null);
    const failure = await onDecide(decision);
    if (failure) setError(failure);
  };

  const submitEdit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editedJson);
    } catch (parseError) {
      setError(`Not valid JSON — ${(parseError as Error).message}`);
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setError("The arguments must be a JSON object");
      return;
    }
    void submit({ decision: "allow", editedArgs: parsed as Record<string, unknown> });
  };

  return (
    <div
      className={`approval-card-component ${styles["card"]}`}
      role="group"
      aria-label={`Approval for ${toolName}`}
      aria-busy={isSubmitting}
    >
      <div className={styles["header"]}>
        <div className={styles["header-left"]}>
          <TierIcon size={16} className={styles["tier-icon"]} style={{ color: tierInfo.color }} />
          <span className={styles["tool-name"]}>{toolName}</span>
          {subAgentDescription && (
            <span className={styles["sub-agent"]} title={subAgentDescription}>
              sub-agent: {subAgentDescription}
            </span>
          )}
          <span
            className={styles["tier-badge"]}
            style={{
              color: tierInfo.color,
              borderColor: `color-mix(in srgb, ${tierInfo.color} 30%, transparent)`,
            }}
          >
            {tierInfo.label}
          </span>
        </div>
        <span className={styles["header-status"]}>
          <span className={styles["header-status-dot"]} />
          {isSubmitting ? "Sending…" : "Waiting for your approval"}
        </span>
      </div>

      {retryAfterRestart && (
        <div className={styles["retry-notice"]} role="note">
          <RotateCcw size={14} aria-hidden="true" />
          <span>{retryReason || RETRY_AFTER_RESTART_TEXT}</span>
        </div>
      )}

      {preview && (
        <div className={styles["preview"]}>
          <div className={styles["preview-header"]}>
            <span className={styles["preview-path"]}>{preview.path}</span>
            {preview.isNewFile && <span className={styles["preview-badge"]}>new file</span>}
          </div>
          <pre className={styles["diff"]} aria-label={`Changes to ${preview.path}`}>
            {preview.diff.split("\n").map((line, index) => (
              <span key={index} className={diffLineClass(line)}>
                {line}
                {"\n"}
              </span>
            ))}
          </pre>
          {preview.isTruncated && (
            <div className={styles["preview-note"]}>Diff truncated — the full change is in the arguments.</div>
          )}
        </div>
      )}

      <button
        type="button"
        className={styles["arguments-toggle"]}
        aria-expanded={showArguments}
        onClick={() => setShowArguments((value) => !value)}
      >
        {showArguments ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Arguments
      </button>
      {showArguments && mode !== "edit" && <pre className={styles["arguments"]}>{argumentsJson}</pre>}

      {mode === "edit" && (
        <div className={styles["editor"]}>
          <textarea
            className={styles["editor-input"]}
            aria-label="Edited arguments (JSON)"
            spellCheck={false}
            value={editedJson}
            onChange={(event) => setEditedJson(event.target.value)}
            rows={Math.min(16, Math.max(4, editedJson.split("\n").length + 1))}
          />
          <div className={styles["actions"]}>
            <button type="button" className={styles["approve-button"]} disabled={isSubmitting} onClick={submitEdit}>
              <Check size={14} />
              Allow with these arguments
            </button>
            <button
              type="button"
              className={styles["secondary-button"]}
              disabled={isSubmitting}
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "deny" && (
        <div className={styles["editor"]}>
          <input
            className={styles["reason-input"]}
            aria-label="Reason for denying (optional)"
            placeholder="Why not? The agent will see this (optional)"
            value={reason}
            autoFocus
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit({ decision: "deny", reason: reason.trim() || undefined });
              if (event.key === "Escape") setMode("idle");
            }}
          />
          <div className={styles["actions"]}>
            <button
              type="button"
              className={styles["reject-button"]}
              disabled={isSubmitting}
              onClick={() => void submit({ decision: "deny", reason: reason.trim() || undefined })}
            >
              <X size={14} />
              Deny
            </button>
            <button
              type="button"
              className={styles["secondary-button"]}
              disabled={isSubmitting}
              onClick={() => setMode("idle")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={styles["error"]} role="alert">
          {error}
        </div>
      )}

      {mode === "idle" && (
        <div className={styles["actions"]}>
          <button
            type="button"
            className={styles["approve-button"]}
            disabled={isSubmitting}
            onClick={() => void submit({ decision: "allow" })}
          >
            {retryAfterRestart ? <RotateCcw size={14} /> : <Check size={14} />}
            {retryAfterRestart ? "Run it again" : "Allow"}
          </button>
          <button
            type="button"
            className={styles["reject-button"]}
            disabled={isSubmitting}
            onClick={() => {
              setError(null);
              setMode("deny");
            }}
          >
            <X size={14} />
            {retryAfterRestart ? "Don't run it again…" : "Deny…"}
          </button>
          <button
            type="button"
            className={styles["secondary-button"]}
            disabled={isSubmitting}
            onClick={() => {
              setError(null);
              setEditedJson(argumentsJson);
              setMode("edit");
            }}
          >
            <Pencil size={14} />
            Edit arguments
          </button>
          {otherPendingInBatch > 0 && (
            <button
              type="button"
              className={styles["approve-all-button"]}
              disabled={isSubmitting}
              onClick={() => void submit({ decision: "allow", scope: "batch" })}
            >
              <ListChecks size={14} />
              Allow the rest of this batch ({otherPendingInBatch + 1})
            </button>
          )}
          <button
            type="button"
            className={styles["approve-all-button"]}
            disabled={isSubmitting}
            title="Allow this and every later tool call in this conversation only"
            onClick={() => void submit({ decision: "allow", scope: "conversation" })}
          >
            <Zap size={14} />
            Auto-approve this conversation
          </button>
        </div>
      )}

      {mode === "idle" && alwaysAllow && !retryAfterRestart && (
        <AlwaysAllowControlComponent
          toolName={toolName}
          toolArgs={toolArgs}
          conversationId={alwaysAllow.conversationId}
          workspaceRoot={alwaysAllow.workspaceRoot}
          onAllowed={() => void submit({ decision: "allow" })}
        />
      )}
    </div>
  );
}
