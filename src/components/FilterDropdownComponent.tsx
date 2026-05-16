"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  X,
  Filter,
  Calendar,
} from "lucide-react";
import { DatePickerComponent, DATE_PRESETS, formatDateDisplay, getActiveDatePreset } from "@rodrigo-barraza/components-library";
import SoundService from "@/services/SoundService";
import styles from "./FilterDropdownComponent.module.css";

/**
 * FilterDropdownComponent — generic dropdown + badge (chip) filter.
 *
 * @param {Object[]} groups — array of filter groups:
 *   { label: string, items: [{ key, icon, title, color?, providerLogo? }], activeKeys: Set|string, onToggle: fn, isSingleSelect?: boolean }
 *
 * @param {Object} dateRange — { from, to } or undefined if no date filtering
 * @param {Function} onDateChange — setter for dateRange
 * @param {string} dateStorageKey — localStorage key for date persistence
 * @param {React.ReactNode} renderIcon — optional custom icon renderer for provider logos etc.
 */
export default function FilterDropdownComponent({
  groups = [],
  // @ts-ignore
  // @ts-ignore
  dateRange: any,
  // @ts-ignore
  // @ts-ignore
  onDateChange: any,
  // @ts-ignore
  // @ts-ignore
  dateStorageKey: any,
  triggerLabel = "Filters",
  fullWidth = false,
}) {
  const [isOpen, setIsOpen] = useState<any>(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState<any>(false);
  const dropdownRef = useRef<any>(null);
  const initializedDateRef = useRef<any>(false);

  // @ts-ignore
  const showDateRange = !!onDateChange;

  const hasAnyOptions = groups.length > 0 || showDateRange;

  // Restore date range from localStorage on mount
  useEffect(() => {
    // @ts-ignore
    // @ts-ignore
    if (!dateStorageKey || !onDateChange || initializedDateRef.current) return;
    initializedDateRef.current = true;
    try {
      // @ts-ignore
      const stored = localStorage.getItem(dateStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // @ts-ignore
        if (parsed.from || parsed.to) onDateChange(parsed);
      }
    } catch { /* ignore */ }
  // @ts-ignore
  }, [dateStorageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist date range to localStorage
  useEffect(() => {
    // @ts-ignore
    if (!dateStorageKey || !initializedDateRef.current) return;
    try {
      // @ts-ignore
      // @ts-ignore
      if (dateRange?.from || dateRange?.to) {
        // @ts-ignore
        // @ts-ignore
        localStorage.setItem(dateStorageKey, JSON.stringify(dateRange));
      } else {
        // @ts-ignore
        localStorage.removeItem(dateStorageKey);
      }
    } catch { /* ignore */ }
  // @ts-ignore
  // @ts-ignore
  }, [dateStorageKey, dateRange]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: any) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  if (!hasAnyOptions) return null;

  // Collect badges
  const badges = [];
  // @ts-ignore
  const dateFrom = dateRange?.from || "";
  // @ts-ignore
  const dateTo = dateRange?.to || "";

  for (const group of groups) {
    const { items = [], activeKeys, isSingleSelect, onToggle } = group;
    for (const item of items) {
      const isActive = isSingleSelect
        // @ts-ignore
        ? activeKeys === item.key
        // @ts-ignore
        // @ts-ignore
        // @ts-ignore
        : activeKeys instanceof Set ? activeKeys.has(item.key) : false;
      if (isActive) {
        badges.push({
          // @ts-ignore
          // @ts-ignore
          key: `${group.label}-${item.key}`,
          // @ts-ignore
          label: item.title,
          // @ts-ignore
          icon: item.icon,
          // @ts-ignore
          color: item.color,
          // @ts-ignore
          // @ts-ignore
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
      // @ts-ignore
      onRemove: () => onDateChange({ from: "", to: "" }),
    });
  }

  return (
    <div className={styles.filterSection} style={fullWidth ? { width: "100%", boxSizing: "border-box", padding: "0 12px" } : undefined}>
      <div className={styles.filterRow} style={fullWidth ? { flexDirection: "column" } : undefined}>
        {/* -- Dropdown trigger -- */}
        <div className={styles.dropdownWrapper} ref={dropdownRef} style={fullWidth ? { width: "100%" } : undefined}>
          <button
            type="button"
            className={`${styles.dropdownTrigger} ${isOpen ? styles.dropdownTriggerOpen : ""}`}
            // @ts-ignore
            {...SoundService.interactive(() => setIsOpen((v: any) => !v))}
            style={fullWidth ? { width: "100%" } : undefined}
          >
            <span className={styles.triggerContent}>
              <span className={styles.triggerIcon}>
                <Filter size={14} />
              </span>
              <span className={styles.triggerText}>{triggerLabel}</span>
              {badges.length > 0 && (
                <span className={styles.triggerCount}>{badges.length}</span>
              )}
            </span>
            <ChevronDown
              size={14}
              className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
            />
          </button>

          {/* -- Dropdown menu -- */}
          {isOpen && (
            <div className={styles.dropdownMenu}>
              {/* -- Date range presets (top) -- */}
              {showDateRange && (
                <div className={styles.menuGroup}>
                  <div className={styles.menuGroupLabel}>Date Range</div>
                  {DATE_PRESETS.map((preset: any) => {
                    const isActive = getActiveDatePreset(dateFrom, dateTo) === preset.label;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ""}`}
                        // @ts-ignore
                        // @ts-ignore
                        {...SoundService.interactive(() => onDateChange(preset.getValue()))}
                      >
                        <Calendar size={13} style={{ color: "#6366f1" }} />
                        <span>{preset.label}</span>
                        {isActive && (
                          <span className={styles.menuCheck}>✓</span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`${styles.menuItem} ${!getActiveDatePreset(dateFrom, dateTo) && (dateFrom || dateTo) ? styles.menuItemActive : ""}`}
                    // @ts-ignore
                    {...SoundService.interactive(() => {
                      setShowCustomDatePicker(true);
                      setIsOpen(false);
                    })}
                  >
                    <Calendar size={13} style={{ color: "#6366f1" }} />
                    <span>Custom…</span>
                    {!getActiveDatePreset(dateFrom, dateTo) && (dateFrom || dateTo) && (
                      <span className={styles.menuCheck}>✓</span>
                    )}
                  </button>
                </div>
              )}

              {/* -- Dynamic filter groups -- */}
              {groups.map((group) => {
                const { label, items = [], activeKeys, isSingleSelect, onToggle } = group;
                if (items.length === 0) return null;
                return (
                  <div key={label} className={styles.menuGroup}>
                    <div className={styles.menuGroupLabel}>{label}</div>
                    {items.map((item) => {
                      // @ts-ignore
                      const Icon = item.icon;
                      const isActive = isSingleSelect
                        // @ts-ignore
                        ? activeKeys === item.key
                        // @ts-ignore
                        // @ts-ignore
                        // @ts-ignore
                        : activeKeys instanceof Set ? activeKeys.has(item.key) : false;
                      return (
                        <button
                          // @ts-ignore
                          key={item.key}
                          type="button"
                          className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ""}`}
                          // @ts-ignore
                          // @ts-ignore
                          // @ts-ignore
                          {...SoundService.interactive(() => onToggle(isSingleSelect && isActive ? null : item.key))}
                        >
                          {Icon && (
                            <Icon
                              size={13}
                              // @ts-ignore
                              // @ts-ignore
                              style={item.color ? { color: item.color } : undefined}
                            />
                          )}
                          {/* @ts-ignore */}
                          <span>{item.title}</span>
                          {isActive && (
                            <span className={styles.menuCheck}>✓</span>
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
            onChange={(val: any) => {
              // @ts-ignore
              onDateChange(val);
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
        <div className={styles.badgeList}>
          {badges.map((b) => {
            const Icon = b.icon;
            return (
              <span
                key={b.key}
                className={styles.badge}
                style={
                  b.color
                    ? {
                        // @ts-ignore
                        "--badge-color": b.color,
                        "--badge-bg": `${b.color}18`,
                        "--badge-border": `${b.color}40`,
                      }
                    : undefined
                }
              >
                {Icon && <Icon size={11} />}
                <span className={styles.badgeLabel}>{b.label}</span>
                <button
                  type="button"
                  className={styles.badgeRemove}
                  onClick={(e) => {
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
  );
}
