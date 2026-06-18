import { Layers, Bot, Users } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./StatsTabBarComponent.module.css";

/**
 * StatsTabBarComponent — segmented control for switching between
 * "All", "Orchestrator" and "Sub-Agents" stats views.
 *
 * Only rendered when the active agent can spawn sub-agents;
 * the parent is responsible for gating visibility via the `visible` prop
 * (or simply not rendering the component).
 */

const TABS = [
  { key: "all", label: "All", icon: <Layers size={10} /> },
  { key: "orchestrator", label: "Orchestrator", icon: <Bot size={10} /> },
  { key: "subAgents", label: "Sub-Agents", icon: <Users size={10} /> },
];

export interface StatsTabBarProps {
  activeTab: string;
  onChange: (tab: string) => void;
}

export default function StatsTabBarComponent({
  activeTab,
  onChange,
}: StatsTabBarProps) {
  return (
    <div className={`stats-tab-bar-component ${styles['stats-tab-bar']}`}>
      {TABS.map((tab) => (
        <TooltipComponent
          key={tab.key}
          label={tab.label}
          position="bottom"
          delay={200}
        >
          <button
            className={`${styles['stats-tab-button']}${activeTab === tab.key ? ` ${styles['stats-tab-button-element-is-active-state']}` : ""}`}
            onClick={() => onChange(tab.key)}
          >
            {tab.icon}
          </button>
        </TooltipComponent>
      ))}
    </div>
  );
}
