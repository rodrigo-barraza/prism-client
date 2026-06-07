"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  ScrollText,
  Terminal,
} from "lucide-react";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  ToggleComponent,
  InputComponent,
  TextAreaComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./RulesPanelComponent.module.css";
import type { Rule } from "@/types/types";

const CONTENT_WARN_CHARS = 2000;
const CONTENT_MAX_CHARS = 10000;

/**
 * RulesPanel — CRUD interface for per-agent rules (slash commands).
 *
 * Rules are Markdown instruction blocks stored in MongoDB and activated
 * by typing /rule-name in the chat input. When activated, the rule's
 * content is prepended to the user's message (Claude Code pattern).
 */
export default function RulesPanel({
  rules,
  onRulesChange,
  agent,
  onActionsChange,
  readOnly = false,
}: {
  rules: Rule[];
  onRulesChange: () => void;
  agent?: string;
  onActionsChange?: (actions: ReactNode) => void;
  readOnly?: boolean;
}) {
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRules = useMemo(() => {
    if (!searchQuery.trim()) return rules;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return rules.filter((rule: Rule) => {
      const name = (rule.name || "").toLowerCase();
      const description = (rule.description || "").toLowerCase();
      const content = (rule.content || "").toLowerCase();
      return (
        name.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        content.includes(normalizedQuery)
      );
    });
  }, [rules, searchQuery]);

  const handleCreate = useCallback(() => {
    setEditingRule({
      name: "",
      description: "",
      content: "",
      agent: agent || "",
      enabled: true,
    });
    setIsNew(true);
  }, [agent]);

  const handleEdit = useCallback((rule: Rule) => {
    setEditingRule({ ...rule });
    setIsNew(false);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingRule(null);
    setIsNew(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingRule) return;
    if (!editingRule.name?.trim() || !editingRule.content?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: editingRule.name,
        description: editingRule.description || "",
        content: editingRule.content || "",
        agent: editingRule.agent || agent || "",
        enabled: editingRule.enabled ?? true,
      };

      if (isNew) {
        await PrismService.createRule(payload);
      } else {
        await PrismService.updateRule(
          editingRule.id || editingRule._id?.toString() || "",
          payload,
        );
      }

      setEditingRule(null);
      setIsNew(false);
      onRulesChange();
    } catch (error: unknown) {
      console.error("Failed to save rule:", error);
    } finally {
      setSaving(false);
    }
  }, [editingRule, isNew, onRulesChange, agent]);

  const handleDelete = useCallback((id: string) => {
    setConfirmingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(
    async (id: string) => {
      try {
        await PrismService.deleteRule(id);
        setConfirmingDeleteId(null);
        onRulesChange();
      } catch (error: unknown) {
        console.error("Failed to delete rule:", error);
      }
    },
    [onRulesChange],
  );

  const handleToggleAll = useCallback(async () => {
    const allEnabled =
      rules.length > 0 && rules.every((rule: Rule) => rule.enabled);
    const newEnabled = !allEnabled;
    try {
      await Promise.all(
        rules.map((rule: Rule) =>
          PrismService.updateRule(rule.id || rule._id?.toString() || "", {
            enabled: newEnabled,
          }),
        ),
      );
      onRulesChange();
    } catch (error: unknown) {
      console.error("Failed to toggle all rules:", error);
    }
  }, [rules, onRulesChange]);

  useEffect(() => {
    if (readOnly) {
      onActionsChange?.(null);
      return;
    }
    onActionsChange?.(
      <>
        {rules.length > 0 && (
          <ToggleComponent
            checked={
              rules.length > 0 && rules.every((rule: Rule) => rule.enabled)
            }
            onChange={handleToggleAll}
            size="mini"
          />
        )}
        <ButtonComponent variant="disabled" icon={Plus} onClick={handleCreate}>
          New
        </ButtonComponent>
      </>,
    );
  }, [onActionsChange, rules, handleToggleAll, handleCreate, readOnly]);

  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Edit / Create Form ---------------------------------------

  if (editingRule) {
    const contentLength = editingRule.content?.length || 0;
    const isOverWarningThreshold = contentLength > CONTENT_WARN_CHARS;
    const isOverMaximumThreshold = contentLength > CONTENT_MAX_CHARS;
    const slugifiedName = editingRule.name || "rule-name";

    return (
      <div className={styles['container']}>
        <div className={styles["form-header"]}>
          <h3>{isNew ? "New Rule" : "Edit Rule"}</h3>
          <button className={styles["cancel-button"]} onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        <div className={styles['form']}>
          <div className={styles["form-group"]}>
            <label>Rule Name</label>
            <InputComponent
              type="text"
              value={editingRule.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setEditingRule((previous: Rule | null) =>
                  previous
                    ? {
                        ...previous,
                        name: event.target.value
                          .replace(/[^a-zA-Z0-9_-]/g, "-")
                          .toLowerCase(),
                      }
                    : null,
                )
              }
              placeholder="typescript-conventions"
            />
            {editingRule.name && (
              <span className={styles["slash-preview"]}>/{slugifiedName}</span>
            )}
            <span className={styles['hint']}>
              kebab-case identifier — becomes your slash command
            </span>
          </div>

          <div className={styles["form-group"]}>
            <label>Description</label>
            <InputComponent
              type="text"
              value={editingRule.description || ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setEditingRule((previous: Rule | null) =>
                  previous
                    ? {
                        ...previous,
                        description: event.target.value,
                      }
                    : null,
                )
              }
              placeholder="Enforce TypeScript coding standards"
            />
            <span className={styles['hint']}>
              Shown in the slash command picker dropdown
            </span>
          </div>

          <div className={styles["form-group"]}>
            <label>Content (Markdown)</label>
            <TextAreaComponent
              className={styles["content-textarea"]}
              value={editingRule.content || ""}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
                const value = event.target.value;
                if (value.length <= CONTENT_MAX_CHARS) {
                  setEditingRule((previous: Rule | null) =>
                    previous ? { ...previous, content: value } : null,
                  );
                }
              }}
              placeholder={`## TypeScript Conventions\n\n- Always use const over let\n- Prefer async/await over .then()\n- Use descriptive variable names\n- ...`}
              autoResize={false}
            />
            <div
              className={`${styles["character-counter"]} ${isOverMaximumThreshold ? styles["character-counter-danger"] : isOverWarningThreshold ? styles["character-counter-warning"] : ""}`}
            >
              {contentLength.toLocaleString()} /{" "}
              {CONTENT_MAX_CHARS.toLocaleString()} chars
              {isOverWarningThreshold &&
                !isOverMaximumThreshold &&
                " ⚠️ nearing limit"}
            </div>
          </div>

          <div className={styles["form-actions"]}>
            <button
              className={styles["save-button"]}
              onClick={handleSave}
              disabled={
                saving ||
                !editingRule.name?.trim() ||
                !editingRule.content?.trim()
              }
            >
              <Save size={14} />
              {saving ? "Saving..." : isNew ? "Create Rule" : "Save Changes"}
            </button>
            <button
              className={styles["cancel-form-button"]}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -- List View ------------------------------------------------

  return (
    <div className={`rules-panel-component ${styles['container']}`}>
      {rules.length > 0 && (
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search rules…"
          compact
        />
      )}

      {rules.length === 0 && (
        <div className={styles["empty-state"]}>
          <div className={styles["empty-icon"]}>
            <Terminal size={24} />
          </div>
          <div className={styles["empty-title"]}>No rules yet</div>
          <div className={styles["empty-subtitle"]}>
            Rules become slash commands you can activate in the chat input. Type{" "}
            <strong>/rule-name</strong> to inject the rule&apos;s content into
            your message.
          </div>
          {!readOnly && (
            <ButtonComponent
              variant="disabled"
              icon={Plus}
              onClick={handleCreate}
            >
              Create your first rule
            </ButtonComponent>
          )}
        </div>
      )}

      {rules.length > 0 && filteredRules.length === 0 && (
        <div className={styles["empty-state"]}>
          <div className={styles["empty-title"]}>No matching rules</div>
          <div className={styles["empty-subtitle"]}>
            Try adjusting your search query.
          </div>
        </div>
      )}

      {filteredRules.map((rule: Rule) => {
        const ruleId = rule.id || rule._id?.toString() || "";
        const isConfirming = confirmingDeleteId === ruleId;

        return (
          <div
            key={ruleId}
            className={`${styles["rule-card"]} ${!rule.enabled ? styles["rule-card-disabled"] : ""}`}
          >
            <div className={styles["rule-card-header"]}>
              <div className={styles["rule-icon"]}>
                <ScrollText size={14} />
              </div>
              <div className={styles["rule-info"]}>
                <div className={styles["rule-name"]}>{rule.name}</div>
                <div className={styles["rule-slash-command"]}>/{rule.name}</div>
                {rule.description && (
                  <div className={styles["rule-description"]}>
                    {rule.description}
                  </div>
                )}
              </div>
              {!readOnly && (
                <div className={styles["rule-actions"]}>
                  <button
                    className={styles["rule-action-button"]}
                    onClick={() => handleEdit(rule)}
                    title="Edit rule"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    className={`${styles["rule-action-button"]} ${styles["rule-delete-button"]}`}
                    onClick={() => handleDelete(ruleId)}
                    title="Delete rule"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {rule.content && (
              <div className={styles["rule-content-preview"]}>
                {rule.content}
              </div>
            )}

            {rule.content && (
              <div
                className={`${styles["rule-character-count"]} ${rule.content.length > CONTENT_WARN_CHARS ? styles["rule-character-count-warning"] : ""}`}
              >
                {rule.content.length.toLocaleString()} chars
              </div>
            )}

            {isConfirming && (
              <div className={styles["confirm-layout-row"]}>
                <span className={styles["confirm-label"]}>
                  Delete &ldquo;{rule.name}&rdquo;?
                </span>
                <button
                  className={`${styles["confirm-button"]} ${styles["confirm-button-yes"]}`}
                  onClick={() => confirmDelete(ruleId)}
                >
                  Delete
                </button>
                <button
                  className={`${styles["confirm-button"]} ${styles["confirm-button-no"]}`}
                  onClick={() => setConfirmingDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
