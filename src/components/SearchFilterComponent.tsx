"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import styles from "./SearchFilterComponent.module.css";

/**
 * SearchFilterComponent — A searchable combobox styled like FilterDropdownComponent.
 *
 * When a value is selected, it renders as a removable badge chip below the trigger,
 * matching the badge pattern from FilterDropdownComponent.
 */
import { LucideIcon } from "lucide-react";

export interface SearchFilterComponentProps {
  options?: string[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
  badgeColor?: string;
  icon?: LucideIcon;
}

export default function SearchFilterComponent({
  options = [],
  value = "",
  onChange,
  placeholder = "Search...",
  allLabel = "All",
  badgeColor,
  icon: Icon = Search,
}: SearchFilterComponentProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = query
    ? options.filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    : options;

  const handleSelect = useCallback(
    (value: string) => {
      onChange(value);
      setQuery("");
      setOpen(false);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange("");
    setQuery("");
    setOpen(false);
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (!open) setOpen(true);
  };

  const handleFocus = () => {
    setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter" && filtered.length === 1) {
      handleSelect(filtered[0]);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div className={`search-filter-component ${styles['wrapper']}`}>
      {/* -- Trigger -- */}
      <div className={styles['container']} ref={containerRef}>
        <div
          className={`${styles['trigger']} ${open ? styles['trigger-open'] : ""}`}
          onClick={() => inputRef.current?.focus()}
        >
          <span className={styles['trigger-icon']}>
            <Icon size={14} />
          </span>
          <input
            ref={inputRef}
            type="text"
            className={styles['input']}
            placeholder={value || placeholder}
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
          />
          <ChevronDown
            size={14}
            className={`${styles['chevron']} ${open ? styles['chevron-open'] : ""}`}
          />
        </div>

        {/* -- Dropdown Menu -- */}
        {open && (
          <div className={styles['menu']}>
            <button
              type="button"
              className={`${styles['menu-item']} ${!value ? styles['menu-item-is-active-state'] : ""}`}
              onClick={() => handleSelect("")}
            >
              <span>{allLabel}</span>
              {!value && <span className={styles['menu-check']}>✓</span>}
            </button>
            {filtered.length === 0 && (
              <div className={styles['no-results']}>No matches</div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`${styles['menu-item']} ${opt === value ? styles['menu-item-is-active-state'] : ""}`}
                onClick={() => handleSelect(opt)}
              >
                <span>{opt}</span>
                {opt === value && <span className={styles['menu-check']}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* -- Selected value badge -- */}
      {value && (
        <div className={styles['badge-list']}>
          <span
            className={styles['badge']}
            style={
              badgeColor
                ? ({
                    "--badge-color": badgeColor,
                    "--badge-background": `${badgeColor}18`,
                    "--badge-border": `${badgeColor}40`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <Icon size={11} />
            <span className={styles['badge-label']}>{value}</span>
            <button
              type="button"
              className={styles['badge-remove']}
              onClick={handleClear}
              aria-label={`Clear ${value}`}
            >
              <X size={10} />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
