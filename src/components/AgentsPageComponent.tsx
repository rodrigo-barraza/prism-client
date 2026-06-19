"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, usePathname } from "next/navigation";
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
  avatar: "",
  color: "#6366f1",
  backgroundImage: "",
  identity: "",
  guidelines: "",
  toolPolicy: "",
  enabledTools: [],
  enabledByDefaultTools: [],
  policies: [],
  usesDirectoryTree: false,
  usesCodingGuidelines: false,
};

function resolveAgentDisplayName(
  agentId: string | null,
  builtInAgents: AgentPersona[],
  customAgents: EditableAgent[],
): string | null {
  if (!agentId) return null;
  const builtIn = builtInAgents.find((agent) => agent.id === agentId);
  if (builtIn) return builtIn.name;
  const custom = customAgents.find((agent) => String(agent._id) === agentId);
  if (custom) return custom.name;
  return null;
}

function resolveAgentIdFromName(
  agentName: string,
  builtInAgents: AgentPersona[],
  customAgents: EditableAgent[],
): { agentId: string; isCustom: boolean } | null {
  const builtIn = builtInAgents.find(
    (agent) => agent.name.toLowerCase() === agentName.toLowerCase(),
  );
  if (builtIn) return { agentId: builtIn.id, isCustom: false };
  const custom = customAgents.find(
    (agent) => agent.name.toLowerCase() === agentName.toLowerCase(),
  );
  if (custom) return { agentId: String(custom._id), isCustom: true };
  return null;
}

