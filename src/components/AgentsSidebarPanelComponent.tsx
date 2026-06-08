"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Plus, Wrench } from "lucide-react";
import type { AgentPersona, ToolSchema } from "../types/types";
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
  avatar?: string;
  color?: string;
  enabledTools?: string[];
}

interface AgentsSidebarPanelComponentProps {
  builtInAgents: AgentPersona[];
  customAgents: EditableAgentSummary[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string, isCustom: boolean) => void;
  onCreateNewAgent: () => void;
  availableTools?: ToolSchema[];
}

export default function AgentsSidebarPanelComponent({
  builtInAgents,
  customAgents,
  selectedAgentId,
  onSelectAgent,
  onCreateNewAgent,
  availableTools = [],
}: AgentsSidebarPanelComponentProps) {
  const [activeTab, setActiveTab] = useState<AgentSidebarTab>("custom");
  const [searchQuery, setSearchQuery] = useState("");

  const builtInOnlyAgents = useMemo(() => {
    return builtInAgents.filter((agent) => !agent.custom);
  }, [builtInAgents]);

  const getToolsCount = useCallback(
    (agentSummary: EditableAgentSummary | AgentPersona) => {
      const agentId = (agentSummary as EditableAgentSummary).agentId || (agentSummary as AgentPersona).id;
      const matchingPersona = builtInAgents.find((persona) => persona.id === agentId);
      if (matchingPersona) {
        if (matchingPersona.toolCount === -1) {
          return availableTools.length;
        }
        return matchingPersona.toolCount;
      }

      const enabledToolsList = (agentSummary as EditableAgentSummary).enabledTools || (agentSummary as AgentPersona).enabledToolNames || [];
      if (enabledToolsList.includes("*")) {
        return availableTools.length;
      }
      const coreToolsCount = availableTools.filter((tool) => tool.system).length;

      const resolvedToolsSet = new Set<string>();
      for (const entry of enabledToolsList) {
        if (entry.startsWith("domain:")) {
          const domainName = entry.slice(7);
          for (const tool of availableTools) {
            if (tool.domain === domainName) {
              resolvedToolsSet.add(tool.name);
            }
          }
        } else if (entry.startsWith("tier:")) {
          const tierName = entry.slice(5);
          for (const tool of availableTools) {
            if (tool.intelligenceTier === tierName) {
              resolvedToolsSet.add(tool.name);
            }
          }
        } else {
          resolvedToolsSet.add(entry);
        }
      }
      return resolvedToolsSet.size + coreToolsCount;
    },
    [builtInAgents, availableTools],
  );

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
    if (!searchQuery.trim()) return builtInOnlyAgents;
    const normalizedQuery = searchQuery.toLowerCase().trim();
    return builtInOnlyAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(normalizedQuery) ||
        agent.description.toLowerCase().includes(normalizedQuery),
    );
  }, [builtInOnlyAgents, searchQuery]);

  return (
    <>
      {/* Tab Navigation */}
      <div className={`agents-sidebar-panel-component ${styles["sidebar-tab-navigation"]}`}>
        <button
          className={`${styles["sidebar-tab-button"]} ${activeTab === "custom" ? styles["is-active-tab-state"] : ""}`}
          onClick={() => setActiveTab("custom")}
          type="button"
        >
          Custom
          {customAgents.length > 0 && (
            <span className={styles["tab-count-badge"]}>{customAgents.length}</span>
          )}
        </button>
        <button
          className={`${styles["sidebar-tab-button"]} ${activeTab === "built-in" ? styles["is-active-tab-state"] : ""}`}
          onClick={() => setActiveTab("built-in")}
          type="button"
        >
          Built-in
          <span className={styles["tab-count-badge"]}>{builtInOnlyAgents.length}</span>
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
                        avatar: agent.avatar,
                        color: agent.color,
                      }}
                      size={28}
                    />
                    <div className={styles["agent-info-container"]}>
                      <span className={styles["agent-name-text"]}>{agent.name}</span>
                      <span className={styles["agent-description-text"]}>{agent.description}</span>
                      <span className={styles["agent-badge-tag"]}>
                        <Wrench size={8} style={{ marginInlineEnd: 2 }} />
                        {getToolsCount(agent)} tools
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
                        avatar: agent.avatar,
                        color: agent.color,
                      }}
                      size={28}
                    />
                    <div className={styles["agent-info-container"]}>
                      <span className={styles["agent-name-text"]}>{agent.name}</span>
                      <span className={styles["agent-description-text"]}>{agent.description}</span>
                      <span className={styles["agent-badge-tag"]}>
                        <Wrench size={8} style={{ marginInlineEnd: 2 }} />
                        {getToolsCount(agent)} tools
                      </span>
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
