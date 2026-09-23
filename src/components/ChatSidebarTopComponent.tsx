"use client";

/**
 * The chat's upper side-panel group: Settings (model, strategy toggles and
 * the conversation's stats), Parameters, Workspace, model Info, Sub-Agents,
 * Requests and Nodes.
 */

import { useState, type ReactNode } from "react";
import { ClipboardList, GitBranch, Network, Repeat } from "lucide-react";
import { TabBarComponent, tabBarStyles } from "@rodrigo-barraza/components-library";
import SettingsPanel, { type ConversationStats as DisplayConversationStats } from "./SettingsPanelComponent";
import ParametersPanelComponent from "./ParametersPanelComponent";
import WorkspaceTreePanelComponent from "./WorkspaceTreePanelComponent";
import WorkspaceSwitcherButtonComponent from "./WorkspaceSwitcherButtonComponent";
import ModelInfoPanel from "./ModelInfoPanelComponent";
import SubAgentsPanel from "./SubAgentsPanelComponent";
import RequestsTableComponent from "./RequestsTableComponent";
import ChatConversationGraphComponent from "./ChatConversationGraphComponent";
import SidebarTabHeaderComponent from "./SidebarTabHeaderComponent";
import requestsTableStyles from "./RequestsTableComponent.module.css";
import type { ConversationGraphDataState } from "../hooks/useConversationGraphData";
import type { ChatSidebar } from "../hooks/useChatSidebar";
import type { ChatModelSettings } from "../hooks/useChatModelSettings";
import type { ChatAgentControls } from "../hooks/useChatAgentControls";
import type { PrismSettings, ToolCallEvent } from "../types/types";
import type { SubAgentActivityEntry } from "../utils/agentConversationReducer";

// Tools that are always on and non-toggleable in the agent view
const AGENT_LOCKED_TOOLS = new Set(["Tool Calling"]);
const NO_LOCKED_TOOLS = new Set<string>();

/** Who the conversation on screen belongs to, for the Settings panel. */
export interface ConversationMetadata {
  project: string | null;
  username: string | null;
  agentName: string | null;
}

interface ChatSidebarTopComponentProps {
  sidebar: ChatSidebar;
  isAdmin: boolean;
  isNoAgent: boolean;
  canSpawnSubAgents: boolean;
  model: ChatModelSettings;
  controls: ChatAgentControls;
  isWorkspaceTabVisible: boolean;
  hasOrchestratorTools: boolean;
  workspaceCount: number;
  currentWorkspacePath: string | undefined;
  unavailableWorkspace: string | null;
  hasMessages: boolean;
  conversationStats: DisplayConversationStats | null;
  conversationMetadata: ConversationMetadata;
  requestCount: number;
  conversationId: string;
  requestsRefreshKey: number;
  activeId: string | null;
  toolActivity: ToolCallEvent[];
  isGenerating: boolean;
  conversationGraphState: ConversationGraphDataState;
  subAgentToolActivity: Record<string, SubAgentActivityEntry>;
  /** A file picked in the workspace tree goes into the composer as an @mention. */
  onMentionFile: (_filePath: string) => void;
  onOpenFile: (_absolutePath: string) => void;
}

function tabIcon(emoji: string) {
  return <span className={tabBarStyles['tab-emoji-icon']}>{emoji}</span>;
}

