"use client";

import { Search } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./FilterBarComponent.module.css";

export interface FilterBarProps {
  children?: React.ReactNode;
  className?: string;
}

export function FilterBarComponent({ children, className = "" }: FilterBarProps) {
  return <div className={`${styles.filterBar} ${className}`}>{children}</div>;
}

export interface FilterGroupProps {
  label?: string;
  children?: React.ReactNode;
}

export function FilterGroupComponent({ label, children }: FilterGroupProps) {
  return (
    <div className={styles.filterGroup}>
      {label && <span className={styles.filterLabel}>{label}</span>}
      {children}
    </div>
  );
}

export interface PillOption {
  key: string;
  label: string;
  icon?: any;
  color?: string;
}

export interface FilterPillsProps {
  options: PillOption[];
  value: string;
  onChange: (key: string) => void;
}

export function FilterPillsComponent({ options, value, onChange }: FilterPillsProps) {
  return (
    <div className={styles.pills}>
      {options.map((f) => {
        const Icon = f.icon;
        return (
          <button
            key={f.key}
            type="button"
            className={`${styles.pill} ${value === f.key ? styles.pillActive : ""}`}
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

export interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  placeholder?: string;
}

export function SearchInputComponent({
  value,
  onChange,
  onSubmit,
  placeholder = "Search...",
}: SearchInputProps) {
  return (
    <form className={styles.searchBox} onSubmit={onSubmit}>
      <Search size={14} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value)}
        className={styles.searchInput}
      />
    </form>
  );
}

export interface ViewModeOption {
  key: string;
  title: string;
  icon: any;
}

export interface ViewModeToggleProps {
  mode: string;
  onChange: (mode: string) => void;
  modes: ViewModeOption[];
}

export function ViewModeToggleComponent({ mode, onChange, modes }: ViewModeToggleProps) {
  return (
    <div className={styles.viewToggle}>
      {modes.map((m) => {
        const Icon = m.icon;
        return (
          <TooltipComponent key={m.key} label={m.title} position="bottom">
            <button
              type="button"
              className={`${styles.viewBtn} ${mode === m.key ? styles.viewBtnActive : ""}`}
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

export interface FilterIconButtonOption {
  key: string;
  label: string;
  icon?: any;
  color?: string;
  customRender?: () => React.ReactNode;
}

export interface FilterIconButtonGroupProps {
  options: FilterIconButtonOption[];
  activeKeys: any;
  onChange: (keys: any) => void;
  isSingleSelect?: boolean;
}

export function FilterIconButtonGroupComponent({
  options,
  activeKeys,
  onChange,
  isSingleSelect = false,
}: FilterIconButtonGroupProps) {
  return (
    <div className={styles.discreteGroup}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = isSingleSelect
          ? activeKeys === opt.key
          : activeKeys?.has?.(opt.key);

        return (
          <TooltipComponent key={opt.key} label={opt.label} position="bottom">
            <button
              type="button"
              className={`${styles.discreteBtn} ${isActive ? styles.discreteBtnActive : ""}`}
              onClick={() => {
                if (isSingleSelect) {
                  onChange(isActive ? null : opt.key);
                } else {
                  const next = new Set(activeKeys);
                  next.has(opt.key) ? next.delete(opt.key) : next.add(opt.key);
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

export interface FilterInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export function FilterInputComponent({
  value,
  onChange,
  placeholder,
  className = "",
}: FilterInputProps) {
  return (
    <input
      type="text"
      className={`${styles.filterInput} ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value)}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  className?: string;
}

export function FilterSelectComponent({
  value,
  onChange,
  options,
  className = "",
}: FilterSelectProps) {
  return (
    <select
      className={`${styles.filterSelect} ${className}`}
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export interface FilterClearButtonProps {
  onClick: () => void;
  children?: React.ReactNode;
}

export function FilterClearButton({ onClick, children = "Clear" }: FilterClearButtonProps) {
  return (
    <button type="button" className={styles.clearBtn} onClick={onClick}>
      {children}
    </button>
  );
}
