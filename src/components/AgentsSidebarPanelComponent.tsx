"use client";

import React from "react";
import { Plus, Wrench } from "lucide-react";
import type { AgentPersona } from "../types/types";
import BadgeComponent from "./BadgeComponent";
import styles from "./AgentsPageComponent.module.css";

interface EditableAgentSummary {
  _id?: unknown;
  agentId?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  enabledTools?: string[];
}

interface AgentsSidebarPanelComponentProps {
  builtInAgents: AgentPersona[];
  customAgents: EditableAgentSummary[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string, isCustom: boolean) => void;
  onCreateNewAgent: () => void;
}

export default function AgentsSidebarPanelComponent({
  builtInAgents,
  customAgents,
  selectedAgentId,
  onSelectAgent,
  onCreateNewAgent,
}: AgentsSidebarPanelComponentProps) {
  return (
    <>
      <div className={styles["sidebar-header-section"]}>
        <span className={styles["sidebar-title-text"]}>All Personas</span>
        <button
          id="button-create-new-agent"
          className={styles["create-button-element"]}
          onClick={onCreateNewAgent}
          title="Create Custom Agent"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className={styles["sidebar-scroll-container"]}>
        {/* Built-In section */}
        <div>
          <div className={styles["agent-group-header"]}>Built-In Agents</div>
          {builtInAgents.map((agent) => {
            const isSelected = selectedAgentId === agent.id;
            return (
              <button
                key={agent.id}
                className={`${styles["agent-card-item"]} ${isSelected ? styles["is-selected-state"] : ""}`}
                onClick={() => onSelectAgent(agent.id, false)}
                data-panel-close-trigger
              >
                <BadgeComponent
                  type="agent"
                  agent={{
                    id: agent.id,
                    icon: agent.icon,
                    color: agent.color,
                  }}
                  size={28}
                />
                <div className={styles["agent-info-container"]}>
                  <span className={styles["agent-name-text"]}>{agent.name}</span>
                  <span className={styles["agent-description-text"]}>{agent.description}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Personas section */}
        <div>
          <div className={styles["agent-group-header"]}>Custom Personas</div>
          {customAgents.length === 0 ? (
            <div className={styles["empty-state-view"]} style={{ paddingBlock: 12 }}>
              <span className={styles["agent-description-text"]}>No custom agents created.</span>
            </div>
          ) : (
            customAgents.map((agent) => {
              const isSelected = selectedAgentId === String(agent._id);
              return (
                <button
                  key={String(agent._id)}
                  className={`${styles["agent-card-item"]} ${isSelected ? styles["is-selected-state"] : ""}`}
                  onClick={() => onSelectAgent(String(agent._id), true)}
                  data-panel-close-trigger
                >
                  <BadgeComponent
                    type="agent"
                    agent={{
                      id: agent.agentId,
                      icon: agent.icon,
                      color: agent.color,
                    }}
                    size={28}
                  />
                  <div className={styles["agent-info-container"]}>
                    <span className={styles["agent-name-text"]}>{agent.name}</span>
                    <span className={styles["agent-description-text"]}>{agent.description}</span>
                    <span className={styles["agent-badge-tag"]}>
                      <Wrench size={8} style={{ marginRight: 2 }} />
                      {agent.enabledTools?.length || 0} tools
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
