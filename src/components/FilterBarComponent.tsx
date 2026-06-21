"use client";

import type { ComponentType } from "react";
import { Search } from "lucide-react";
import {
  InputComponent,
  SelectComponent as LibSelectComponent,
  TooltipComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./FilterBarComponent.module.css";

export interface FilterBarProps {
  children?: React.ReactNode;
  className?: string;
}

export function FilterBarComponent({
  children,
  className = "",
}: FilterBarProps) {
  return <div className={`${styles['filter-bar']} ${className}`}>{children}</div>;
}

export interface FilterGroupProps {
  label?: string;
  children?: React.ReactNode;
}

export function FilterGroupComponent({ label, children }: FilterGroupProps) {
  return (
    <div className={styles['filter-group']}>
      {label && <span className={styles['filter-label']}>{label}</span>}
      {children}
    </div>
  );
}

export interface PillOption {
  key: string;
  label: string;
  icon?: ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color?: string;
}

export interface FilterPillsProps {
  options: PillOption[];
  value: string;
  onChange: (key: string) => void;
}

export function FilterPillsComponent({
  options,
  value,
  onChange,
}: FilterPillsProps) {
  return (
    <div className={styles['pills']}>
      {options.map((filter) => {
        const Icon = filter.icon;
        return (
          <button
            key={filter.key}
            type="button"
            className={`${styles['pill']} ${value === filter.key ? styles['pill-is-active-state'] : ""}`}
            onClick={() => onChange(filter.key)}
          >
            {Icon && (
              <Icon
                size={12}
                style={filter.color ? { color: filter.color } : undefined}
              />
            )}
            {filter.label}
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
    <form className={styles['search-box']} onSubmit={onSubmit}>
      <Search size={14} />
      <InputComponent
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(
          e: React.ChangeEvent<HTMLInputElement>,
        ) => onChange(e.target.value)}
        className={styles['search-input']}
      />
    </form>
  );
}

export interface ViewModeOption {
  key: string;
  title: string;
  icon: ComponentType<{ size?: number }>;
}

export interface ViewModeToggleProps {
  mode: string;
  onChange: (mode: string) => void;
  modes: ViewModeOption[];
}

export function ViewModeToggleComponent({
  mode,
  onChange,
  modes,
}: ViewModeToggleProps) {
  return (
    <div className={styles['view-toggle']}>
      {modes.map((model) => {
        const Icon = model.icon;
        return (
          <TooltipComponent key={model.key} label={model.title} position="bottom">
            <button
              type="button"
              className={`${styles['view-button']} ${mode === model.key ? styles['view-button-element-is-active-state'] : ""}`}
              onClick={() => onChange(model.key)}
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
  icon?: ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color?: string;
  customRender?: () => React.ReactNode;
}

export interface FilterIconButtonGroupProps {
  options: FilterIconButtonOption[];
  activeKeys: Set<string> | string | null;
  onChange: (keys: Set<string> | string | null) => void;
  isSingleSelect?: boolean;
}

export function FilterIconButtonGroupComponent({
  options,
  activeKeys,
  onChange,
  isSingleSelect = false,
}: FilterIconButtonGroupProps) {
  return (
    <div className={styles['discrete-group']}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = isSingleSelect
          ? activeKeys === opt.key
          : activeKeys instanceof Set && activeKeys.has(opt.key);

        return (
          <TooltipComponent key={opt.key} label={opt.label} position="bottom">
            <button
              type="button"
              className={`${styles['discrete-button']} ${isActive ? styles['discrete-button-element-is-active-state'] : ""}`}
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
              ) : Icon ? (
                <Icon
                  size={14}
                  style={opt.color ? { color: opt.color } : undefined}
                />
              ) : null}
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
    <InputComponent
      type="text"
      className={`${styles['filter-input']} ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={(
        e: React.ChangeEvent<HTMLInputElement>,
      ) => onChange(e.target.value)}
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
    <LibSelectComponent
      value={value}
      options={options}
      onChange={(val: string) => onChange(val)}
    />
  );
}

export interface FilterClearButtonProps {
  onClick: () => void;
  children?: React.ReactNode;
}

export function FilterClearButton({
  onClick,
  children = "Clear",
}: FilterClearButtonProps) {
  return (
    <button type="button" className={`filter-bar-component ${styles['clear-button']}`} onClick={onClick}>
      {children}
    </button>
  );
}
