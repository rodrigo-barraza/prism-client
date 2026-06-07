"use client";

import styles from "./NavigationIndicatorComponent.module.css";

export type NavigationIndicatorVariant =
  | "error"
  | "warning"
  | "notification"
  | "live"
  | "default";

interface NavigationIndicatorProps {
  count: number;
  variant?: NavigationIndicatorVariant;
  title?: string;
  className?: string;
}

export default function NavigationIndicatorComponent({
  count,
  variant = "default",
  title,
  className = "",
}: NavigationIndicatorProps) {
  if (count <= 0) return null;

  const classNames = [
    "navigation-indicator-component",
    styles['indicator'],
    styles[`variant-${variant}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classNames} title={title}>
      {count}
    </span>
  );
}
