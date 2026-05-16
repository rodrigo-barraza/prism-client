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
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function ChartTabsComponent({ tabs = [], activeTab: any, onChange: any }) {
  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => (
        <button
          // @ts-ignore
          key={tab.key}
          type="button"
          // @ts-ignore
          // @ts-ignore
          className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
          // @ts-ignore
          // @ts-ignore
          // @ts-ignore
          {...SoundService.interactive(() => onChange(tab.key))}
          style={
            // @ts-ignore
            // @ts-ignore
            // @ts-ignore
            activeTab === tab.key && tab.color
              // @ts-ignore
              // @ts-ignore
              ? { color: tab.color, borderColor: tab.color }
              : undefined
          }
        >
          {/* @ts-ignore */}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
