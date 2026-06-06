"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Star,
  Type,
  Image,
  Volume2,
  Video,
  FileText as DocIcon,
  Globe,
  Code,
  Brain,
  Parentheses,
  ChevronDown,
  X,
  Filter,
  Calendar,
} from "lucide-react";
import ProviderLogo from "./ProviderLogosComponent";
import { resolveProviderLabel } from "./ProviderLogosComponent";
import { MODALITY_COLORS, TOOL_COLORS } from "./WorkflowNodeConstantsComponent";
import {
  DatePickerComponent,
  DATE_PRESETS,
  formatDateDisplay,
  getActiveDatePreset,
} from "@rodrigo-barraza/components-library";
import styles from "./SidebarFilterComponent.module.css";
import type { LucideIcon } from "lucide-react";

interface SidebarFilterItem {
  key: string;
  icon: LucideIcon;
  title: string;
  color?: string;
}

interface FilterBadge {
  key: string;
  label: string;
  icon?: LucideIcon;
  color?: string;
  providerKey?: string;
  onRemove: () => void;
}

interface DateRange {
  from: string;
  to: string;
}

interface DatePreset {
  label: string;
  getValue: () => DateRange;
}

interface SidebarFilterProps {
  modalities?: SidebarFilterItem[];
  tools?: SidebarFilterItem[];
  providers?: string[];
  activeModalities?: Set<string>;
  activeTools?: Set<string>;
  activeProviders?: Set<string>;
  onModalityChange?: (next: Set<string>) => void;
  onToolChange?: (next: Set<string>) => void;
  onProviderChange?: (next: Set<string>) => void;
  showFavoritesOnly?: boolean;
  onFavoritesToggle?: () => void;
  _hasFavorites?: boolean;
  dateRange?: DateRange;
  onDateChange?: (range: DateRange) => void;
  dateStorageKey?: string;
  triggerLabel?: string;
  toolsGroupLabel?: string;
}

const MODALITY_FILTERS = [
  { key: "text", icon: Type, title: "Text", color: MODALITY_COLORS.text },
  { key: "image", icon: Image, title: "Image", color: MODALITY_COLORS.image },
  { key: "audio", icon: Volume2, title: "Audio", color: MODALITY_COLORS.audio },
  { key: "video", icon: Video, title: "Video", color: MODALITY_COLORS.video },
  { key: "doc", icon: DocIcon, title: "Document", color: MODALITY_COLORS.pdf },
];

const TOOL_FILTERS = [
  {
    key: "thinking",
    icon: Brain,
    title: "Thinking",
    color: TOOL_COLORS["Thinking"],
  },
  {
    key: "webSearch",
    icon: Globe,
    title: "Web Search",
    color: TOOL_COLORS["Web Search"],
  },
  {
    key: "codeExecution",
    icon: Code,
    title: "Code Execution",
    color: TOOL_COLORS["Code Execution"],
  },
  {
    key: "functionCalling",
    icon: Parentheses,
    title: "Tool Calling",
    color: TOOL_COLORS["Tool Calling"],
  },
];

/**
 * SidebarFilterComponent — dropdown + badge (chip) filter for sidebar panels.
 * A dropdown on the left lists available filters by category.
 * Selecting an option toggles it and displays a read-only badge to the right.
 * Badges are display-only and not clickable.
 */
