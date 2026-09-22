"use client";

import { useState } from "react";
import { ShieldCheck, Check, X } from "lucide-react";
import PermissionRulesService from "../services/PermissionRulesService";
import { getErrorMessage } from "../utils/errorMessage";
import type { PermissionScope } from "../types/permissions";
import styles from "./AlwaysAllowControlComponent.module.css";

const SCOPE_OPTIONS: Array<{ value: PermissionScope; label: string; hint: string }> = [
  { value: "conversation", label: "This conversation", hint: "and the sub-agents it starts" },
  { value: "project", label: "This project", hint: "every conversation in it" },
  { value: "profile", label: "Everywhere", hint: "every project of this profile" },
];

interface AlwaysAllowControlProps {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  conversationId?: string | null;
  workspaceRoot?: string | null;
  /** Called once the rule is saved — the card then approves the pending call. */
  onAllowed: () => void;
}

type Phase = "idle" | "loading" | "editing" | "saving";

/**
 * "Always allow…" on an approval card: asks the server which rule would
 * cover this call (`execute_shell(git status:*)`, `write_file(src/**)`, …),
 * lets the user adjust it and pick where it applies, saves it, and only then
 * approves the call. The server applies the rule to the running turn's next
 * tool call, so a saved rule stops the very next prompt.
 *
 * Self-contained on purpose — it owns its requests — so the card stays
 * presentational and the control can move with it.
 */
export default function AlwaysAllowControlComponent({
  toolName,
  toolArgs = {},
  conversationId,
  workspaceRoot,
  onAllowed,
}: AlwaysAllowControlProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [rule, setRule] = useState("");
  const [coversCall, setCoversCall] = useState(true);
  const [scope, setScope] = useState<PermissionScope>(conversationId ? "conversation" : "project");
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setPhase("loading");
    setError(null);
    try {
      const proposal = await PermissionRulesService.propose({ toolName, args: toolArgs, workspaceRoot: workspaceRoot ?? null });
      setRule(proposal.rule);
      setCoversCall(proposal.coversCall);
    } catch (proposalError: unknown) {
      // The server is the one that knows the syntax; fall back to the bare tool.
      setRule(toolName);
      setCoversCall(true);
      setError(`Could not propose a rule: ${getErrorMessage(proposalError)}`);
    }
    setPhase("editing");
  };

  const save = async () => {
    if (!rule.trim()) return;
    setPhase("saving");
    setError(null);
    try {
      await PermissionRulesService.create({
        rule: rule.trim(),
        decision: "allow",
        scope,
        conversationId: scope === "conversation" ? conversationId ?? null : null,
        origin: "approval",
      });
      setPhase("idle");
      onAllowed();
    } catch (saveError: unknown) {
      // Nothing is approved when the rule didn't save — the card stays pending.
      setError(getErrorMessage(saveError));
      setPhase("editing");
    }
  };

  if (phase === "idle" || phase === "loading") {
    return (
      <button className={styles["open-button"]} onClick={open} disabled={phase === "loading"}>
        <ShieldCheck size={14} />
        {phase === "loading" ? "Preparing…" : "Always allow…"}
      </button>
    );
  }

  return (
    <div className={styles["panel"]} data-testid="always-allow-panel">
      <label className={styles["label"]} htmlFor={`always-allow-rule-${toolName}`}>
        Allow calls matching
      </label>
      <input
        id={`always-allow-rule-${toolName}`}
        className={styles["rule-input"]}
        value={rule}
        onChange={(event) => setRule(event.target.value)}
        spellCheck={false}
      />
      {!coversCall && (
        <div className={styles["warning"]}>
          This rule covers only part of this call (a compound command) — this call is still approved once, and
          the next one like it may ask again.
        </div>
      )}
      <div className={styles["scopes"]} role="radiogroup" aria-label="Where the rule applies">
        {SCOPE_OPTIONS.map((option) => {
          const disabled = option.value === "conversation" && !conversationId;
          return (
            <label key={option.value} className={`${styles["scope"]} ${scope === option.value ? styles["scope-active"] : ""}`}>
              <input
                type="radio"
                name={`always-allow-scope-${toolName}`}
                value={option.value}
                checked={scope === option.value}
                disabled={disabled}
                onChange={() => setScope(option.value)}
              />
              <span>{option.label}</span>
              <span className={styles["scope-hint"]}>{option.hint}</span>
            </label>
          );
        })}
      </div>
      {error && (
        <div className={styles["error"]} role="alert">
          {error}
        </div>
      )}
      <div className={styles["actions"]}>
        <button className={styles["save-button"]} onClick={save} disabled={phase === "saving" || !rule.trim()}>
          <Check size={14} />
          {phase === "saving" ? "Saving…" : "Save rule & approve"}
        </button>
        <button className={styles["cancel-button"]} onClick={() => setPhase("idle")} disabled={phase === "saving"}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
