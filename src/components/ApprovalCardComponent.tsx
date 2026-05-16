"use client";

import { Shield, ShieldAlert, ShieldCheck, Check, X, Zap } from "lucide-react";
import styles from "./ApprovalCardComponent.module.css";

const TIER_CONFIG = {
  1: { label: "Auto", color: "var(--color-success)", icon: ShieldCheck },
  2: { label: "Write", color: "var(--color-warning)", icon: Shield },
  3: { label: "Danger", color: "var(--color-error)", icon: ShieldAlert },
};

/**
 * Inline approval card for tool calls that need user permission.
 */
export default function ApprovalCardComponent({
  // @ts-ignore
  // @ts-ignore
  toolName: any,
  toolArgs = {},
  tier = 2,
  // @ts-ignore
  // @ts-ignore
  onApprove: any,
  // @ts-ignore
  // @ts-ignore
  onReject: any,
  // @ts-ignore
  // @ts-ignore
  onApproveAll: any,
  isPending = true,
}) {
  // @ts-ignore
  const tierInfo = TIER_CONFIG[tier] || TIER_CONFIG[2];
  const TierIcon = tierInfo.icon;

  // Format args for preview (truncate long values)
  const argEntries = Object.entries(toolArgs).slice(0, 4);

  return (
    <div className={`${styles.card} ${!isPending ? styles.resolved : ""}`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <TierIcon
            size={16}
            className={styles.tierIcon}
            style={{ color: tierInfo.color }}
          />
          {/* @ts-ignore */}
          <span className={styles.toolName}>{toolName}</span>
          <span
            className={styles.tierBadge}
            style={{
              color: tierInfo.color,
              borderColor: `color-mix(in srgb, ${tierInfo.color} 30%, transparent)`,
            }}
          >
            {tierInfo.label}
          </span>
        </div>
      </div>

      {argEntries.length > 0 && (
        <div className={styles.args}>
          {argEntries.map(([key, value]) => {
            const strVal = typeof value === "string" ? value : JSON.stringify(value);
            const truncated = strVal.length > 120 ? strVal.slice(0, 117) + "..." : strVal;
            return (
              <div key={key} className={styles.argRow}>
                <span className={styles.argKey}>{key}</span>
                <span className={styles.argValue}>{truncated}</span>
              </div>
            );
          })}
        </div>
      )}

      {isPending && (
        <div className={styles.actions}>
          {/* @ts-ignore */}
          <button className={styles.approveBtn} onClick={onApprove}>
            <Check size={14} />
            Approve
          </button>
          {/* @ts-ignore */}
          <button className={styles.approveAllBtn} onClick={onApproveAll}>
            <Zap size={14} />
            Approve All
          </button>
          {/* @ts-ignore */}
          <button className={styles.rejectBtn} onClick={onReject}>
            <X size={14} />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
