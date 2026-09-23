"use client";

/**
 * The chat's lower side-panel group: the tools a turn may use, and the
 * agent's skills, rules, project instructions, hooks, memories, workflows,
 * tasks and datastore.
 */

import { useState, type ReactNode } from "react";
import { TabBarComponent, tabBarStyles } from "@rodrigo-barraza/components-library";
import ToolSelectionComponent from "./ToolSelectionComponent";
import SkillsPanel from "./SkillsPanelComponent";
import RulesPanel from "./RulesPanelComponent";
import HooksPanel from "./HooksPanelComponent";
import ProjectInstructionsPanel from "./ProjectInstructionsPanelComponent";
import MemoriesPanel from "./MemoriesPanelComponent";
import WorkflowMemoriesPanel from "./WorkflowMemoriesPanelComponent";
import TasksPanel from "./TasksPanelComponent";
import DatastorePanel from "./DatastorePanelComponent";
import SidebarTabHeaderComponent from "./SidebarTabHeaderComponent";
import type { ChatSidebar } from "../hooks/useChatSidebar";
import type { AgentToolset } from "../hooks/useAgentToolset";
import type { AgentResources } from "../hooks/useAgentResources";

interface ChatSidebarBottomComponentProps {
  sidebar: ChatSidebar;
  toolset: AgentToolset;
  resources: AgentResources;
  isAdmin: boolean;
  isNoAgent: boolean;
  agentId: string;
  agentProject: string | undefined;
  conversationId: string;
  /** Function calling is off (Direct Chat): the tools tab's tooltip says so. */
  isFunctionCallingDisabled: boolean;
  /** The conversation has messages: its tools are no longer the user's to toggle. */
  isSessionLocked: boolean;
}

function tabIcon(emoji: string) {
  return <span className={tabBarStyles['tab-emoji-icon']}>{emoji}</span>;
}

