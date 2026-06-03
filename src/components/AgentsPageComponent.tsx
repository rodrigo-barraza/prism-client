"use client";

import React, { useState, useEffect, useCallback } from "react";
import PrismService from "../services/PrismService";
import type { CustomAgent, AgentPersona, SerializedPolicy, ToolSchema } from "../types/types";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import AgentsSidebarPanelComponent from "./AgentsSidebarPanelComponent";
import AgentsDetailPanelComponent from "./AgentsDetailPanelComponent";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import NavigationSidebarComponent from "./NavigationSidebarComponent";
import { getErrorMessage } from "../utils/errorMessage";
import styles from "./AgentsPageComponent.module.css";

export interface EditableAgent extends CustomAgent {
  identity?: string;
  guidelines?: string;
  toolPolicy?: string;
  usesDirectoryTree?: boolean;
  usesCodingGuidelines?: boolean;
  policies?: SerializedPolicy[];
  agentId?: string;
}

const EMPTY_AGENT: EditableAgent = {
  id: "",
  name: "",
  description: "",
  project: "coding",
  icon: "Bot",
  color: "#6366f1",
  backgroundImage: "",
  identity: "",
  guidelines: "",
  toolPolicy: "",
  enabledTools: [],
  policies: [],
  usesDirectoryTree: false,
  usesCodingGuidelines: false,
};

