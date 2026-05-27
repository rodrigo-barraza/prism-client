"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Copy,
  Pencil,
  Check,
  X,
  Palette,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useTheme,
  CustomThemeService,
} from "@rodrigo-barraza/components-library";
import type {
  CustomTheme,
  CustomThemeTokens,
} from "@rodrigo-barraza/components-library";
const { getCustomThemeAttr } = CustomThemeService;
import styles from "./CustomThemeEditorComponent.module.css";

// ── Token Groups ───────────────────────────────────────────────────────

interface TokenField {
  key: keyof CustomThemeTokens;
  label: string;
}

const TOKEN_GROUPS: { title: string; fields: TokenField[] }[] = [
  {
    title: "Surfaces",
    fields: [
      { key: "backgroundBase", label: "Base Background" },
      { key: "backgroundSurface", label: "Surface" },
      { key: "backgroundElevated", label: "Elevated" },
    ],
  },
  {
    title: "Accent",
    fields: [
      { key: "primary", label: "Primary" },
      { key: "secondary", label: "Secondary" },
      { key: "tertiary", label: "Tertiary" },
    ],
  },
  {
    title: "Text",
    fields: [
      { key: "textPrimary", label: "Primary Text" },
      { key: "textSecondary", label: "Secondary Text" },
      { key: "textMuted", label: "Muted Text" },
    ],
  },
  {
    title: "Borders",
    fields: [
      { key: "borderColor", label: "Border Color" },
    ],
  },
  {
    title: "Semantic",
    fields: [
      { key: "success", label: "Success" },
      { key: "danger", label: "Danger" },
      { key: "warning", label: "Warning" },
      { key: "info", label: "Info" },
    ],
  },
];

// ── Built-in base themes for "clone from" ──────────────────────────────

const CLONE_BASES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "tropical", label: "Tropical" },
  { id: "oceanic", label: "Oceanic" },
  { id: "punk", label: "Punk" },
  { id: "ember", label: "Ember" },
];

// ── Component ──────────────────────────────────────────────────────────

interface CustomThemeEditorComponentProps {
  onThemesChange?: () => void;
}

