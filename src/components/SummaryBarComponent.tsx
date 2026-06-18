"use client";

import type { ReactNode } from "react";
import styles from "./SummaryBarComponent.module.css";
import costBadgeStyles from "./CostBadgeComponent.module.css";
import BenchmarkBarComponent from "./BenchmarkBarComponent";

interface SummaryBarItem {
  value?: ReactNode;
  label?: string;
  color?: string;
  icon?: ReactNode;
  bar?: number;
  barPassed?: number;
  barTotal?: number;
}

interface SummaryBarProps {
  items?: SummaryBarItem[];
  live?: boolean;
  className?: string;
}

export default function SummaryBarComponent({
  items,
  live = false,
  className,
}: SummaryBarProps) {
  if (!items || items.length === 0) return null;

  const wrapperClass = ["summary-bar-component", styles['bar'], live ? styles['live'] : "", className || ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClass}>
      {items.map((item: SummaryBarItem, index: number) => (
        <div key={index} className={styles['entry']}>
          {index > 0 && <div className={styles['divider']} />}
          <div className={styles['item']}>
            {item.bar != null ? (
              <>
                <BenchmarkBarComponent
                  passed={
                    item.barPassed ??
                    Math.round((Math.min(item.bar, 100) / 100) * 100)
                  }
                  total={item.barTotal ?? 100}
                />
                {item.label && (
                  <span className={styles['label']}>{item.label}</span>
                )}
              </>
            ) : (
              <>
                <div className={`${costBadgeStyles['badge']} ${styles['value-layout-row']}`}>
                  {item.icon && (
                    <span className={styles['icon']}>{item.icon}</span>
                  )}
                  <span
                    className={styles['value']}
                    style={item.color ? { color: item.color } : undefined}
                  >
                    {item.value}
                  </span>
                </div>
                {item.label && (
                  <span className={styles['label']}>{item.label}</span>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
