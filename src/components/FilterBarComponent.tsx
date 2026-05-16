"use client";

import { Search } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./FilterBarComponent.module.css";

// @ts-ignore
export function FilterBarComponent({ children: any, className = "" }) {
  // @ts-ignore
  return <div className={`${styles.filterBar} ${className}`}>{children}</div>;
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export function FilterGroupComponent({ label: any, children: any }) {
  return (
    <div className={styles.filterGroup}>
      // @ts-ignore
      {/* @ts-ignore */}
      {label && <span className={styles.filterLabel}>{label}</span>}
      {/* @ts-ignore */}
      {children}
    </div>
  );
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export function FilterPillsComponent({ options: any, value: any, onChange: any }) {
  return (
    <div className={styles.pills}>
      {/* @ts-ignore */}
      {options.map((f: any) => {
        const Icon = f.icon;
        return (
          <button
            key={f.key}
            type="button"
            // @ts-ignore
            className={`${styles.pill} ${value === f.key ? styles.pillActive : ""}`}
            // @ts-ignore
            onClick={() => onChange(f.key)}
          >
            {Icon && (
              <Icon
                size={12}
                style={f.color ? { color: f.color } : undefined}
              />
            )}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInputComponent({
  // @ts-ignore
  // @ts-ignore
  value: any,
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  // @ts-ignore
  // @ts-ignore
  onSubmit: any,
  placeholder = "Search...",
}) {
  return (
    // @ts-ignore
    <form className={styles.searchBox} onSubmit={onSubmit}>
      <Search size={14} />
      <input
        type="text"
        placeholder={placeholder}
        // @ts-ignore
        value={value}
        // @ts-ignore
        onChange={(e) => onChange(e.target.value)}
        className={styles.searchInput}
      />
    </form>
  );
}

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export function ViewModeToggleComponent({ mode: any, onChange: any, modes: any }) {
  return (
    <div className={styles.viewToggle}>
      {/* @ts-ignore */}
      {modes.map((m: any) => {
        const Icon = m.icon;
        return (
          <TooltipComponent key={m.key} label={m.title} position="bottom">
            <button
              type="button"
              // @ts-ignore
              className={`${styles.viewBtn} ${mode === m.key ? styles.viewBtnActive : ""}`}
              // @ts-ignore
              onClick={() => onChange(m.key)}
            >
              <Icon size={14} />
            </button>
          </TooltipComponent>
        );
      })}
    </div>
  );
}

export function FilterIconButtonGroupComponent({
  // @ts-ignore
  // @ts-ignore
  options: any,
  // @ts-ignore
  // @ts-ignore
  activeKeys: any,
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  isSingleSelect = false,
}) {
  return (
    <div className={styles.discreteGroup}>
      {/* @ts-ignore */}
      {options.map((opt: any) => {
        const Icon = opt.icon;
        const isActive = isSingleSelect
          // @ts-ignore
          ? activeKeys === opt.key
          // @ts-ignore
          : activeKeys?.has(opt.key);

        return (
          <TooltipComponent key={opt.key} label={opt.label} position="bottom">
            <button
              type="button"
              className={`${styles.discreteBtn} ${isActive ? styles.discreteBtnActive : ""}`}
              onClick={() => {
                if (isSingleSelect) {
                  // @ts-ignore
                  onChange(isActive ? null : opt.key);
                } else {
                  // @ts-ignore
                  const next = new Set(activeKeys);
                  next.has(opt.key) ? next.delete(opt.key) : next.add(opt.key);
                  // @ts-ignore
                  onChange(next);
                }
              }}
            >
              {opt.customRender ? (
                opt.customRender()
              ) : (
                <Icon
                  size={14}
                  style={opt.color ? { color: opt.color } : undefined}
                />
              )}
            </button>
          </TooltipComponent>
        );
      })}
    </div>
  );
}

export function FilterInputComponent({
  // @ts-ignore
  // @ts-ignore
  value: any,
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  // @ts-ignore
  // @ts-ignore
  placeholder: any,
  className = "",
}) {
  return (
    <input
      type="text"
      className={`${styles.filterInput} ${className}`}
      // @ts-ignore
      placeholder={placeholder}
      // @ts-ignore
      value={value}
      // @ts-ignore
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FilterSelectComponent({
  // @ts-ignore
  // @ts-ignore
  value: any,
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  // @ts-ignore
  // @ts-ignore
  options: any,
  className = "",
}) {
  return (
    <select
      className={`${styles.filterSelect} ${className}`}
      // @ts-ignore
      value={value}
      // @ts-ignore
      onChange={(e) => onChange(e.target.value)}
    >
      {/* @ts-ignore */}
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// @ts-ignore
export function FilterClearButton({ onClick: any, children = "Clear" }) {
  return (
    // @ts-ignore
    <button type="button" className={styles.clearBtn} onClick={onClick}>
      {children}
    </button>
  );
}
