"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Filter, Calendar } from "lucide-react";
import {
  DatePickerComponent,
  DATE_PRESETS,
  formatDateDisplay,
  getActiveDatePreset,
} from "@rodrigo-barraza/components-library";
import SoundService from "@/services/SoundService";
import styles from "./FilterDropdownComponent.module.css";

import { LucideIcon } from "lucide-react";

export interface FilterItem {
  key: string;
  icon?:
    | LucideIcon
    | React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title?: string;
  color?: string;
}

export interface FilterGroup {
  label: string;
  items: FilterItem[];
  activeKeys: string | Set<string> | null;
  isSingleSelect?: boolean;
  onToggle: (key: string | null) => void;
}

export interface FilterDropdownComponentProps {
  groups?: FilterGroup[];
  dateRange?: { from: string; to: string };
  onDateChange?: (range: { from: string; to: string }) => void;
  dateStorageKey?: string;
  triggerLabel?: string;
  fullWidth?: boolean;
}

export default function FilterDropdownComponent({
  groups = [],
  dateRange,
  onDateChange,
  dateStorageKey,
  triggerLabel = "Filters",
  fullWidth = false,
}: FilterDropdownComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const initializedDateRef = useRef<boolean>(false);

  const showDateRange = !!onDateChange;

  const hasAnyOptions = groups.length > 0 || showDateRange;

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

  // Close on outside click
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

  if (!hasAnyOptions) return null;

  // Collect badges
  const badges = [];
  const dateFrom = dateRange?.from || "";
  const dateTo = dateRange?.to || "";

  for (const group of groups) {
    const { items = [], activeKeys, isSingleSelect, onToggle } = group;
    for (const item of items) {
      const isActive = isSingleSelect
        ? activeKeys === item.key
        : activeKeys instanceof Set
          ? activeKeys.has(item.key)
          : false;
      if (isActive) {
        badges.push({
          key: `${group.label}-${item.key}`,
          label: item.title,
          icon: item.icon,
          color: item.color,
          onRemove: () => onToggle(isSingleSelect ? null : item.key),
        });
      }
    }
  }

  // Date badge
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
    <div
      className={`filter-dropdown-component ${styles["filter-section-card"]}`}
      style={
        fullWidth
          ? { width: "100%", boxSizing: "border-box", padding: "0 12px" }
          : undefined
      }
    >
      <div
        className={styles['filter-layout-row']}
        style={fullWidth ? { flexDirection: "column" } : undefined}
      >
        {/* -- Dropdown trigger -- */}
        <div
          className={styles['dropdown-wrapper']}
          ref={dropdownRef}
          style={fullWidth ? { width: "100%" } : undefined}
        >
          <button
            type="button"
            className={`${styles['dropdown-trigger']} ${isOpen ? styles['dropdown-trigger-open'] : ""}`}
            {...(SoundService.interactive(() => setIsOpen((value) => !value)) as Record<
              string,
              React.MouseEventHandler
            >)}
            style={fullWidth ? { width: "100%" } : undefined}
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
                  {DATE_PRESETS.map(
                    (preset: {
                      label: string;
                      getValue: () => { from: string; to: string };
                    }) => {
                      const isActive =
                        getActiveDatePreset(dateFrom, dateTo) === preset.label;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          className={`${styles['menu-item']} ${isActive ? styles['menu-item-is-active-state'] : ""}`}
                          {...(SoundService.interactive(() =>
                            onDateChange(preset.getValue()),
                          ) as Record<string, React.MouseEventHandler>)}
                        >
                          <Calendar size={13} style={{ color: "#6366f1" }} />
                          <span>{preset.label}</span>
                          {isActive && (
                            <span className={styles['menu-check']}>✓</span>
                          )}
                        </button>
                      );
                    },
                  )}
                  <button
                    type="button"
                    className={`${styles['menu-item']} ${!getActiveDatePreset(dateFrom, dateTo) && (dateFrom || dateTo) ? styles['menu-item-is-active-state'] : ""}`}
                    {...(SoundService.interactive(() => {
                      setShowCustomDatePicker(true);
                      setIsOpen(false);
                    }) as Record<string, React.MouseEventHandler>)}
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

              {/* -- Dynamic filter groups -- */}
              {groups.map((group) => {
                const {
                  label,
                  items = [],
                  activeKeys,
                  isSingleSelect,
                  onToggle,
                } = group;
                if (items.length === 0) return null;
                return (
                  <div key={label} className={styles['menu-group']}>
                    <div className={styles['menu-group-label']}>{label}</div>
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isActive = isSingleSelect
                        ? activeKeys === item.key
                        : activeKeys instanceof Set
                          ? activeKeys.has(item.key)
                          : false;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles['menu-item']} ${isActive ? styles['menu-item-is-active-state'] : ""}`}
                          {...(SoundService.interactive(() =>
                            onToggle(
                              isSingleSelect && isActive ? null : item.key,
                            ),
                          ) as Record<string, React.MouseEventHandler>)}
                        >
                          {Icon && (
                            <Icon
                              size={13}
                              style={
                                item.color ? { color: item.color } : undefined
                              }
                            />
                          )}
                          <span>{item.title}</span>
                          {isActive && (
                            <span className={styles['menu-check']}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* -- Custom DatePicker -- */}
        {showCustomDatePicker && showDateRange && (
          <DatePickerComponent
            from={dateFrom}
            to={dateTo}
            onChange={(value: { from: string; to: string }) => {
              onDateChange(value);
              setShowCustomDatePicker(false);
            }}
            placeholder="Pick range…"
            defaultOpen
            hideTrigger
            onClose={() => setShowCustomDatePicker(false)}
          />
        )}
      </div>

      {/* -- Active filter badges -- */}
      {badges.length > 0 && (
        <div className={styles['badge-list']}>
          {badges.map((current) => {
            const Icon = current.icon;
            return (
              <span
                key={current.key}
                className={styles['badge']}
                style={
                  current.color
                    ? ({
                        "--badge-color": current.color,
                        "--badge-background": `${current.color}18`,
                        "--badge-border": `${current.color}40`,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {Icon && <Icon size={11} />}
                <span className={styles['badge-label']}>{current.label}</span>
                <button
                  type="button"
                  className={styles['badge-remove']}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    current.onRemove();
                  }}
                  aria-label={`Remove ${current.label} filter`}
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
