"use client";

import SoundService from "@/services/SoundService";
import styles from "./ChartTabsComponent.module.css";

/**
 * ChartTabsComponent — reusable segmented tab control for chart headers.
 *
 * Props:
 *   tabs      — array of { key, label, color? }
 *   activeTab — current active tab key
 *   onChange  — (key) => void
 */
interface TabItem {
  key: string;
  label: string;
  color?: string;
  unit?: string;
}

interface ChartTabsProps {
  tabs?: TabItem[];
  activeTab: string;
  onChange: (key: string) => void;
}

export default function ChartTabsComponent({
  tabs = [],
  activeTab,
  onChange,
}: ChartTabsProps) {
  return (
    <div className={`chart-tabs-component ${styles['tabs']}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`${styles['tab']} ${activeTab === tab.key ? styles['tab-is-active-state'] : ""}`}
          {...SoundService.interactive(() => onChange(tab.key))}
          style={
            activeTab === tab.key && tab.color
              ? { color: tab.color, borderColor: tab.color }
              : undefined
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
