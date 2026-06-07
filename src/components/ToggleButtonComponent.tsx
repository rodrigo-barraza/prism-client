"use client";

import styles from "./ToggleButtonComponent.module.css";

/**
 * ToggleButtonComponent — a small, toggleable pill button.
 *
 * When inactive, renders with a dashed border to clearly signal
 * it can be toggled on. When active, applies a rainbow hue-rotate
 * animation identical to the NavigationSidebar's active navigationLink.
 *
 * Props:
 *   icon     — React node (e.g. <Wrench size={10} />)
 *   label    — string label text
 *   active   — boolean — whether the toggle is on
 *   title    — string — tooltip text
 *   onClick  — callback
 */
export default function ToggleButtonComponent({
  icon,
  label,
  active = false,
  title,
  onClick,
}: {
  icon?: React.ReactNode;
  label?: string;
  active?: boolean;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className={`toggle-button-component ${styles['toggle']} ${active ? styles['is-active-state'] : ""}`}
      onClick={onClick}
      title={title}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