export default function CustomThemeEditorComponent({
  onThemesChange,
}: CustomThemeEditorComponentProps) {
  const { theme: activeTheme, setTheme } = useTheme();

  // Theme list
  const [themes, setThemes] = useState<CustomTheme[]>([]);

  // Editor state
  const [editing, setEditing] = useState<CustomTheme | null>(null);
  const [editName, setEditName] = useState("");
  const [editTokens, setEditTokens] = useState<CustomThemeTokens | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Accent", "Surfaces"]));
  const [isNew, setIsNew] = useState(false);

  // "New theme" flow state
  const [showCloneMenu, setShowCloneMenu] = useState(false);

  // Confirmation for delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    setThemes(CustomThemeService.getAll());
  }, []);

  // Refresh themes list
  const refreshThemes = useCallback(() => {
    const updated = CustomThemeService.getAll();
    setThemes(updated);
    onThemesChange?.();
  }, [onThemesChange]);

  // ── Live preview injection while editing ────────────────────────────

  useEffect(() => {
    if (!editing || !editTokens) return;
    // Inject a temporary live-preview style while editing
    const tempTheme: CustomTheme = {
      ...editing,
      name: editName || editing.name,
      tokens: editTokens,
    };
    CustomThemeService.injectThemeStyle(tempTheme);
  }, [editing, editName, editTokens]);

  // ── Handlers ────────────────────────────────────────────────────────

  const handleNewTheme = useCallback((baseId: string) => {
    const baseTokens = CustomThemeService.getBuiltInPreset(baseId);
    const id = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const newTheme: CustomTheme = {
      id,
      name: "My Theme",
      icon: "Palette",
      tokens: { ...baseTokens },
      createdAt: now,
      updatedAt: now,
    };
    setEditing(newTheme);
    setEditName(newTheme.name);
    setEditTokens({ ...newTheme.tokens });
    setIsNew(true);
    setShowCloneMenu(false);
    setExpandedGroups(new Set(["Accent", "Surfaces"]));
  }, []);

  const handleEditTheme = useCallback((theme: CustomTheme) => {
    setEditing(theme);
    setEditName(theme.name);
    setEditTokens({ ...theme.tokens });
    setIsNew(false);
    setExpandedGroups(new Set(["Accent", "Surfaces"]));
  }, []);

  const handleSave = useCallback(() => {
    if (!editing || !editTokens) return;
    const saved: CustomTheme = {
      ...editing,
      name: editName.trim() || "Untitled Theme",
      tokens: { ...editTokens },
      updatedAt: new Date().toISOString(),
    };
    CustomThemeService.save(saved);
    refreshThemes();
    setEditing(null);
    setEditTokens(null);
    setIsNew(false);
  }, [editing, editName, editTokens, refreshThemes]);

  const handleCancel = useCallback(() => {
    if (isNew && editing) {
      // Remove the temporary injected style for a never-saved theme
      const styleEl = document.getElementById(`custom-theme-${editing.id}`);
      if (styleEl) styleEl.remove();
    } else if (editing) {
      // Re-inject the original saved version
      const original = CustomThemeService.getAll().find((t) => t.id === editing.id);
      if (original) CustomThemeService.injectThemeStyle(original);
    }
    setEditing(null);
    setEditTokens(null);
    setIsNew(false);
  }, [editing, isNew]);

  const handleDelete = useCallback((id: string) => {
    // Check if this theme is currently active
    const themeAttr = getCustomThemeAttr(id);
    if (activeTheme === themeAttr) {
      setTheme("dark"); // Fallback
    }
    const updated = CustomThemeService.remove(id);
    setThemes(updated);
    onThemesChange?.();
    setConfirmDeleteId(null);
  }, [activeTheme, setTheme, onThemesChange]);

  const handleDuplicate = useCallback((id: string) => {
    const result = CustomThemeService.duplicate(id);
    if (result) {
      setThemes(result.themes);
      onThemesChange?.();
    }
  }, [onThemesChange]);

  const handleApplyTheme = useCallback((theme: CustomTheme) => {
    const attr = getCustomThemeAttr(theme.id);
    setTheme(attr);
  }, [setTheme]);

  const handleTokenChange = useCallback((key: keyof CustomThemeTokens, value: string) => {
    setEditTokens((prev) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const toggleGroup = useCallback((title: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const handleConfirmDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className={styles.wrapper}>
      {/* Theme list */}
      {!editing && (
        <>
          {themes.length > 0 && (
            <div className={styles.themeList}>
              {themes.map((theme) => {
                const isActive = activeTheme === getCustomThemeAttr(theme.id);
                const isConfirmingDelete = confirmDeleteId === theme.id;

                return (
                  <div
                    key={theme.id}
                    className={`${styles.themeItem} ${isActive ? styles.themeItemActive : ""}`}
                  >
                    <button
                      className={styles.themeItemMain}
                      onClick={() => handleApplyTheme(theme)}
                      type="button"
                      title={`Apply ${theme.name}`}
                    >
                      <span className={styles.themeSwatchDual}>
                        <span
                          className={styles.themeSwatchHalf}
                          style={{ background: theme.tokens.primary }}
                        />
                        <span
                          className={styles.themeSwatchHalf}
                          style={{ background: theme.tokens.secondary }}
                        />
                      </span>
                      <span className={styles.themeItemName}>{theme.name}</span>
                      {isActive && (
                        <span className={styles.activeBadge}>
                          <Check size={10} strokeWidth={3} />
                          Active
                        </span>
                      )}
                    </button>
                    <div className={styles.themeItemActions}>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleEditTheme(theme)}
                        title="Edit"
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={() => handleDuplicate(theme.id)}
                        title="Duplicate"
                        type="button"
                      >
                        <Copy size={13} />
                      </button>
                      {isConfirmingDelete ? (
                        <button
                          className={`${styles.actionButton} ${styles.actionBtnDanger}`}
                          onClick={() => handleDelete(theme.id)}
                          title="Confirm delete"
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button
                          className={styles.actionButton}
                          onClick={() => handleConfirmDelete(theme.id)}
                          title="Delete"
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* New Theme button */}
          <div className={styles.newThemeRow}>
            <div className={styles.newThemeButtonWrapper}>
              <button
                className={styles.newThemeButton}
                onClick={() => setShowCloneMenu(!showCloneMenu)}
                type="button"
              >
                <Plus size={14} />
                New Theme
                <ChevronDown
                  size={12}
                  className={`${styles.newThemeChevron} ${showCloneMenu ? styles.newThemeChevronOpen : ""}`}
                />
              </button>

              {showCloneMenu && (
                <div className={styles.cloneMenu}>
                  <span className={styles.cloneMenuTitle}>Clone from</span>
                  {CLONE_BASES.map((base) => (
                    <button
                      key={base.id}
                      className={styles.cloneMenuItem}
                      onClick={() => handleNewTheme(base.id)}
                      type="button"
                    >
                      <span
                        className={styles.cloneMenuSwatch}
                        style={{
                          background: CustomThemeService.BUILT_IN_PRESETS[base.id]?.primary || "#888",
                        }}
                      />
                      {base.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {themes.length === 0 && (
            <div className={styles.emptyState}>
              <Palette size={24} style={{ color: "var(--text-muted)", margin: "0 auto" }} />
              <span className={styles.emptyTitle}>No custom themes yet</span>
              <span className={styles.emptyDescription}>
                Create a custom theme by cloning from a built-in base and tweaking the colors to your liking.
              </span>
            </div>
          )}
        </>
      )}

      {/* Editor panel */}
      {editing && editTokens && (
        <div className={styles.editor}>
          {/* Editor header */}
          <div className={styles.editorHeader}>
            <span className={styles.editorTitle}>
              {isNew ? "New Theme" : "Edit Theme"}
            </span>
            <div className={styles.editorActions}>
              <button
                className={styles.editorCancelButton}
                onClick={handleCancel}
                type="button"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                className={styles.editorSaveButton}
                onClick={handleSave}
                type="button"
              >
                <Check size={14} />
                Save
              </button>
            </div>
          </div>

          {/* Name input */}
          <div className={styles.editorNameRow}>
            <label className={styles.editorLabel}>Name</label>
            <input
              type="text"
              className={styles.editorNameInput}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Theme name"
              autoFocus
            />
          </div>

          {/* Live preview strip */}
          <div
            className={styles.livePreview}
            style={{
              "--preview-background": editTokens.backgroundBase,
              "--preview-background-secondary": editTokens.backgroundSurface,
              "--preview-background-tertiary": editTokens.backgroundElevated,
              "--preview-accent": editTokens.primary,
              "--preview-accent2": editTokens.secondary,
              "--preview-text": editTokens.textPrimary,
              "--preview-text2": editTokens.textSecondary,
              "--preview-text3": editTokens.textMuted,
              "--preview-border": editTokens.borderColor,
              "--preview-danger": editTokens.danger,
              "--preview-success": editTokens.success,
              "--preview-warning": editTokens.warning,
              "--preview-info": editTokens.info,
            } as React.CSSProperties}
          >
            <span className={styles.previewLabel}>Preview</span>
            <div className={styles.previewContent}>
              <div className={styles.previewSidebar}>
                <div className={styles.previewNavItem} data-is-active-state="true">
                  <span className={styles.previewDot} data-color-variant="accent" />
                  <span>Active</span>
                </div>
                <div className={styles.previewNavItem}>
                  <span className={styles.previewDot} data-color-variant="accent2" />
                  <span>Nav Item</span>
                </div>
                <div className={styles.previewNavItem}>
                  <span className={styles.previewDot} data-color-variant="muted" />
                  <span>Another</span>
                </div>
              </div>
              <div className={styles.previewMain}>
                <div className={styles.previewCard}>
                  <span className={styles.previewHeading}>Card Title</span>
                  <span className={styles.previewBody}>
                    Secondary text content with tertiary meta
                  </span>
                  <div className={styles.previewBadges}>
                    <span className={styles.previewBadge} data-color-variant="accent">
                      Accent
                    </span>
                    <span className={styles.previewBadge} data-color-variant="accent2">
                      Secondary
                    </span>
                    <span className={styles.previewBadge} data-color-variant="success">
                      Success
                    </span>
                    <span className={styles.previewBadge} data-color-variant="danger">
                      Error
                    </span>
                    <span className={styles.previewBadge} data-color-variant="warning">
                      Warning
                    </span>
                    <span className={styles.previewBadge} data-color-variant="info">
                      Info
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Token groups */}
          <div className={styles.tokenGroups}>
            {TOKEN_GROUPS.map((group) => {
              const isExpanded = expandedGroups.has(group.title);

              return (
                <div key={group.title} className={styles.tokenGroup}>
                  <button
                    className={`${styles.tokenGroupHeader} ${isExpanded ? styles.tokenGroupExpanded : ""}`}
                    onClick={() => toggleGroup(group.title)}
                    type="button"
                  >
                    <ChevronRight
                      size={13}
                      className={styles.tokenGroupChevron}
                    />
                    <span className={styles.tokenGroupTitle}>{group.title}</span>
                    <div className={styles.tokenGroupSwatches}>
                      {group.fields.map((field) => (
                        <span
                          key={field.key}
                          className={styles.tokenGroupMiniSwatch}
                          style={{ background: editTokens[field.key] }}
                        />
                      ))}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className={styles.tokenGroupBody}>
                      {group.fields.map((field) => (
                        <div key={field.key} className={styles.tokenRow}>
                          <label className={styles.tokenLabel}>
                            {field.label}
                          </label>
                          <div className={styles.tokenControl}>
                            <div className={styles.colorInputWrapper}>
                              <input
                                type="color"
                                className={styles.colorInput}
                                value={editTokens[field.key]}
                                onChange={(e) =>
                                  handleTokenChange(field.key, e.target.value)
                                }
                              />
                              <span
                                className={styles.colorSwatch}
                                style={{ background: editTokens[field.key] }}
                              />
                            </div>
                            <input
                              type="text"
                              className={styles.hexInput}
                              value={editTokens[field.key]}
                              onChange={(e) =>
                                handleTokenChange(field.key, e.target.value)
                              }
                              spellCheck={false}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Apply button */}
          <div className={styles.editorFooter}>
            <button
              className={styles.applyPreviewButton}
              onClick={() => {
                if (editing) {
                  handleSave();
                  const attr = getCustomThemeAttr(editing.id);
                  setTheme(attr);
                }
              }}
              type="button"
            >
              <Check size={14} />
              Save & Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
