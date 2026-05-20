"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, X } from "lucide-react";
import styles from "./ComboboxFilterComponent.module.css";

/**
 * Combobox filter: an input that shows a filtered dropdown as you type.
 *
 *  options:     string[] of available values
 *  value:       current selected value ("" = all)
 *  onChange:    called with selected value
 *  placeholder: input placeholder text
 *  allLabel:    label for "All" option (default: "All")
 */
export default function ComboboxFilter({
  options = [],
  value = "",
  onChange,
  placeholder = "Search...",
  allLabel = "All",
}: unknown) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLDivElement | null>(null);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
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
    const handleClick = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (
        containerRef.current &&
        !containerRef.current!.contains(e.target)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={styles.combobox} ref={containerRef}>
      <div
        className={`${styles.inputWrapper} ${open ? styles.inputWrapperOpen : ""}`}
      >
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={value || placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button
            className={styles.clearBtn}
            onClick={handleClear}
            title="Clear"
          >
            <X size={12} />
          </button>
        ) : (
          <ChevronDown
            size={12}
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          />
        )}
      </div>

      {open && (
        <div className={styles.menu}>
          <button
            type="button"
            className={`${styles.option} ${!value ? styles.optionSelected : ""}`}
            onClick={() => handleSelect("")}
          >
            {allLabel}
          </button>
          {filtered.length === 0 && (
            <div className={styles.noResults}>No matches</div>
          )}
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`${styles.option} ${opt === value ? styles.optionSelected : ""}`}
              onClick={() => handleSelect(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
