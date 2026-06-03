"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Plus, Wrench } from "lucide-react";
import type { AgentPersona } from "../types/types";
import BadgeComponent from "./BadgeComponent";
import { SearchInputComponent, ButtonComponent } from "@rodrigo-barraza/components-library";
import styles from "./AgentsPageComponent.module.css";

type AgentSidebarTab = "custom" | "built-in";

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
  const [activeTab, setActiveTab] = useState<AgentSidebarTab>("custom");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCustomAgents = useMemo(() => {
    if (!searchQuery.trim()) return customAgents;
    const normalizedQuery = searchQuery.toLowerCase().trim();
    return customAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(normalizedQuery) ||
        (agent.description && agent.description.toLowerCase().includes(normalizedQuery)),
    );
  }, [customAgents, searchQuery]);

  const filteredBuiltInAgents = useMemo(() => {
    if (!searchQuery.trim()) return builtInAgents;
    const normalizedQuery = searchQuery.toLowerCase().trim();
    return builtInAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(normalizedQuery) ||
        agent.description.toLowerCase().includes(normalizedQuery),
    );
  }, [builtInAgents, searchQuery]);

  return (
    <>
      {/* Tab Navigation */}
      <div className={styles["sidebar-tab-navigation"]}>
        <button
          className={`${styles["sidebar-tab-button"]} ${activeTab === "custom" ? styles["is-active-tab"] : ""}`}
          onClick={() => setActiveTab("custom")}
          type="button"
        >
          Custom
          {customAgents.length > 0 && (
            <span className={styles["tab-count-badge"]}>{customAgents.length}</span>
          )}
        </button>
        <button
          className={`${styles["sidebar-tab-button"]} ${activeTab === "built-in" ? styles["is-active-tab"] : ""}`}
          onClick={() => setActiveTab("built-in")}
          type="button"
        >
          Built-in
          <span className={styles["tab-count-badge"]}>{builtInAgents.length}</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className={styles["sidebar-search-wrapper"]}>
        <SearchInputComponent
          id="input-agents-sidebar-search"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={`Search ${activeTab === "custom" ? "custom" : "built-in"} agents...`}
          compact
        />
      </div>

      {/* Agent List */}
      <div className={styles["sidebar-scroll-container"]}>
        {activeTab === "custom" && (
          <div>
            {/* Create button inline in the custom tab */}
            <div className={styles["create-agent-button-wrapper"]}>
              <ButtonComponent
                id="button-create-new-agent-inline"
                variant="outlined"
                icon={Plus}
                onClick={onCreateNewAgent}
                fullWidth
              >
                Create New Agent
              </ButtonComponent>
            </div>

            {filteredCustomAgents.length === 0 ? (
              <div className={styles["empty-state-view"]} style={{ paddingBlock: 24 }}>
                <span className={styles["agent-description-text"]}>
                  {searchQuery
                    ? "No custom agents match your search."
                    : "No custom agents created yet."}
                </span>
              </div>
            ) : (
              filteredCustomAgents.map((agent) => {
                const isSelected = selectedAgentId === String(agent._id);
                return (
                  <button
                    key={String(agent._id)}
                    className={`${styles["agent-card-item"]} ${isSelected ? styles["is-selected-state"] : ""}`}
                    onClick={() => onSelectAgent(String(agent._id), true)}
                    data-panel-close-trigger
                    type="button"
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
        )}

        {activeTab === "built-in" && (
          <div>
            {filteredBuiltInAgents.length === 0 ? (
              <div className={styles["empty-state-view"]} style={{ paddingBlock: 24 }}>
                <span className={styles["agent-description-text"]}>
                  No built-in agents match your search.
                </span>
              </div>
            ) : (
              filteredBuiltInAgents.map((agent) => {
                const isSelected = selectedAgentId === agent.id;
                return (
                  <button
                    key={agent.id}
                    className={`${styles["agent-card-item"]} ${isSelected ? styles["is-selected-state"] : ""}`}
                    onClick={() => onSelectAgent(agent.id, false)}
                    data-panel-close-trigger
                    type="button"
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
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}
