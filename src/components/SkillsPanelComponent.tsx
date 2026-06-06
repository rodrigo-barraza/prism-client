"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Plus, Trash2, Edit3, Save, X, BookOpen, Sparkles } from "lucide-react";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  ToggleComponent,
  InputComponent,
  TextAreaComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./SkillsPanelComponent.module.css";
import type { Skill } from "@/types/types";

const CONTENT_WARN_CHARS = 2000;
const CONTENT_MAX_CHARS = 10000;

/**
 * SkillsPanel — CRUD interface for project-scoped agent skills.
 *
 * Skills are Markdown knowledge blocks stored in MongoDB and injected
 * into the agent's system prompt by SystemPromptAssembler. They give
 * the LLM domain-specific context, coding conventions, or project
 * rules without consuming tool call slots.
 */
export default function SkillsPanel({
  skills,
  onSkillsChange,
  project,
  readOnly,
  onActionsChange,
}: {
  skills: Skill[];
  onSkillsChange: () => void;
  project?: string;
  readOnly?: boolean;
  onActionsChange?: (actions: ReactNode) => void;
}) {
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return skills.filter((skill: Skill) => {
      const name = (skill.name || "").toLowerCase();
      const description = (skill.description || "").toLowerCase();
      const content = (skill.content || "").toLowerCase();
      return (
        name.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        content.includes(normalizedQuery)
      );
    });
  }, [skills, searchQuery]);

  // -- CRUD -----------------------------------------------------

  const handleCreate = useCallback(() => {
    setEditingSkill({
      name: "",
      description: "",
      template: "",
      content: "",
      enabled: true,
    });
    setIsNew(true);
  }, []);

  const handleEdit = useCallback((skill: Skill) => {
    setEditingSkill({ ...skill });
    setIsNew(false);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingSkill(null);
    setIsNew(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingSkill) return;
    if (!editingSkill.name?.trim() || !editingSkill.content?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: editingSkill.name,
        template: editingSkill.content || editingSkill.template || "",
        description: editingSkill.description,
        enabled: editingSkill.enabled,
        content: editingSkill.content,
        ...(project ? { project } : {}),
      };

      if (isNew) {
        await PrismService.createSkill(payload);
      } else {
        await PrismService.updateSkill(
          editingSkill.id || editingSkill._id?.toString() || "",
          payload,
        );
      }

      setEditingSkill(null);
      setIsNew(false);
      onSkillsChange();
    } catch (error: unknown) {
      console.error("Failed to save skill:", error);
    } finally {
      setSaving(false);
    }
  }, [editingSkill, isNew, onSkillsChange, project]);

  const handleDelete = useCallback((id: string) => {
    setConfirmingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(
    async (id: string) => {
      try {
        await PrismService.deleteSkill(id);
        setConfirmingDeleteId(null);
        onSkillsChange();
      } catch (error: unknown) {
        console.error("Failed to delete skill:", error);
      }
    },
    [onSkillsChange],
  );

  const handleToggleAll = useCallback(async () => {
    const allEnabled =
      skills.length > 0 && skills.every((s: Skill) => s.enabled);
    const newEnabled = !allEnabled;
    try {
      await Promise.all(
        skills.map((s: Skill) =>
          PrismService.updateSkill(s.id || s._id?.toString() || "", {
            enabled: newEnabled,
          }),
        ),
      );
      onSkillsChange();
    } catch (error: unknown) {
      console.error("Failed to toggle all skills:", error);
    }
  }, [skills, onSkillsChange]);

  // -- Push header action buttons to parent SidebarTabHeader ---
  useEffect(() => {
    onActionsChange?.(
      <>
        {skills.length > 0 && (
          <ToggleComponent
            checked={skills.length > 0 && skills.every((s: Skill) => s.enabled)}
            onChange={handleToggleAll}
            size="mini"
          />
        )}
        <ButtonComponent variant="disabled" icon={Plus} onClick={handleCreate}>
          New
        </ButtonComponent>
      </>,
    );
  }, [onActionsChange, skills, handleToggleAll, handleCreate]);

  // Clear actions on unmount
  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Edit / Create Form ---------------------------------------

  if (editingSkill) {
    const contentLen = editingSkill.content?.length || 0;
    const isOverWarn = contentLen > CONTENT_WARN_CHARS;
    const isOverMax = contentLen > CONTENT_MAX_CHARS;

    return (
      <div className={styles.container}>
        <div className={styles.formHeader}>
          <h3>{isNew ? "New Skill" : "Edit Skill"}</h3>
          <button className={styles.cancelButton} onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.formGroup}>
            <label>Skill Name</label>
            <InputComponent
              type="text"
              value={editingSkill.name}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) =>
                setEditingSkill((s: Skill | null) =>
                  s
                    ? {
                        ...s,
                        name: e.target.value
                          .replace(/[^a-zA-Z0-9_-]/g, "-")
                          .toLowerCase(),
                      }
                    : null,
                )
              }
              placeholder="javascript-conventions"
            />
            <span className={styles.hint}>
              kebab-case identifier for this skill
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Description</label>
            <InputComponent
              type="text"
              value={editingSkill.description || ""}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) =>
                setEditingSkill((s: Skill | null) =>
                  s
                    ? {
                        ...s,
                        description: e.target.value,
                      }
                    : null,
                )
              }
              placeholder="Coding style rules and project conventions"
            />
            <span className={styles.hint}>
              Short summary shown in the skill list
            </span>
          </div>

          <div className={styles.formGroup}>
            <label>Content (Markdown)</label>
            <TextAreaComponent
              className={styles.contentTextarea}
              value={editingSkill.content || ""}
              onChange={(
                e: React.ChangeEvent<HTMLTextAreaElement>,
              ) => {
                const value = e.target.value;
                if (value.length <= CONTENT_MAX_CHARS) {
                  setEditingSkill((s: Skill | null) =>
                    s ? { ...s, content: value } : null,
                  );
                }
              }}
              placeholder={`## Coding Guidelines\n\n- Always use const over let\n- Prefer async/await over .then()\n- Use JSDoc comments for public functions\n- ...`}
              autoResize={false}
            />
            <div
              className={`${styles.charCounter} ${isOverMax ? styles.charCounterDanger : isOverWarn ? styles.charCounterWarn : ""}`}
            >
              {contentLen.toLocaleString()} /{" "}
              {CONTENT_MAX_CHARS.toLocaleString()} chars
              {isOverWarn && !isOverMax && " ⚠️ nearing limit"}
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={
                saving ||
                !editingSkill.name?.trim() ||
                !editingSkill.content?.trim()
              }
            >
              <Save size={14} />
              {saving ? "Saving..." : isNew ? "Create Skill" : "Save Changes"}
            </button>
            <button className={styles.cancelFormButton} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -- List View ------------------------------------------------

  return (
    <div className={styles.container}>
      {skills.length > 0 && (
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search skills…"
          compact
        />
      )}

      {skills.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Sparkles size={24} />
          </div>
          <div className={styles.emptyTitle}>No skills yet</div>
          <div className={styles.emptySubtitle}>
            Skills are Markdown knowledge blocks injected into the agent&apos;s
            system prompt. Add coding conventions, project rules, or
            domain-specific context.
          </div>
          <ButtonComponent
            variant="disabled"
            icon={Plus}
            onClick={handleCreate}
          >
            Create your first skill
          </ButtonComponent>
        </div>
      )}

      {skills.length > 0 && filteredSkills.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No matching skills</div>
          <div className={styles.emptySubtitle}>
            Try adjusting your search query.
          </div>
        </div>
      )}

      {filteredSkills.map((skill: Skill) => {
        const skillId = skill.id || skill._id?.toString() || "";
        const isConfirming = confirmingDeleteId === skillId;

        return (
          <div
            key={skillId}
            className={`${styles.skillCard} ${!skill.enabled ? styles.skillCardDisabled : ""}`}
          >
            <div className={styles.skillCardHeader}>
              <div className={styles.skillIcon}>
                <BookOpen size={14} />
              </div>
              <div className={styles.skillInfo}>
                <div className={styles.skillName}>{skill.name}</div>
                {skill.description && (
                  <div className={styles.skillDescription}>
                    {skill.description}
                  </div>
                )}
              </div>
              <div className={styles.skillActions}>
                <button
                  className={styles.skillActionButton}
                  onClick={() => handleEdit(skill)}
                  title="Edit skill"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  className={`${styles.skillActionButton} ${styles.skillDeleteButton}`}
                  onClick={() => handleDelete(skillId)}
                  title="Delete skill"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {skill.content && (
              <div className={styles.skillContentPreview}>{skill.content}</div>
            )}

            {skill.content && (
              <div
                className={`${styles.skillCharCount} ${skill.content.length > CONTENT_WARN_CHARS ? styles.skillCharCountWarn : ""}`}
              >
                {skill.content.length.toLocaleString()} chars
              </div>
            )}

            {isConfirming && (
              <div className={styles.confirmLayoutRow}>
                <span className={styles.confirmLabel}>
                  Delete &ldquo;{skill.name}&rdquo;?
                </span>
                <button
                  className={`${styles.confirmButton} ${styles.confirmBtnYes}`}
                  onClick={() => confirmDelete(skillId)}
                >
                  Delete
                </button>
                <button
                  className={`${styles.confirmButton} ${styles.confirmBtnNo}`}
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
