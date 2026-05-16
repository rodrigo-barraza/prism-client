"use client";

import styles from "./ToggleButtonComponent.module.css";

/**
 * ToggleButtonComponent — a small, toggleable pill button.
 *
 * When inactive, renders with a dashed border to clearly signal
 * it can be toggled on. When active, applies a rainbow hue-rotate
 * animation identical to the NavigationSidebar's active navLink.
 *
 * Props:
 *   icon     — React node (e.g. <Wrench size={10} />)
 *   label    — string label text
 *   active   — boolean — whether the toggle is on
 *   title    — string — tooltip text
 *   onClick  — callback
 */
export default function ToggleButtonComponent({
  // @ts-ignore
  // @ts-ignore
  icon: any,
  // @ts-ignore
  // @ts-ignore
  label: any,
  active = false,
  // @ts-ignore
  // @ts-ignore
  title: any,
  // @ts-ignore
  // @ts-ignore
  onClick: any,
}) {
  return (
    <button
      className={`${styles.toggle} ${active ? styles.active : ""}`}
      // @ts-ignore
      onClick={onClick}
      // @ts-ignore
      title={title}
    >
      {/* @ts-ignore */}
      {icon}
      {/* @ts-ignore */}
      <span>{label}</span>
    </button>
  );
}