export default function SidebarFilterComponent({
  modalities = [],
  tools = [],
  providers = [],
  activeModalities = new Set(),
  activeTools = new Set(),
  activeProviders = new Set(),
  onModalityChange,
  onToolChange,
  onProviderChange,
  showFavoritesOnly = false,
  onFavoritesToggle,
  _hasFavorites = false,
  dateRange,
  onDateChange,
  dateStorageKey,
  triggerLabel = "Filters",
  toolsGroupLabel = "Tools",
}: SidebarFilterProps) {
  const initializedDateRef = useRef<boolean>(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const showFavoriteRow = !!onFavoritesToggle;
  const showModalityRow = modalities.length >= 2;
  const showToolRow = tools.length >= 1;
  const showProviderRow = providers.length >= 2;

  const showDateRange = !!onDateChange;

  // Restore date range from localStorage on mount
  useEffect(() => {
    if (!dateStorageKey || !onDateChange || initializedDateRef.current) return;
    initializedDateRef.current = true;
    try {
      const stored = localStorage.getItem(dateStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.from || parsed.to) onDateChange(parsed);
      }
    } catch (e) {
      /* ignore */
    }
  }, [dateStorageKey, onDateChange]);

  // Persist date range to localStorage
  useEffect(() => {
    if (!dateStorageKey || !initializedDateRef.current) return;
    try {
      if (dateRange?.from || dateRange?.to) {
        localStorage.setItem(dateStorageKey, JSON.stringify(dateRange));
      } else {
        localStorage.removeItem(dateStorageKey);
      }
    } catch {
      /* ignore */
    }
  }, [dateStorageKey, dateRange]);

  const hasAnyOptions =
    showFavoriteRow ||
    showModalityRow ||
    showToolRow ||
    showProviderRow ||
    showDateRange;

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const toggleModality = useCallback(
    (key: string) => {
      const next = new Set(activeModalities);
      next.has(key) ? next.delete(key) : next.add(key);
      onModalityChange?.(next);
    },
    [activeModalities, onModalityChange],
  );

  const toggleTool = useCallback(
    (key: string) => {
      const next = new Set(activeTools);
      next.has(key) ? next.delete(key) : next.add(key);
      onToolChange?.(next);
    },
    [activeTools, onToolChange],
  );

  const toggleProvider = useCallback(
    (key: string) => {
      const next = new Set(activeProviders);
      next.has(key) ? next.delete(key) : next.add(key);
      onProviderChange?.(next);
    },
    [activeProviders, onProviderChange],
  );

  if (!hasAnyOptions) return null;

  // Collect active badges for display
  const badges: FilterBadge[] = [];

  if (showFavoritesOnly) {
    badges.push({
      key: "fav",
      label: "Favorites",
      icon: Star,
      color: "#eab308",
      onRemove: () => onFavoritesToggle?.(),
    });
  }

  for (const m of modalities) {
    if (activeModalities.has(m.key)) {
      badges.push({
        key: `mod-${m.key}`,
        label: m.title,
        icon: m.icon,
        color: m.color,
        onRemove: () => toggleModality(m.key),
      });
    }
  }

  for (const t of tools) {
    if (activeTools.has(t.key)) {
      badges.push({
        key: `tool-${t.key}`,
        label: t.title,
        icon: t.icon,
        color: t.color,
        onRemove: () => toggleTool(t.key),
      });
    }
  }

  for (const p of providers) {
    if (activeProviders.has(p)) {
      badges.push({
        key: `prov-${p}`,
        label: resolveProviderLabel(p) || p,
        providerKey: p,
        onRemove: () => toggleProvider(p),
      });
    }
  }

  // Date range badge
  const dateFrom = dateRange?.from || "";
  const dateTo = dateRange?.to || "";
  const dateLabel = formatDateDisplay(dateFrom, dateTo);
  if (dateLabel) {
    badges.push({
      key: "date",
      label: dateLabel,
      icon: Calendar,
      color: "#6366f1",
      onRemove: () => onDateChange?.({ from: "", to: "" }),
    });
  }

  return (
    <div className={styles['filter-section']}>
      <div className={styles['filter-row']}>
        {/* -- Dropdown trigger -- */}
        <div className={styles['dropdown-wrapper']} ref={dropdownRef}>
          <button
            type="button"
            className={`${styles['dropdown-trigger']} ${isOpen ? styles['dropdown-trigger-open'] : ""}`}
            onClick={() => setIsOpen((v) => !v)}
          >
            <span className={styles['trigger-content']}>
              <span className={styles['trigger-icon']}>
                <Filter size={14} />
              </span>
              <span className={styles['trigger-text']}>{triggerLabel}</span>
              {badges.length > 0 && (
                <span className={styles['trigger-count']}>{badges.length}</span>
              )}
            </span>
            <ChevronDown
              size={14}
              className={`${styles['chevron']} ${isOpen ? styles['chevron-open'] : ""}`}
            />
          </button>

          {/* -- Dropdown menu -- */}
          {isOpen && (
            <div className={styles['dropdown-menu']}>
              {/* -- Date range presets (top) -- */}
              {showDateRange && (
                <div className={styles['menu-group']}>
                  <div className={styles['menu-group-label']}>Date Range</div>
                  {DATE_PRESETS.map((preset: DatePreset) => {
                    const isActive =
                      getActiveDatePreset(dateFrom, dateTo) === preset.label;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={`${styles['menu-item']} ${isActive ? styles['menu-item-active'] : ""}`}
                        onClick={() => onDateChange(preset.getValue())}
                      >
                        <Calendar size={13} style={{ color: "#6366f1" }} />
                        <span>{preset.label}</span>
                        {isActive && (
                          <span className={styles['menu-check']}>✓</span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`${styles['menu-item']} ${!getActiveDatePreset(dateFrom, dateTo) && (dateFrom || dateTo) ? styles['menu-item-active'] : ""}`}
                    onClick={() => {
                      setShowCustomDatePicker(true);
                      setIsOpen(false);
                    }}
                  >
                    <Calendar size={13} style={{ color: "#6366f1" }} />
                    <span>Custom…</span>
                    {!getActiveDatePreset(dateFrom, dateTo) &&
                      (dateFrom || dateTo) && (
                        <span className={styles['menu-check']}>✓</span>
                      )}
                  </button>
                </div>
              )}

              {showFavoriteRow && (
                <div className={styles['menu-group']}>
                  <div className={styles['menu-group-label']}>Favorites</div>
                  <button
                    type="button"
                    className={`${styles['menu-item']} ${showFavoritesOnly ? styles['menu-item-active'] : ""}`}
                    onClick={() => {
                      onFavoritesToggle();
                    }}
                  >
                    <Star size={13} style={{ color: "#eab308" }} />
                    <span>Favorites Only</span>
                    {showFavoritesOnly && (
                      <span className={styles['menu-check']}>✓</span>
                    )}
                  </button>
                </div>
              )}

              {showModalityRow && (
                <div className={styles['menu-group']}>
                  <div className={styles['menu-group-label']}>Modality</div>
                  {modalities.map((m: SidebarFilterItem) => {
                    const Icon = m.icon;
                    const isActive = activeModalities.has(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        className={`${styles['menu-item']} ${isActive ? styles['menu-item-active'] : ""}`}
                        onClick={() => toggleModality(m.key)}
                      >
                        <Icon
                          size={13}
                          style={m.color ? { color: m.color } : undefined}
                        />
                        <span>{m.title}</span>
                        {isActive && (
                          <span className={styles['menu-check']}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {showToolRow && (
                <div className={styles['menu-group']}>
                  <div className={styles['menu-group-label']}>{toolsGroupLabel}</div>
                  {tools.map((t: SidebarFilterItem) => {
                    const Icon = t.icon;
                    const isActive = activeTools.has(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        className={`${styles['menu-item']} ${isActive ? styles['menu-item-active'] : ""}`}
                        onClick={() => toggleTool(t.key)}
                      >
                        <Icon
                          size={13}
                          style={t.color ? { color: t.color } : undefined}
                        />
                        <span>{t.title}</span>
                        {isActive && (
                          <span className={styles['menu-check']}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {showProviderRow && (
                <div className={styles['menu-group']}>
                  <div className={styles['menu-group-label']}>Providers</div>
                  {providers.map((p: string) => {
                    const isActive = activeProviders.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`${styles['menu-item']} ${isActive ? styles['menu-item-active'] : ""}`}
                        onClick={() => toggleProvider(p)}
                      >
                        <ProviderLogo provider={p} size={13} />
                        <span>{resolveProviderLabel(p)}</span>
                        {isActive && (
                          <span className={styles['menu-check']}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* -- Custom DatePicker (shown when "Custom…" is clicked) -- */}
        {showCustomDatePicker && showDateRange && (
          <DatePickerComponent
            from={dateFrom}
            to={dateTo}
            onChange={(value: DateRange) => {
              onDateChange(value);
              setShowCustomDatePicker(false);
            }}
            placeholder="Pick range…"
            defaultOpen
            hideTrigger
            onClose={() => setShowCustomDatePicker(false)}
          />
        )}

        {/* -- Active filter badges (display-only) -- */}
        {badges.length > 0 && (
          <div className={styles['badge-list']}>
            {badges.map((b: FilterBadge) => {
              const Icon = b.icon;
              return (
                <span
                  key={b.key}
                  className={styles['badge']}
                  style={
                    b.color
                      ? ({
                          "--badge-color": b.color,
                          "--badge-background": `${b.color}18`,
                          "--badge-border": `${b.color}40`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  {b.providerKey ? (
                    <ProviderLogo provider={b.providerKey} size={11} />
                  ) : Icon ? (
                    <Icon size={11} />
                  ) : null}
                  <span className={styles['badge-label']}>{b.label}</span>
                  <button
                    type="button"
                    className={styles['badge-remove']}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      b.onRemove();
                    }}
                    aria-label={`Remove ${b.label} filter`}
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { MODALITY_FILTERS, TOOL_FILTERS };
