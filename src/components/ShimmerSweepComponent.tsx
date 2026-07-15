"use client";

import styles from "./ShimmerSweepComponent.module.css";

/**
 * Soft light band that sweeps across its parent while `active`.
 * Purely decorative overlay — absolutely positioned, pointer-transparent,
 * screen-blended so it glints over whatever sits beneath it.
 */
interface ShimmerSweepComponentProps {
  active?: boolean;
  className?: string;
}

export default function ShimmerSweepComponent({
  active = false,
  className,
}: ShimmerSweepComponentProps) {
  return (
    <div
      className={`shimmer-sweep-component ${styles["shimmer-sweep"]} ${active ? styles["is-active-state"] : ""} ${className || ""}`}
      aria-hidden="true"
    >
      <span className={styles["shimmer-band"]} />
    </div>
  );
}
