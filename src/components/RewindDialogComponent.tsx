"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import {
  CheckboxComponent,
  DialogComponent,
  RadioComponent,
} from "@rodrigo-barraza/components-library";
import type { RewindOutcome, RewindReport, RewindRestore } from "../services/conversationBranching";
import styles from "./RewindDialogComponent.module.css";

const RESTORE_CHOICES: Array<{ value: RewindRestore; label: string }> = [
  { value: "both", label: "Conversation and code" },
  { value: "conversation", label: "Conversation only" },
  { value: "code", label: "Code only" },
];

const PREVIEW_MAX_CHARACTERS = 90;

export interface RewindDialogProps {
  open: boolean;
  /** The message the user is rewinding to, for the headline. */
  messagePreview: string;
  onClose: () => void;
  /** Dry run of a "both" rewind — what each choice would change. */
  preview: () => Promise<RewindOutcome>;
  /** Run the rewind. A 409 outcome (files changed meanwhile) stays open. */
  onConfirm: (_restore: RewindRestore, _force: boolean) => Promise<RewindOutcome>;
}

function FileList({ label, paths, total, tone }: { label: string; paths: string[]; total: number; tone?: "danger" }) {
  if (total === 0) return null;
  return (
    <div className={styles['file-group']}>
      <div className={`${styles['file-group-label']}${tone === "danger" ? ` ${styles['danger']}` : ""}`}>
        {label} ({total})
      </div>
      <ul className={styles['file-list']}>
        {paths.map((path) => (
          <li key={path} className={styles['file-path']}>{path}</li>
        ))}
        {total > paths.length && <li className={styles['file-more']}>…and {total - paths.length} more</li>}
      </ul>
    </div>
  );
}

function codeSummary(report: RewindReport | null) {
  const code = report?.code;
  if (!code) return null;
  const workspaces = code.workspaces;
  const collect = (key: "restored" | "removed" | "conflicts") =>
    workspaces.flatMap((workspace) => workspace[key]);
  return {
    status: code.status,
    reason: code.reason,
    restored: collect("restored"),
    removed: collect("removed"),
    conflicts: collect("conflicts"),
    errors: workspaces.map((workspace) => workspace.error).filter(Boolean) as string[],
  };
}

/**
 * "Rewind to here…": choose conversation, code or both, see the files a
 * dry run says would change, then confirm. Files the user edited after the
 * agent's last write block the code restore until "overwrite" is ticked.
 *
 * Mount it per opening (keyed on the target): the dry run runs on mount.
 */
export default function RewindDialogComponent({
  open,
  messagePreview,
  onClose,
  preview,
  onConfirm,
}: RewindDialogProps) {
  const [restore, setRestore] = useState<RewindRestore>("both");
  const [force, setForce] = useState(false);
  const [plan, setPlan] = useState<RewindReport | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(open);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    preview()
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.report) setPlan(outcome.report);
        else setPlanError(outcome.error || "Could not preview the rewind.");
      })
      .catch((error: unknown) => {
        if (!cancelled) setPlanError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one preview per opening
  }, [open]);

  const wantsCode = restore !== "conversation";
  const wantsConversation = restore !== "code";
  const code = codeSummary(plan);
  const hasConflicts = wantsCode && (code?.conflicts.length ?? 0) > 0;
  const codeRestorable = code?.status === "dry-run" || code?.status === "refused";
  const nothingToDo =
    !!plan &&
    (!wantsConversation || (plan.conversation?.prunedCount ?? 0) === 0) &&
    (!wantsCode || !codeRestorable);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const outcome = await onConfirm(restore, force);
      if (outcome.status === 409 && outcome.report) {
        // Files changed between the preview and the confirm — show them.
        setPlan(outcome.report);
        setForce(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const shortPreview =
    messagePreview.length > PREVIEW_MAX_CHARACTERS
      ? `${messagePreview.slice(0, PREVIEW_MAX_CHARACTERS - 1)}…`
      : messagePreview;

  return (
    <DialogComponent
      open={open}
      onClose={onClose}
      icon={<History size={20} />}
      headline="Rewind to here?"
      confirmLabel={isSubmitting ? "Rewinding…" : "Rewind"}
      confirmVariant="destructive"
      confirmDisabled={isLoading || isSubmitting || !!planError || nothingToDo || (hasConflicts && !force)}
      onConfirm={() => void handleConfirm()}
      className={styles['dialog']}
    >
      <div className={`rewind-dialog-component ${styles['body']}`}>
        {shortPreview && <p className={styles['target']}>“{shortPreview}”</p>}

        <RadioComponent.Group legend="What to rewind">
          {RESTORE_CHOICES.map((choice) => (
            <RadioComponent<RewindRestore>
              key={choice.value}
              name="rewind-restore"
              value={choice.value}
              selectedValue={restore}
              onChange={setRestore}
              label={choice.label}
            />
          ))}
        </RadioComponent.Group>

        {isLoading && <p className={styles['muted']}>Checking what would change…</p>}
        {planError && <p className={styles['error']}>{planError}</p>}

        {plan && wantsConversation && plan.conversation && (
          <p className={styles['summary']}>
            {plan.conversation.prunedCount === 0
              ? "The conversation already ends here."
              : `Removes the ${plan.conversation.prunedCount} later message${plan.conversation.prunedCount === 1 ? "" : "s"} from the conversation.`}
          </p>
        )}

        {plan && wantsCode && code && (
          <div className={styles['code']} aria-label="Files the rewind changes">
            {(code.status === "unavailable" || code.status === "nothing-to-restore") && (
              <p className={styles['muted']}>{code.reason}</p>
            )}
            {code.status === "failed" && (
              <p className={styles['error']}>Code preview failed: {code.errors.join("; ") || code.reason}</p>
            )}
            {codeRestorable && (
              <>
                <FileList label="Restored to their content at this point" paths={code.restored} total={code.restored.length} />
                <FileList label="Created later — deleted" paths={code.removed} total={code.removed.length} />
                {code.restored.length === 0 && code.removed.length === 0 && (
                  <p className={styles['muted']}>No files differ from this point.</p>
                )}
              </>
            )}
            {hasConflicts && (
              <>
                <FileList
                  label="Changed since the agent's last edit — not by the agent"
                  paths={code.conflicts}
                  total={code.conflicts.length}
                  tone="danger"
                />
                <CheckboxComponent
                  checked={force}
                  onChange={setForce}
                  label="Overwrite these changes too"
                />
              </>
            )}
          </div>
        )}
      </div>
    </DialogComponent>
  );
}
