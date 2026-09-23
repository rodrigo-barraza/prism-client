"use client";

/**
 * The tools an agent turn may use: the agent's tool schemas, which the user
 * turned off, which are locked off (a settings model or the workspace is
 * missing), and the counts and capabilities the chat derives from them.
 */

import { useEffect, useMemo, useState } from "react";
import { DOMAINS, TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import type { ToolDisplayMetadata } from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import useToolToggles from "./useToolToggles";
import { isNameBasedThinkingModel } from "../utils/utilities";
import { LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE } from "../constants";
import type { PrismConfig, PrismSettings, ToolSchema } from "../types/types";
import type { ChatSettings } from "./useChatModelSettings";

interface WorkspaceEntry {
  path: string;
  isAgentServed?: boolean;
}

interface UseAgentToolsetOptions {
  isAdmin: boolean;
  isNoAgent: boolean;
  agentId: string;
  /** Core tools stay on (the agent's `coreToolsLocked`). */
  isCoreToolsLocked: boolean;
  config: PrismConfig | null;
  settings: ChatSettings;
  setSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
  currentWorkspace: WorkspaceEntry | null | undefined;
  workspaces: WorkspaceEntry[];
  workspacesLoaded: boolean;
  unavailableWorkspace: string | null;
  /** The conversation has messages: its settings are no longer the user's to toggle. */
  hasMessages: boolean;
}

function isWorkspaceTool(tool: ToolSchema): boolean {
  return (
    tool.domainKey === DOMAINS.CORE_WORKSPACE.key ||
    tool.domain === DOMAINS.CORE_WORKSPACE.displayName ||
    tool.name === TOOL_NAMES.ENTER_WORKTREE ||
    tool.name === TOOL_NAMES.EXIT_WORKTREE
  );
}

export default function useAgentToolset({
  isAdmin,
  isNoAgent,
  agentId,
  isCoreToolsLocked,
  config,
  settings,
  setSettings,
  currentWorkspace,
  workspaces,
  workspacesLoaded,
  unavailableWorkspace,
  hasMessages,
}: UseAgentToolsetOptions) {
  const [builtInTools, setBuiltInTools] = useState<ToolSchema[]>([]);
  const toolDisplayMetadataMap = useMemo(() => {
    const map: Record<string, ToolDisplayMetadata> = {};
    for (const tool of builtInTools || []) {
      if (tool.display) {
        map[tool.name] = tool.display;
      }
    }
    return map;
  }, [builtInTools]);

  // Which settings models are configured (Settings → Memory / Creative): a
  // tool that needs one is locked off without it.
  const [hasLoadedModelSettings, setHasLoadedModelSettings] = useState(false);
  const [memoryConfigured, setMemoryConfigured] = useState(false);
  const [hasAnyMemoryModelSet, setHasAnyMemoryModelSet] = useState(false);
  const [imageModelConfigured, setImageModelConfigured] = useState(false);
  const [visionModelConfigured, setVisionModelConfigured] = useState(false);
  const [textToSpeechModelConfigured, setTextToSpeechModelConfigured] = useState(false);
  const [speechToTextModelConfigured, setSpeechToTextModelConfigured] = useState(false);
  const [extractionModelConfigured, setExtractionModelConfigured] = useState(false);
  const [consolidationModelConfigured, setConsolidationModelConfigured] = useState(false);
  const [embeddingModelConfigured, setEmbeddingModelConfigured] = useState(false);

  const toolToggles = useToolToggles(builtInTools, isCoreToolsLocked);
  const { disabledTools } = toolToggles;

  useEffect(() => {
    if (isAdmin) return;
    async function loadAgenticTools() {
      // Trigger Prism to re-fetch from tools-api (picks up newly added tools)
      try {
        await PrismService.refreshBuiltInToolSchemas();
      } catch {
        // Non-fatal — Prism may still have a stale cache
      }

      let tools = await PrismService.getBuiltInToolSchemas(
        isNoAgent ? undefined : agentId,
      );

      // Agentless mode: strip workspace/file domains — the model has no
      // SystemPromptAssembler context and cannot actually read/write files.
      if (isNoAgent) {
        const agentOnlyDomains = new Set<string>([
          DOMAINS.CORE_WORKSPACE.displayName,
        ]);
        tools = tools.filter(
          (tool) => !agentOnlyDomains.has(tool.domain || ""),
        );
      }

      setBuiltInTools(tools);
    }
    loadAgenticTools().catch(console.error);
  }, [agentId, isNoAgent, isAdmin]);

  // -- Fetch settings to determine which model-dependent tools are configured --
  useEffect(() => {
    PrismService.getSettings()
      .then((state: PrismSettings) => {
        const memorySection = state?.memory;
        const creativeSection = state?.creative;

        const hasExtraction = Boolean(memorySection?.extractionProvider && memorySection?.extractionModel);
        const hasConsolidation = Boolean(memorySection?.consolidationProvider && memorySection?.consolidationModel);
        const hasEmbedding = Boolean(memorySection?.embeddingProvider && memorySection?.embeddingModel);
        const isFullyConfigured = hasExtraction && hasConsolidation && hasEmbedding;

        setMemoryConfigured(isFullyConfigured);
        setExtractionModelConfigured(hasExtraction);
        setConsolidationModelConfigured(hasConsolidation);
        setEmbeddingModelConfigured(hasEmbedding);
        setHasAnyMemoryModelSet(hasExtraction || hasConsolidation || hasEmbedding);
        setHasLoadedModelSettings(true);

        setImageModelConfigured(Boolean(creativeSection?.imageProvider && creativeSection?.imageModel));
        setVisionModelConfigured(Boolean(creativeSection?.visionProvider && creativeSection?.visionModel));
        setTextToSpeechModelConfigured(Boolean(creativeSection?.textToSpeechProvider && creativeSection?.textToSpeechModel));
        setSpeechToTextModelConfigured(Boolean(creativeSection?.speechToTextProvider && creativeSection?.speechToTextModel));

        if (state?.agents) {
          setSettings((previousSettings) => ({
            ...previousSettings,
            agents: { ...previousSettings.agents, ...state.agents },
          }));
        }
      })
      .catch(() => {
        setMemoryConfigured(false);
        setHasAnyMemoryModelSet(false);
        setImageModelConfigured(false);
        setVisionModelConfigured(false);
        setTextToSpeechModelConfigured(false);
        setSpeechToTextModelConfigured(false);
        setExtractionModelConfigured(false);
        setConsolidationModelConfigured(false);
        setEmbeddingModelConfigured(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tools that are force-disabled because a prerequisite settings model isn't configured.
  // Maps tool name → human-readable reason (shown in tooltip).
  const lockedOffTools = useMemo(() => {
    const lockedToolsMap = new Map<string, string>();
    if (!memoryConfigured) lockedToolsMap.set(TOOL_NAMES.SAVE_MEMORY, "Configure all Memory Models in Settings to unlock");
    if (!extractionModelConfigured) lockedToolsMap.set(TOOL_NAMES.EXTRACT_MEMORIES, "Configure the Extraction Model in Settings → Memory Models to unlock");
    if (!consolidationModelConfigured) lockedToolsMap.set(TOOL_NAMES.CONSOLIDATE_MEMORIES, "Configure the Consolidation Model in Settings → Memory Models to unlock");
    if (!embeddingModelConfigured) lockedToolsMap.set(TOOL_NAMES.SEARCH_MEMORIES, "Configure the Embedding Model in Settings → Memory Models to unlock");
    if (!imageModelConfigured) lockedToolsMap.set(TOOL_NAMES.GENERATE_IMAGE, "Configure the Image Generation Model in Settings → Creative Tools to unlock");
    if (!visionModelConfigured) lockedToolsMap.set(TOOL_NAMES.DESCRIBE_IMAGE, "Configure the Vision Model in Settings → Creative Tools to unlock");
    if (!textToSpeechModelConfigured) lockedToolsMap.set(TOOL_NAMES.SYNTHESIZE_SPEECH, "Configure the Text-to-Speech Model in Settings → Audio to unlock");
    if (!speechToTextModelConfigured) lockedToolsMap.set(TOOL_NAMES.TRANSCRIBE_AUDIO, "Configure the Speech-to-Text Model in Settings → Audio to unlock");

    // When the model has native thinking as a built-in capability, the think tool is redundant
    const activeModelDefinition = (config && settings.provider && settings.model)
      ? config.textToText?.models?.[settings.provider]?.find(
          (model: { name: string }) => model.name === settings.model,
        ) as Record<string, unknown> | undefined
      : undefined;
    const hasNativeThinking = !!(
      activeModelDefinition?.thinking ||
      activeModelDefinition?.supportsThinking ||
      (Array.isArray(activeModelDefinition?.thinkingLevels) && (activeModelDefinition.thinkingLevels as string[]).length > 0) ||
      (Array.isArray(activeModelDefinition?.tools) && (activeModelDefinition.tools as string[]).includes("Thinking")) ||
      (settings.provider === "lm-studio" &&
        isNameBasedThinkingModel(settings.model, config))
    );
    if (hasNativeThinking) {
      lockedToolsMap.set(TOOL_NAMES.THINK, "Disabled — this model has built-in thinking/reasoning");
    }

    // Force-disable workspace tools if no workspace is set up or active workspace is down
    const workspaceIsDown = !currentWorkspace || !currentWorkspace.isAgentServed;
    if (workspaceIsDown) {
      const reason = !currentWorkspace
        ? "No workspace set up — configure one in Settings to unlock"
        : "Workspace connector is offline — make sure the connector is running and connected";
      for (const tool of builtInTools || []) {
        if (isWorkspaceTool(tool)) {
          lockedToolsMap.set(tool.name, reason);
        }
      }
    }

    // Lock off workspace tools when the workspace capability is explicitly disabled via Strategy toggle
    if (settings.agents?.workspaceEnabled === false) {
      const workspaceDisabledReason = "Workspace capability disabled — enable it in Strategy settings to unlock";
      for (const tool of builtInTools || []) {
        if (isWorkspaceTool(tool) && !lockedToolsMap.has(tool.name)) {
          lockedToolsMap.set(tool.name, workspaceDisabledReason);
        }
      }
    }

    return lockedToolsMap;
  }, [
    memoryConfigured,
    extractionModelConfigured,
    consolidationModelConfigured,
    embeddingModelConfigured,
    imageModelConfigured,
    visionModelConfigured,
    textToSpeechModelConfigured,
    speechToTextModelConfigured,
    config,
    settings.provider,
    settings.model,
    currentWorkspace,
    builtInTools,
    settings.agents?.workspaceEnabled,
  ]);

  const selectableConfigurableTools = useMemo(
    () => builtInTools.filter((tool) => tool.system !== true && !lockedOffTools.has(tool.name)),
    [builtInTools, lockedOffTools],
  );

  const enabledSelectableConfigurableToolsCount = useMemo(
    () => selectableConfigurableTools.filter((tool) => !disabledTools.has(tool.name)).length,
    [selectableConfigurableTools, disabledTools],
  );

  const selectableCoreToolsCount = useMemo(
    () => builtInTools.filter((tool) => tool.system === true && !lockedOffTools.has(tool.name)).length,
    [builtInTools, lockedOffTools],
  );

  const enabledSelectableCoreToolsCount = useMemo(
    () =>
      builtInTools.filter(
        (tool) => tool.system === true && !lockedOffTools.has(tool.name) && !disabledTools.has(tool.name),
      ).length,
    [builtInTools, lockedOffTools, disabledTools],
  );

  // Derive whether the active agent has Workspace capability (files, git, search, etc.)
  const hasFileOperations = useMemo(
    () => builtInTools.some((tool) => tool.domain === DOMAINS.CORE_WORKSPACE.displayName),
    [builtInTools],
  );

  const hasOrchestratorTools = useMemo(
    () => builtInTools.some(
      (tool) =>
        tool.domain === DOMAINS.CORE_ORCHESTRATOR.displayName &&
        !disabledTools.has(tool.name) &&
        !lockedOffTools.has(tool.name),
    ),
    [builtInTools, disabledTools, lockedOffTools],
  );

  const isWorkspaceTabVisible = useMemo(() => {
    return (
      !isNoAgent &&
      settings.agents?.workspaceEnabled !== false &&
      ((currentWorkspace &&
        hasFileOperations &&
        (currentWorkspace.path !== "/workspace" ||
          currentWorkspace.isAgentServed ||
          workspaces.some((workspace) => workspace.path !== "/workspace"))) ||
        !!unavailableWorkspace)
    );
  }, [isNoAgent, currentWorkspace, hasFileOperations, workspaces, unavailableWorkspace, settings.agents?.workspaceEnabled]);

  // Keep the Workspace toggle in sync with live workspace availability while
  // the conversation is still new (settings unlocked): a disconnect flips it
  // off, a reconnect restores the user's persisted preference. The persisted
  // preference itself is only written by explicit user toggles.
  useEffect(() => {
    if (!workspacesLoaded || isNoAgent || hasMessages) return;
    const workspaceAvailable = workspaces.length > 0;
    const workspaceToggledOn = settings.agents?.workspaceEnabled !== false;
    if (!workspaceAvailable && workspaceToggledOn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setSettings((state) => ({
        ...state,
        agents: { ...state.agents, workspaceEnabled: false },
      }));
    } else if (workspaceAvailable && !workspaceToggledOn) {
      const persistedWorkspaceToggle = localStorage.getItem(
        LOCAL_STORAGE_KEY_WORKSPACE_TOGGLE_PREFERENCE,
      );
      if (persistedWorkspaceToggle !== "false") {
        setSettings((state) => ({
          ...state,
          agents: { ...state.agents, workspaceEnabled: true },
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSettings is a state setter
  }, [
    workspacesLoaded,
    workspaces.length,
    isNoAgent,
    hasMessages,
    settings.agents?.workspaceEnabled,
  ]);

  return {
    builtInTools,
    setBuiltInTools,
    toolDisplayMetadataMap,
    ...toolToggles,
    lockedOffTools,
    selectableConfigurableTools,
    enabledSelectableConfigurableToolsCount,
    selectableCoreToolsCount,
    enabledSelectableCoreToolsCount,
    hasFileOperations,
    hasOrchestratorTools,
    isWorkspaceTabVisible,
    isCoreToolsLocked,
    memoryConfigured,
    hasAnyMemoryModelSet,
    hasLoadedModelSettings,
  };
}

export type AgentToolset = ReturnType<typeof useAgentToolset>;
