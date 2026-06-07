"use client";

import styles from "./ProportionBarComponent.module.css";

/**
 * ProportionBarComponent — a proportional bar with percentage label.
 * Used for usage share, cost share, or any value-vs-total visualization.
 *
 * Props:
 *   value    — the item's count/value
 *   total    — the total to compute percentage against
 *   color    — fill color (defaults to accent)
 */
interface ProportionBarProps {
  value?: number;
  total?: number;
  color?: string;
  mini?: boolean;
}

export default function ProportionBarComponent({
  value = 0,
  total = 1,
  color,
  mini = false,
}: ProportionBarProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className={`proportion-bar-component ${styles['container']} ${mini ? styles['mini'] : ""}`}>
      <div className={styles['track']}>
        <div
          className={styles['fill']}
          style={{
            width: `${percentage}%`,
            ...(color ? { background: color } : {}),
          }}
        />
      </div>
      <span className={styles['label']}>{percentage.toFixed(1)}%</span>
    </div>
  );
}