export default function AgentsPageComponent() {
  const [builtInAgents, setBuiltInAgents] = useState<AgentPersona[]>([]);
  const [customAgents, setCustomAgents] = useState<EditableAgent[]>([]);
  const [availableTools, setAvailableTools] = useState<ToolSchema[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [editingAgent, setEditingAgent] = useState<EditableAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [personasResult, customAgentsResult, toolsResult] = await Promise.all([
        PrismService.getAgentPersonas(),
        PrismService.getCustomAgents(),
        PrismService.getBuiltInToolSchemas(),
      ]);
      setBuiltInAgents(personasResult || []);
      setCustomAgents((customAgentsResult as EditableAgent[]) || []);
      setAvailableTools(toolsResult || []);

      if (personasResult && personasResult.length > 0 && !selectedAgentId && !isCreateMode) {
        setSelectedAgentId(personasResult[0].id);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgentId, isCreateMode]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleSelectAgent = useCallback(
    (agentId: string, isCustom: boolean) => {
      setSelectedAgentId(agentId);
      setIsCreateMode(false);
      setIsConfirmingDelete(false);
      setErrorMessage(null);

      if (isCustom) {
        const foundCustomAgent = customAgents.find((agent) => String(agent._id) === agentId);
        if (foundCustomAgent) {
          setEditingAgent({
            ...foundCustomAgent,
            enabledTools: foundCustomAgent.enabledTools || [],
            policies: foundCustomAgent.policies || [],
          });
        }
      } else {
        setEditingAgent(null);
      }
    },
    [customAgents],
  );

  const handleCreateNewAgent = useCallback(() => {
    setSelectedAgentId(null);
    setIsCreateMode(true);
    setIsConfirmingDelete(false);
    setErrorMessage(null);
    setEditingAgent({ ...EMPTY_AGENT, enabledTools: [] });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsCreateMode(false);
    setErrorMessage(null);
    if (builtInAgents.length > 0) {
      handleSelectAgent(builtInAgents[0].id, false);
    } else if (customAgents.length > 0) {
      handleSelectAgent(String(customAgents[0]._id), true);
    } else {
      setSelectedAgentId(null);
      setEditingAgent(null);
    }
  }, [builtInAgents, customAgents, handleSelectAgent]);

  const updateField = useCallback(
    <K extends keyof EditableAgent>(field: K, value: EditableAgent[K]) => {
      setEditingAgent((previousAgentState) =>
        previousAgentState ? { ...previousAgentState, [field]: value } : previousAgentState,
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!editingAgent?.name?.trim()) {
      setErrorMessage("Agent name is required");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (isCreateMode) {
        const newlyCreatedAgent = await PrismService.createCustomAgent(editingAgent);
        setIsCreateMode(false);
        const customAgentsResult = await PrismService.getCustomAgents();
        setCustomAgents((customAgentsResult as EditableAgent[]) || []);
        if (newlyCreatedAgent && newlyCreatedAgent._id) {
          handleSelectAgent(String(newlyCreatedAgent._id), true);
        }
      } else {
        await PrismService.updateCustomAgent(String(editingAgent._id || ""), editingAgent);
        const customAgentsResult = await PrismService.getCustomAgents();
        setCustomAgents((customAgentsResult as EditableAgent[]) || []);
        setErrorMessage(null);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [editingAgent, isCreateMode, handleSelectAgent]);

  const handleDeleteAgent = useCallback(async () => {
    if (!editingAgent?._id) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await PrismService.deleteCustomAgent(String(editingAgent._id));
      setIsConfirmingDelete(false);
      const customAgentsResult = await PrismService.getCustomAgents();
      setCustomAgents((customAgentsResult as EditableAgent[]) || []);
      if (builtInAgents.length > 0) {
        handleSelectAgent(builtInAgents[0].id, false);
      } else if (customAgentsResult && customAgentsResult.length > 0) {
        handleSelectAgent(String(customAgentsResult[0]._id), true);
      } else {
        setSelectedAgentId(null);
        setEditingAgent(null);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [editingAgent, builtInAgents, handleSelectAgent]);

  const handleDuplicateAgent = useCallback(
    (sourceAgent: AgentPersona) => {
      setSelectedAgentId(null);
      setIsCreateMode(true);
      setIsConfirmingDelete(false);
      setErrorMessage(null);
      setEditingAgent({
        id: "",
        name: `${sourceAgent.name} Copy`,
        description: sourceAgent.description,
        project: sourceAgent.project || "coding",
        icon: sourceAgent.icon || "Bot",
        color: sourceAgent.color || "#6366f1",
        backgroundImage: sourceAgent.backgroundImage || "",
        identity: "",
        guidelines: "",
        toolPolicy: "",
        enabledTools: sourceAgent.enabledToolNames || [],
        policies: [],
        usesDirectoryTree: sourceAgent.usesDirectoryTree,
        usesCodingGuidelines: sourceAgent.usesCodingGuidelines,
      });
    },
    [],
  );

  if (isLoading) {
    return (
      <ThreePanelLayout
        navSidebar={<NavigationSidebarComponent mode="user" />}
        leftPanel={null}
        leftTitle="Agents"
      >
        <div className={styles["loading-spinner-wrapper"]}>
          <PanelLoadingSpinner size="medium" />
        </div>
      </ThreePanelLayout>
    );
  }

  const selectedBuiltInAgent = builtInAgents.find((agent) => agent.id === selectedAgentId);
  const selectedCustomAgent = customAgents.find((agent) => String(agent._id) === selectedAgentId);

  return (
    <ThreePanelLayout
      navSidebar={<NavigationSidebarComponent mode="user" />}
      leftPanel={
        <AgentsSidebarPanelComponent
          builtInAgents={builtInAgents}
          customAgents={customAgents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          onCreateNewAgent={handleCreateNewAgent}
        />
      }
      leftTitle="Agents"
    >
      <AgentsDetailPanelComponent
        editingAgent={editingAgent}
        selectedBuiltInAgent={selectedBuiltInAgent}
        selectedCustomAgent={selectedCustomAgent}
        isCreateMode={isCreateMode}
        isSaving={isSaving}
        isConfirmingDelete={isConfirmingDelete}
        errorMessage={errorMessage}
        availableTools={availableTools}
        onUpdateField={updateField}
        onSave={handleSave}
        onCancelEdit={handleCancelEdit}
        onDeleteAgent={handleDeleteAgent}
        onConfirmDeleteToggle={setIsConfirmingDelete}
        onDuplicateAgent={handleDuplicateAgent}
      />
    </ThreePanelLayout>
  );
}