export default function AgentsPageComponent() {
  const [builtInAgents, setBuiltInAgents] = useState<AgentPersona[]>([]);
  const [customAgents, setCustomAgents] = useState<EditableAgent[]>([]);
  const [availableTools, setAvailableTools] = useState<ToolSchema[]>([]);
  const [selectedBuiltInAgentTools, setSelectedBuiltInAgentTools] = useState<ToolSchema[] | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [editingAgent, setEditingAgent] = useState<EditableAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasRestoredFromUrl, setHasRestoredFromUrl] = useState(false);

  const searchParameters = useSearchParams();
  const pathname = usePathname();

  const updateUrlAgentParameter = useCallback(
    (agentName: string | null) => {
      if (agentName) {
        const encodedName = encodeURIComponent(agentName);
        window.history.replaceState(null, "", `${pathname}?agent=${encodedName}`);
      } else {
        window.history.replaceState(null, "", pathname);
      }
    },
    [pathname],
  );

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

      const urlAgentName = searchParameters.get("agent");
      const allBuiltIn = personasResult || [];
      const allCustom = (customAgentsResult as EditableAgent[]) || [];

      if (urlAgentName && !hasRestoredFromUrl) {
        const resolved = resolveAgentIdFromName(urlAgentName, allBuiltIn, allCustom);
        if (resolved) {
          setSelectedAgentId(resolved.agentId);
          if (resolved.isCustom) {
            const foundCustomAgent = allCustom.find(
              (agent) => String(agent._id) === resolved.agentId,
            );
            if (foundCustomAgent) {
              setEditingAgent({
                ...foundCustomAgent,
                enabledTools: foundCustomAgent.enabledTools || [],
                enabledByDefaultTools: foundCustomAgent.enabledByDefaultTools || [],
                policies: foundCustomAgent.policies || [],
              });
            }
          }
          setHasRestoredFromUrl(true);
          return;
        }
      }

      if (allBuiltIn.length > 0 && !selectedAgentId && !isCreateMode) {
        const firstAgentId = allBuiltIn[0].id;
        setSelectedAgentId(firstAgentId);
        updateUrlAgentParameter(allBuiltIn[0].name);
        PrismService.getBuiltInToolSchemas(firstAgentId)
          .then((agentTools) => setSelectedBuiltInAgentTools(agentTools))
          .catch(() => setSelectedBuiltInAgentTools(null));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgentId, isCreateMode, searchParameters, hasRestoredFromUrl, updateUrlAgentParameter]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleSelectAgent = useCallback(
    (agentId: string, isCustom: boolean) => {
      if (agentId === "new-agent-draft") {
        setSelectedAgentId("new-agent-draft");
        setIsCreateMode(true);
        setIsConfirmingDelete(false);
        setErrorMessage(null);
        return;
      }

      setSelectedAgentId(agentId);
      setIsCreateMode(false);
      setIsConfirmingDelete(false);
      setErrorMessage(null);

      if (isCustom) {
        setSelectedBuiltInAgentTools(null);
        const foundCustomAgent = customAgents.find((agent) => String(agent._id) === agentId);
        if (foundCustomAgent) {
          setEditingAgent({
            ...foundCustomAgent,
            enabledTools: foundCustomAgent.enabledTools || [],
            enabledByDefaultTools: foundCustomAgent.enabledByDefaultTools || [],
            policies: foundCustomAgent.policies || [],
          });
          updateUrlAgentParameter(foundCustomAgent.name);
        }
      } else {
        setEditingAgent(null);
        const agentDisplayName = resolveAgentDisplayName(agentId, builtInAgents, customAgents);
        updateUrlAgentParameter(agentDisplayName);
        PrismService.getBuiltInToolSchemas(agentId)
          .then((agentTools) => setSelectedBuiltInAgentTools(agentTools))
          .catch(() => setSelectedBuiltInAgentTools(null));
      }
    },
    [customAgents, builtInAgents, updateUrlAgentParameter],
  );

  const handleCreateNewAgent = useCallback(() => {
    setSelectedAgentId("new-agent-draft");
    setIsCreateMode(true);
    setIsConfirmingDelete(false);
    setErrorMessage(null);
    setEditingAgent({ ...EMPTY_AGENT, enabledTools: [], enabledByDefaultTools: [] });
    updateUrlAgentParameter(null);
  }, [updateUrlAgentParameter]);

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
      updateUrlAgentParameter(null);
    }
  }, [builtInAgents, customAgents, handleSelectAgent, updateUrlAgentParameter]);

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
        updateUrlAgentParameter(editingAgent.name);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [editingAgent, isCreateMode, handleSelectAgent, updateUrlAgentParameter]);

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
        updateUrlAgentParameter(null);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [editingAgent, builtInAgents, handleSelectAgent, updateUrlAgentParameter]);

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
        avatar: sourceAgent.avatar || "",
        color: sourceAgent.color || "#6366f1",
        backgroundImage: sourceAgent.backgroundImage || "",
        identity: "",
        guidelines: "",
        toolPolicy: "",
        enabledTools: sourceAgent.enabledToolNames || [],
        enabledByDefaultTools: sourceAgent.enabledByDefaultToolNames || [],
        policies: [],
        usesDirectoryTree: sourceAgent.usesDirectoryTree,
        usesCodingGuidelines: sourceAgent.usesCodingGuidelines,
      });
      updateUrlAgentParameter(null);
    },
    [updateUrlAgentParameter],
  );

  const sidebarCustomAgents = useMemo(() => {
    if (isCreateMode && editingAgent) {
      return [{ ...editingAgent, _id: "new-agent-draft" }, ...customAgents];
    }
    if (editingAgent && editingAgent._id) {
      return customAgents.map((agent) =>
        String(agent._id) === String(editingAgent._id) ? editingAgent : agent,
      );
    }
    return customAgents;
  }, [isCreateMode, editingAgent, customAgents]);

  if (isLoading) {
    return (
      <ThreePanelLayout
        navSidebar={<NavigationSidebarComponent mode="user" />}
        leftPanel={null}
        leftTitle="Agents"
      >
        <div className={styles["is-loading-state-spinner-wrapper"]}>
          <PanelLoadingSpinner size="medium" />
        </div>
      </ThreePanelLayout>
    );
  }

  const selectedBuiltInAgent = builtInAgents.find((agent) => agent.id === selectedAgentId);
  const selectedCustomAgent = customAgents.find((agent) => String(agent._id) === selectedAgentId);

  return (
    <ThreePanelLayout
      className="agents-page-component"
      navSidebar={<NavigationSidebarComponent mode="user" />}
      leftPanel={
        <AgentsSidebarPanelComponent
          builtInAgents={builtInAgents}
          customAgents={sidebarCustomAgents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          onCreateNewAgent={handleCreateNewAgent}
          availableTools={availableTools}
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
        builtInAgentTools={selectedBuiltInAgentTools}
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