export default function ChatSidebarTopComponent({
  sidebar,
  isAdmin,
  isNoAgent,
  canSpawnSubAgents,
  model,
  controls,
  isWorkspaceTabVisible,
  hasOrchestratorTools,
  workspaceCount,
  currentWorkspacePath,
  unavailableWorkspace,
  hasMessages,
  conversationStats,
  conversationMetadata,
  requestCount,
  conversationId,
  requestsRefreshKey,
  activeId,
  toolActivity,
  isGenerating,
  conversationGraphState,
  subAgentToolActivity,
  onMentionFile,
  onOpenFile,
}: ChatSidebarTopComponentProps) {
  const { leftTab, selectTopTab, badgeProps } = sidebar;
  const { filteredConfig, settings, setSettings, llamaCppServerProps } = model;
  const [subAgentsHeaderActions, setSubAgentsHeaderActions] = useState<ReactNode>(null);
  const isSubAgentWorking = Object.values(subAgentToolActivity).some(
    (subAgent) => subAgent.currentTool || subAgent.phase === "generating" || subAgent.phase === "thinking",
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
        overflow: "hidden",
      }}
    >
      <TabBarComponent
        tabs={[
          { key: "settings", icon: tabIcon("🛠︎"), tooltip: "Settings" },
          { key: "parameters", icon: tabIcon("🎚︎"), tooltip: "Parameters" },
          ...(isWorkspaceTabVisible
            ? [
                {
                  key: "workspace",
                  icon: tabIcon("📂"),
                  tooltip: "Workspace",
                  badge: workspaceCount,
                  badgeDisabled: workspaceCount === 0,
                },
              ]
            : []),
          { key: "info", icon: tabIcon("📄"), tooltip: "Info" },
          ...(hasOrchestratorTools
            ? [
                {
                  key: "subAgents",
                  icon: tabIcon("🤖"),
                  ...badgeProps(sidebar.subAgentsCount, "subAgents"),
                  badgeRainbow: isSubAgentWorking,
                  tooltip: "Sub-Agents",
                },
              ]
            : []),
          {
            key: "requests",
            icon: tabIcon("📊"),
            ...badgeProps(requestCount, "requests"),
            tooltip: "Requests",
          },
          { key: "nodes", icon: <Network size={13} />, tooltip: "Nodes" },
        ]}
        activeTab={leftTab}
        onChange={selectTopTab}
      />

      {leftTab === "settings" && (
        <>
          <SidebarTabHeaderComponent icon="🛠︎" title="Settings" />
          <SettingsPanel
            readOnly={isAdmin}
            config={filteredConfig}
            settings={settings}
            onChange={
              isNoAgent
                ? (updates: Partial<PrismSettings>) =>
                    setSettings((state) => ({ ...state, ...updates }))
                : (updates: Partial<PrismSettings>) =>
                    setSettings((state) => ({
                      ...state,
                      ...updates,
                      functionCallingEnabled: true,
                    }))
            }
            _hasAssistantImages={false}
            lockedTools={isNoAgent ? NO_LOCKED_TOOLS : AGENT_LOCKED_TOOLS}
            hideSystemPrompt={!isNoAgent}
            conversationType={isNoAgent ? "chat" : "agent"}
            canSpawnSubAgents={!isNoAgent && canSpawnSubAgents}
            agentToggles={
              isNoAgent
                ? []
                : [
                    {
                      key: "plan",
                      icon: <ClipboardList size={12} />,
                      label: "Plan Mode",
                      checked: controls.planFirst,
                      onChange: controls.togglePlanFirst,
                    },
                    {
                      key: "iterations",
                      type: "cycle",
                      icon: <Repeat size={12} />,
                      label: "Max Tool Iterations",
                      value: controls.maxIterations,
                      isActive: true,
                      title: "Click to cycle: 10 → 25 → 50 → 100 → ∞",
                      onChange: controls.cycleMaxIterations,
                    },
                    {
                      key: "subAgentIterations",
                      type: "cycle",
                      icon: <Repeat size={12} />,
                      label: "Max Sub-Agent Tool Iterations",
                      value: controls.maxSubAgentIterations,
                      isActive: true,
                      title: "Click to cycle: 10 → 25 → 50 → 100 → ∞",
                      onChange: controls.cycleMaxSubAgentIterations,
                    },
                    {
                      key: "recursionDepth",
                      type: "cycle",
                      icon: <GitBranch size={12} />,
                      label: "Sub-Agent Recursion Depth",
                      value: controls.maxRecursionDepth,
                      isActive: controls.maxRecursionDepth > 0,
                      title: "Click to cycle: Off → 1 (Workers) → 2 → 3 → 5 → 10",
                      onChange: controls.cycleMaxRecursionDepth,
                    },
                  ]
            }
            conversationStats={conversationStats}
            conversationProject={conversationMetadata.project}
            conversationUsername={conversationMetadata.username}
            conversationAgent={conversationMetadata.agentName}
          />
        </>
      )}

      {leftTab === "parameters" && (
        <>
          <SidebarTabHeaderComponent icon="🎚︎" title="Parameters" />
          <ParametersPanelComponent
            readOnly={isAdmin}
            settings={settings}
            onChange={(updates: Partial<PrismSettings>) =>
              setSettings((state) => ({ ...state, ...updates }))
            }
            config={filteredConfig}
            isAgentMode={!isNoAgent}
          />
        </>
      )}

      {leftTab === "workspace" && (
        <>
          <SidebarTabHeaderComponent
            icon="📂"
            title="Workspace"
            count={sidebar.workspaceTreeStats?.totalEntries}
            countSuffix={sidebar.workspaceTreeStats?.truncated ? "+" : ""}
            actions={<WorkspaceSwitcherButtonComponent />}
          />
          <WorkspaceTreePanelComponent
            workspaceTreeRefreshKey={sidebar.workspaceTreeRefreshKey}
            onMentionFile={onMentionFile}
            locked={hasMessages}
            unavailableWorkspace={unavailableWorkspace}
            hideHeader
            onTreeStats={sidebar.setWorkspaceTreeStats}
            onOpenFile={(relativePath: string) => {
              // Build absolute path from workspace root + relative path
              const absPath = currentWorkspacePath
                ? `${currentWorkspacePath.replace(/\/$/, "")}/${relativePath}`
                : relativePath;
              onOpenFile(absPath);
            }}
          />
        </>
      )}

      {leftTab === "info" && (
        <>
          <SidebarTabHeaderComponent icon="📄" title="Model Info" />
          <ModelInfoPanel config={filteredConfig} settings={settings} llamaCppServerProps={llamaCppServerProps} />
        </>
      )}

      {leftTab === "subAgents" && (
        <>
          <SidebarTabHeaderComponent icon="🤖" title="Sub-Agents" count={sidebar.subAgentsCount} actions={subAgentsHeaderActions} />
          <SubAgentsPanel
            conversationId={conversationId}
            refreshKey={sidebar.tasksRefreshKey}
            onCountChange={sidebar.setSubAgentsCount}
            onMaxDepthChange={sidebar.setMaxSubAgentDepth}
            onActionsChange={setSubAgentsHeaderActions}
            subAgentToolActivity={subAgentToolActivity}
          />
        </>
      )}

      {leftTab === "requests" && (
        <>
          <SidebarTabHeaderComponent icon="📊" title="Requests" count={requestCount} />
          <div className={requestsTableStyles['sidebar-scroll-fill']}>
            <RequestsTableComponent
              conversationId={conversationId}
              refreshKey={requestsRefreshKey}
              compact
              mini
              maxHeight={null}
              storageKey="conversation-requests"
            />
          </div>
        </>
      )}

      {leftTab === "nodes" && (
        <>
          <SidebarTabHeaderComponent icon={<Network size={11} />} title="Nodes" />
          <ChatConversationGraphComponent
            conversationId={activeId}
            toolActivity={toolActivity}
            isGenerating={isGenerating}
            graphState={conversationGraphState}
            compact
          />
        </>
      )}
    </div>
  );
}
