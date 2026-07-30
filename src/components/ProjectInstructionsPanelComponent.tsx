"use client";

import { useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import {
  Save,
  X,
  Pencil,
  FileText,
  History,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Bot,
  User,
} from "lucide-react";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  TextAreaComponent,
  EmptyStateComponent,
  MarkdownContentComponent,
} from "@rodrigo-barraza/components-library";
import { TRUNCATION_LIMITS } from "../constants";
import { getErrorMessage } from "../utils/errorMessage";
import styles from "./ProjectInstructionsPanelComponent.module.css";
import type {
  ProjectInstructions,
  ProjectInstructionsVersion,
} from "@/types/types";

const CONTENT_WARN_CHARS = TRUNCATION_LIMITS.MAX_CONTENT_CHARS;
const VERSION_HISTORY_LIMIT = 25;
const EDIT_MINIMUM_ROWS = 20;

/** "you" vs "the agent" — the agent writes to this doc itself, so say which. */
function describeAuthor(updatedBy?: string | null): string {
  if (updatedBy === "agent") return "the agent";
  if (updatedBy === "user") return "you";
  return "unknown";
}

function formatTimestamp(isoDate?: string): string {
  if (!isoDate) return "";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

/**
 * ProjectInstructionsPanel — the PRISM.md editor.
 *
 * One always-on Markdown document per scope, injected into every conversation
 * in the project. The agent can rewrite it mid-session, which is why the
 * header names the last author and why every superseded version stays
 * restorable.
 */
export default function ProjectInstructionsPanel({
  instructions,
  onInstructionsChange,
  agent,
  onActionsChange,
  readOnly = false,
}: {
  instructions: ProjectInstructions | null;
  onInstructionsChange: () => void;
  agent?: string;
  onActionsChange?: (_actions: ReactNode) => void;
  readOnly?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<ProjectInstructionsVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  const content = instructions?.content || "";
  const version = instructions?.version ?? 0;
  const hasDocument = version > 0 && Boolean(content.trim());

  // -- Edit / cancel / save --------------------------------------

  const handleStartEditing = useCallback(() => {
    setDraftContent(content);
    setError(null);
    setIsEditing(true);
  }, [content]);

  const handleCancelEditing = useCallback(() => {
    setIsEditing(false);
    setDraftContent("");
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await PrismService.updateProjectInstructions(draftContent, agent);
      setIsEditing(false);
      setDraftContent("");
      onInstructionsChange();
    } catch (caughtError: unknown) {
      console.error("Failed to save project instructions:", caughtError);
      setError(getErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }, [draftContent, agent, onInstructionsChange]);

  // -- Version history -------------------------------------------

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const loaded = await PrismService.getProjectInstructionsVersions(
        agent,
        VERSION_HISTORY_LIMIT,
      );
      setVersions(loaded || []);
    } catch (caughtError: unknown) {
      console.error("Failed to load instruction versions:", caughtError);
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [agent]);

  const handleToggleHistory = useCallback(() => {
    setIsHistoryOpen((previous: boolean) => !previous);
  }, []);

  // Single loader for the history list: fires when it opens, and again
  // whenever the document version moves under it — a save or an agent-side
  // rewrite supersedes a revision the open list is already showing.
  useEffect(() => {
    if (!isHistoryOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    loadVersions();
  }, [isHistoryOpen, version, loadVersions]);

  const handleRestore = useCallback(
    async (restoreVersion: number) => {
      setRestoringVersion(restoreVersion);
      setError(null);
      try {
        await PrismService.rollbackProjectInstructions(restoreVersion, agent);
        onInstructionsChange();
      } catch (caughtError: unknown) {
        console.error("Failed to restore instruction version:", caughtError);
        setError(getErrorMessage(caughtError));
      } finally {
        setRestoringVersion(null);
      }
    },
    [agent, onInstructionsChange],
  );

  // -- Header actions --------------------------------------------

  useEffect(() => {
    if (readOnly || isEditing || !hasDocument) {
      onActionsChange?.(null);
      return;
    }
    onActionsChange?.(
      <ButtonComponent
        variant="disabled"
        icon={Pencil}
        onClick={handleStartEditing}
      >
        Edit
      </ButtonComponent>,
    );
  }, [onActionsChange, readOnly, isEditing, hasDocument, handleStartEditing]);

  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Empty state ------------------------------------------------

  if (!hasDocument && !isEditing) {
    return (
      <div
        className={`project-instructions-panel-component ${styles["container"]}`}
      >
        <EmptyStateComponent
          icon={<FileText />}
          title="No project instructions yet"
          subtitle="PRISM.md is a single always-on document injected into every conversation in this project — conventions, guardrails, and context the agent should never have to be told twice. The agent can also update it itself as it learns."
        >
          {!readOnly && (
            <ButtonComponent
              variant="primary"
              icon={Pencil}
              onClick={handleStartEditing}
            >
              Write instructions
            </ButtonComponent>
          )}
        </EmptyStateComponent>
      </div>
    );
  }

  // -- Document ----------------------------------------------------

  const characterCount = isEditing ? draftContent.length : content.length;
  const isOverWarningThreshold = characterCount > CONTENT_WARN_CHARS;

  return (
    <div
      className={`project-instructions-panel-component ${styles["container"]}`}
    >
      <div className={styles["document-header"]}>
        <div className={styles["document-identity"]}>
          <span className={styles["version-badge"]}>v{version}</span>
          <span className={styles["document-title"]}>PRISM.md</span>
        </div>
        <div className={styles["document-attribution"]}>
          {instructions?.updatedBy === "agent" ? (
            <Bot size={11} />
          ) : (
            <User size={11} />
          )}
          <span>
            Last updated by {describeAuthor(instructions?.updatedBy)}
            {instructions?.updatedAt
              ? ` · ${formatTimestamp(instructions.updatedAt)}`
              : ""}
          </span>
        </div>
      </div>

      {error && <div className={styles["error-banner"]}>{error}</div>}

      {isEditing ? (
        <>
          <TextAreaComponent
            className={styles["editor-textarea"]}
            value={draftContent}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setDraftContent(event.target.value)
            }
            minRows={EDIT_MINIMUM_ROWS}
            placeholder={
              "# Project Instructions\n\n- Conventions the agent must follow\n- Things it should never do\n- Context it would otherwise have to rediscover"
            }
            autoResize={false}
          />
          <div
            className={`${styles["character-counter"]} ${isOverWarningThreshold ? styles["character-counter-warning"] : ""}`}
          >
            {characterCount.toLocaleString()} chars
            {isOverWarningThreshold &&
              ` · over ${CONTENT_WARN_CHARS.toLocaleString()} — this is injected into every conversation`}
          </div>
          <div className={styles["form-actions"]}>
            <button
              className={styles["save-button"]}
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={14} />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className={styles["cancel-form-button"]}
              onClick={handleCancelEditing}
              disabled={saving}
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <MarkdownContentComponent
            content={content}
            className={styles["document-content"]}
          />
          {!readOnly && (
            <div className={styles["form-actions"]}>
              <button
                className={styles["save-button"]}
                onClick={handleStartEditing}
              >
                <Pencil size={14} />
                Edit
              </button>
            </div>
          )}
        </>
      )}

      {/* -- Version history disclosure ------------------------------ */}
      <div className={styles["history-section"]}>
        <button
          className={styles["history-toggle"]}
          onClick={handleToggleHistory}
          aria-expanded={isHistoryOpen}
        >
          {isHistoryOpen ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )}
          <History size={13} />
          <span>Version history</span>
          {versions.length > 0 && (
            <span className={styles["history-count"]}>{versions.length}</span>
          )}
        </button>

        {isHistoryOpen && (
          <div className={styles["history-list"]}>
            {versionsLoading && (
              <div className={styles["history-empty"]}>Loading versions…</div>
            )}

            {!versionsLoading && versions.length === 0 && (
              <div className={styles["history-empty"]}>
                No earlier versions — v{version} is the first.
              </div>
            )}

            {!versionsLoading &&
              versions.map((historyVersion: ProjectInstructionsVersion) => {
                const isExpanded = expandedVersion === historyVersion.version;
                return (
                  <div
                    key={historyVersion.version}
                    className={styles["history-row"]}
                  >
                    <div className={styles["history-row-main"]}>
                      <span className={styles["history-version"]}>
                        v{historyVersion.version}
                      </span>
                      <span className={styles["history-author"]}>
                        {describeAuthor(historyVersion.updatedBy)}
                      </span>
                      <span className={styles["history-timestamp"]}>
                        {formatTimestamp(historyVersion.updatedAt)}
                      </span>
                      <button
                        className={styles["history-preview-button"]}
                        onClick={() =>
                          setExpandedVersion(
                            isExpanded ? null : historyVersion.version,
                          )
                        }
                      >
                        {isExpanded ? "Hide" : "Preview"}
                      </button>
                      {!readOnly && (
                        <button
                          className={styles["history-restore-button"]}
                          onClick={() => handleRestore(historyVersion.version)}
                          disabled={restoringVersion === historyVersion.version}
                          title={`Restore v${historyVersion.version} as the new current version`}
                        >
                          <RotateCcw size={11} />
                          {restoringVersion === historyVersion.version
                            ? "Restoring…"
                            : "Restore"}
                        </button>
                      )}
                    </div>
                    {historyVersion.closedReason && (
                      <div className={styles["history-reason"]}>
                        {historyVersion.closedReason}
                      </div>
                    )}
                    {isExpanded && (
                      <pre className={styles["history-preview"]}>
                        {historyVersion.content}
                      </pre>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