export default function ChatSidebarBottomComponent({
  sidebar,
  toolset,
  resources,
  isAdmin,
  isNoAgent,
  agentId,
  agentProject,
  conversationId,
  isFunctionCallingDisabled,
  isSessionLocked,
}: ChatSidebarBottomComponentProps) {
  const { leftTabBottom, selectBottomTab, badgeProps } = sidebar;
  const { skills, rules, hooks, projectInstructions } = resources;
  const {
    builtInTools,
    disabledTools,
    handleToggleBuiltIn,
    lockedOffTools,
    isCoreToolsLocked,
    selectableConfigurableTools,
    selectableCoreToolsCount,
    enabledSelectableConfigurableToolsCount,
    enabledSelectableCoreToolsCount,
    hasAnyMemoryModelSet,
    memoryConfigured,
  } = toolset;
  const [skillsHeaderActions, setSkillsHeaderActions] = useState<ReactNode>(null);
  const [rulesHeaderActions, setRulesHeaderActions] = useState<ReactNode>(null);
  const [hooksHeaderActions, setHooksHeaderActions] = useState<ReactNode>(null);
  const [projectInstructionsHeaderActions, setProjectInstructionsHeaderActions] = useState<ReactNode>(null);
  const [memoriesHeaderActions, setMemoriesHeaderActions] = useState<ReactNode>(null);
  const [workflowMemoriesHeaderActions, setWorkflowMemoriesHeaderActions] = useState<ReactNode>(null);
  const [tasksHeaderActions, setTasksHeaderActions] = useState<ReactNode>(null);
  const [datastoreHeaderActions, setDatastoreHeaderActions] = useState<ReactNode>(null);

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
          {
            key: "tools",
            icon: tabIcon("🔧"),
            ...badgeProps(selectableConfigurableTools.length + selectableCoreToolsCount, "tools"),
            tooltip: "Tools",
            tooltipDisabled: isFunctionCallingDisabled,
          },
          ...(!isNoAgent
            ? [
                {
                  key: "skills",
                  icon: tabIcon("📖"),
                  ...badgeProps(skills.filter((state) => state.enabled).length, "skills"),
                  tooltip: "Skills",
                },
                {
                  key: "rules",
                  icon: tabIcon("📏"),
                  ...badgeProps(rules.filter((rule) => rule.enabled).length, "rules"),
                  tooltip: "Rules",
                },
                {
                  key: "instructions",
                  icon: tabIcon("📋"),
                  // The badge is a version, not a count — render it as "v3" so
                  // it is never misread as "3 instructions".
                  ...badgeProps(projectInstructions?.version ?? 0, "instructions"),
                  badge: projectInstructions?.version ? `v${projectInstructions.version}` : 0,
                  tooltip: "Project Instructions",
                },
                {
                  key: "hooks",
                  icon: tabIcon("🪝"),
                  ...badgeProps(hooks.filter((hook) => hook.enabled).length, "hooks"),
                  tooltip: "Hooks",
                },
                ...(hasAnyMemoryModelSet
                  ? [
                      {
                        key: "memories",
                        icon: tabIcon("🧠"),
                        ...badgeProps(sidebar.totalMemoriesCount, "memories"),
                        tooltip: "Memories",
                      },
                      {
                        key: "workflows",
                        icon: tabIcon("⚡"),
                        ...badgeProps(sidebar.workflowMemoriesCount, "workflows"),
                        tooltip: "Workflows",
                      },
                    ]
                  : []),
                {
                  key: "tasks",
                  icon: tabIcon("✅"),
                  ...badgeProps(sidebar.tasksCount, "tasks"),
                  tooltip: "Tasks",
                },
                {
                  key: "datastore",
                  icon: tabIcon("🗄️"),
                  ...badgeProps(sidebar.datastoreCount, "datastore"),
                  tooltip: "Datastore",
                },
              ]
            : []),
        ]}
        activeTab={leftTabBottom}
        onChange={selectBottomTab}
      />

      {leftTabBottom === "tools" && (
        <>
          <SidebarTabHeaderComponent
            icon="🔧"
            title="Tools"
            count={`${enabledSelectableConfigurableToolsCount + (isCoreToolsLocked ? selectableCoreToolsCount : enabledSelectableCoreToolsCount)} / ${selectableConfigurableTools.length + selectableCoreToolsCount}`}
            hasOnlyCoreToolsActive={enabledSelectableConfigurableToolsCount === 0 && (isCoreToolsLocked || enabledSelectableCoreToolsCount === 0)}
          />
          <ToolSelectionComponent
            availableTools={builtInTools}
            enabledTools={builtInTools
              .filter((tool) => !disabledTools.has(tool.name))
              .map((tool) => tool.name)}
            onEnabledToolsChange={(newEnabled) => {
              const enabledSet = new Set(newEnabled);
              for (const tool of builtInTools) {
                if (isCoreToolsLocked && tool.system) continue;
                const isDisabled = disabledTools.has(tool.name);
                const shouldBeEnabled = enabledSet.has(tool.name);
                if (isDisabled && shouldBeEnabled) handleToggleBuiltIn(tool.name);
                else if (!isDisabled && !shouldBeEnabled) handleToggleBuiltIn(tool.name);
              }
            }}
            coreToolsLocked={isCoreToolsLocked}
            lockedOffTools={lockedOffTools}
            readOnly={isSessionLocked}
          />
        </>
      )}

      {leftTabBottom === "skills" && (
        <>
          <SidebarTabHeaderComponent icon="📖" title="Skills" count={skills.length} actions={skillsHeaderActions} />
          <SkillsPanel
            readOnly={isAdmin}
            skills={skills}
            onSkillsChange={resources.loadSkills}
            project={agentProject}
            onActionsChange={setSkillsHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "rules" && (
        <>
          <SidebarTabHeaderComponent icon="📏" title="Rules" count={rules.length} actions={rulesHeaderActions} />
          <RulesPanel
            readOnly={isAdmin}
            rules={rules}
            onRulesChange={resources.loadRules}
            agent={agentId}
            onActionsChange={setRulesHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "instructions" && (
        <>
          <SidebarTabHeaderComponent
            icon="📋"
            title="Project Instructions"
            count={projectInstructions?.version ? `v${projectInstructions.version}` : null}
            actions={projectInstructionsHeaderActions}
          />
          <ProjectInstructionsPanel
            readOnly={isAdmin}
            instructions={projectInstructions}
            onInstructionsChange={resources.loadProjectInstructions}
            agent={agentId}
            onActionsChange={setProjectInstructionsHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "hooks" && (
        <>
          <SidebarTabHeaderComponent icon="🪝" title="Hooks" count={hooks.length} actions={hooksHeaderActions} />
          <HooksPanel
            readOnly={isAdmin}
            hooks={hooks}
            onHooksChange={resources.loadHooks}
            agent={agentId}
            onActionsChange={setHooksHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "memories" && hasAnyMemoryModelSet && (
        <>
          <SidebarTabHeaderComponent icon="🧠" title="Memories" count={sidebar.totalMemoriesCount} actions={memoriesHeaderActions} />
          <MemoriesPanel
            project={agentProject}
            agent={agentId}
            refreshKey={sidebar.memoriesRefreshKey}
            onCountChange={sidebar.setTotalMemoriesCount}
            onActionsChange={setMemoriesHeaderActions}
            memoryConfigured={memoryConfigured}
          />
        </>
      )}

      {leftTabBottom === "workflows" && hasAnyMemoryModelSet && (
        <>
          <SidebarTabHeaderComponent icon="⚡" title="Workflows" count={sidebar.workflowMemoriesCount} actions={workflowMemoriesHeaderActions} />
          <WorkflowMemoriesPanel
            project={agentProject}
            agent={agentId}
            onCountChange={sidebar.setWorkflowMemoriesCount}
            onActionsChange={setWorkflowMemoriesHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "tasks" && (
        <>
          <SidebarTabHeaderComponent icon="✅" title="Tasks" count={sidebar.tasksCount} actions={tasksHeaderActions} />
          <TasksPanel
            project={agentProject}
            refreshKey={sidebar.tasksRefreshKey}
            conversationId={conversationId}
            onCountChange={sidebar.setTasksCount}
            onActionsChange={setTasksHeaderActions}
          />
        </>
      )}

      {leftTabBottom === "datastore" && (
        <>
          <SidebarTabHeaderComponent icon="🗄️" title="Datastore" count={sidebar.datastoreCount} actions={datastoreHeaderActions} />
          <DatastorePanel
            project={agentProject}
            refreshKey={sidebar.datastoreRefreshKey}
            onCountChange={sidebar.setDatastoreCount}
            onActionsChange={setDatastoreHeaderActions}
          />
        </>
      )}
    </div>
  );
}
