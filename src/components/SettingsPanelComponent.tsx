"use client";

import { DEFAULT_WORKFLOW_TITLE, FALLBACK_THINKING_PATTERNS, LS_WORKSPACE_TOGGLE_PREFERENCE } from "@/constants";
import { useState, useEffect } from "react";
import {
  Cpu,
  Edit3,
  Mic,
  Brain,
  GitBranch,
  ExternalLink,
  AudioLines,
  Layers,
  Network,
  FolderOpen,
  Terminal,
  Copy,
  Check,
  Users,
  User,
  Bot,
  FolderKanban,
  Globe,
} from "lucide-react";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import {
  SelectComponent,
  ToggleComponent as ToggleSwitch,
  TextAreaComponent,
  useClipboard,
} from "@rodrigo-barraza/components-library";
import CycleButton from "./CycleButtonComponent";
import ModalityIconComponent from "./ModalityIconComponent";
import SystemPromptModal from "./SystemPromptModalComponent";
import styles from "./SettingsPanelComponent.module.css";
import BadgeComponent from "./BadgeComponent";
import StatsTabBarComponent from "./StatsTabBarComponent";
import { formatCost } from "@rodrigo-barraza/utilities-library";
import { CAPABILITY_TOOL_NAMES } from "../utils/utilities";
import { TOGGLEABLE_TOOLS } from "./WorkflowNodeConstantsComponent";
import ToolBadgeComponent from "./ToolBadgeComponent";
import ToolCallBadgeComponent from "./ToolCallBadgeComponent";
import { buildTopologyOptions, buildThoughtStructureOptions } from "./AgentStrategyOptionsComponent";
import PrismService from "../services/PrismService";
import useTokenRate from "../hooks/useTokenRate";
import useTimeToFirstToken from "../hooks/useTtft";
import type {
  PrismConfig,
  PrismSettings,
  ModelOption,
  Workflow,
  VoiceOption,
} from "../types/types";

export interface ConversationStats {
  messageCount: number;
  deletedCount: number;
  requestCount: number;
  uniqueModels?: string[];
  uniqueProviders?: string[];
  totalTokens?: {
    total: number;
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
  };
  avgTokensPerSec?: number;
  avgTimeToGeneration?: number;
  lastTimeToGeneration?: number;
  totalCost: number;
  originalTotalCost: number;
  completedElapsedTime?: number;
  currentTurnStart?: string | number;
  conversationStartTime?: string | number | null;
  usedTools?: Array<{ name: string; count: number }>;
  orchestrator?: ConversationStats;
  subAgents?: ConversationStats;
  modalities?: Record<string, boolean>;
  subAgentCount?: number;
  maxSubAgentDepth?: number;
}

export interface AgentToggleOption {
  key: string;
  icon?: React.ReactNode;
  label: string;
  type?: "cycle" | "toggle";
  value?: number;
  isActive?: boolean;
  onChange?: (value: boolean | number) => void;
  title?: string;
  checked?: boolean;
  disabled?: boolean;
}

export interface SettingsPanelProps {
  config: PrismConfig | null;
  settings: PrismSettings;
  onChange?: (updates: Partial<PrismSettings>) => void;
  _hasAssistantImages?: boolean;
  _inferenceMode?: string;
  readOnly?: boolean;
  hideProviderModel?: boolean;
  hideSystemPrompt?: boolean;
  onSystemPromptClick?: () => void;
  showSystemPromptModal?: boolean;
  onCloseSystemPromptModal?: () => void;
  workflows?: Workflow[];
  conversationStats?: ConversationStats | null;
  lockedTools?: Set<string>;
  conversationType?: string;
  canSpawnSubAgents?: boolean;
  agentToggles?: AgentToggleOption[];
  conversationProject?: string | null;
  conversationUsername?: string | null;
  conversationAgent?: string | null;
}

interface ExtendedModelOption extends ModelOption {
  _isImageGen?: boolean;
  _isTranscription?: boolean;
  _isTTS?: boolean;
}

/**
 * Format the harness ID into a human-readable display label.
 */
export function formatHarnessLabel(harness: string): string {
  if (harness === "standard") return "Standard (ReAct)";
  return harness
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const TOPOLOGY_LABELS: Record<string, string> = {
  sequential: "Sequential (SP)",
  hierarchical: "Hierarchical (HP)",
  hierarchical_aggregation: "Aggregation (MoA)",
  peer_to_peer: "Mesh (MAD)",
  p2p: "Mesh (MAD)",
  tournament: "Tournament (BoN)",
  critic_loop: "Critic Loop (MAR)",
  divide_and_conquer: "D&C (GoT)",
  mcts: "MCTS (LATS)",
};

export function formatTopologyLabel(topology: string): string {
  return TOPOLOGY_LABELS[topology] || topology
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const THOUGHT_STRUCTURE_LABELS: Record<string, string> = {
  chain_of_thought: "Chain of Thought",
  tree_of_thoughts: "Tree of Thoughts",
  graph_of_thoughts: "Graph of Thoughts",
};

export function formatThoughtStructureLabel(structure: string): string {
  return THOUGHT_STRUCTURE_LABELS[structure] || structure
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function SettingsPanel({
  config,
  settings,
  onChange = () => {},
  readOnly = false,
  hideProviderModel = false,
  hideSystemPrompt = false,
  onSystemPromptClick,
  showSystemPromptModal = false,
  onCloseSystemPromptModal,
  workflows = [],
  conversationStats = null,
  lockedTools,
  conversationType = "conversation",
  canSpawnSubAgents = false,
  agentToggles,
  conversationProject,
  conversationUsername,
  conversationAgent,
}: SettingsPanelProps) {
  const conversationLabel = conversationType === "agent" ? "Conversation" : "Conversation";
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(
    () => !!settings.systemPrompt,
  );

  const [availableLocales, setAvailableLocales] = useState<{ value: string; label: string }[]>([
    { value: "en", label: "English" },
  ]);

  useEffect(() => {
    PrismService.getAvailableLocales()
      .then((locales) => {
        if (locales && locales.length > 0) setAvailableLocales(locales);
      })
      .catch(() => {});
  }, []);

  const { copy: copyToClipboard, copied: isCopied } = useClipboard(2000);

  const generateCurlCommand = () => {
    const isDirectChatWithoutAgent = conversationType !== "agent";
    const apiEndpointPath = isDirectChatWithoutAgent ? "/chat" : "/agent";

    const urlSearchParameters = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const agentIdentifier = urlSearchParameters?.get("agent") || "OMNI";
    const projectIdentifier = urlSearchParameters?.get("project") || (agentIdentifier.toLowerCase() === "coding" ? "coding" : "prism-chat");

    const planToggleOption = agentToggles?.find((toggleOption) => toggleOption.key === "plan");
    const autoApproveToggleOption = agentToggles?.find((toggleOption) => toggleOption.key === "auto");
    const criticGateToggleOption = agentToggles?.find((toggleOption) => toggleOption.key === "criticGate");
    const maxIterationsToggleOption = agentToggles?.find((toggleOption) => toggleOption.key === "iterations");
    const maxSubAgentIterationsToggleOption = agentToggles?.find((toggleOption) => toggleOption.key === "subAgentIterations");
    const recursionDepthToggleOption = agentToggles?.find((toggleOption) => toggleOption.key === "recursionDepth");

    const isPlanFirst = planToggleOption ? !!planToggleOption.checked : false;
    const isAutoApprove = autoApproveToggleOption ? !!autoApproveToggleOption.checked : false;
    const isCriticGateEnabled = criticGateToggleOption ? !!criticGateToggleOption.checked : false;
    const maxIterationsCount = maxIterationsToggleOption ? (typeof maxIterationsToggleOption.value === "number" ? maxIterationsToggleOption.value : 10) : 10;
    const maxSubAgentIterationsCount = maxSubAgentIterationsToggleOption ? (typeof maxSubAgentIterationsToggleOption.value === "number" ? maxSubAgentIterationsToggleOption.value : 10) : 10;
    const recursionDepthCount = recursionDepthToggleOption ? (typeof recursionDepthToggleOption.value === "number" ? recursionDepthToggleOption.value : 0) : 0;

    let requestPayload: Record<string, unknown> = {};

    if (isDirectChatWithoutAgent) {
      requestPayload = {
        provider: settings.provider ?? "",
        model: settings.model ?? "",
        messages: [
          ...(settings.systemPrompt
            ? [
                {
                  role: "system",
                  content: settings.systemPrompt,
                },
              ]
            : []),
          {
            role: "user",
            content: "Hello",
          },
        ],
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
        ...(settings.thinkingEnabled !== undefined && {
          thinkingEnabled: settings.thinkingEnabled,
        }),
        ...(settings.reasoningEffort && {
          reasoningEffort: settings.reasoningEffort,
        }),
        ...(settings.thinkingBudget && {
          thinkingBudget: settings.thinkingBudget,
        }),
        ...(settings.thinkingLevel && {
          thinkingLevel: settings.thinkingLevel,
        }),
        functionCallingEnabled: settings.functionCallingEnabled ?? false,
        ...(settings.webSearchEnabled ? { webSearch: true } : {}),
        ...(settings.codeExecutionEnabled ? { codeExecution: true } : {}),
        ...(settings.urlContextEnabled ? { urlContext: true } : {}),
      };
    } else {
      requestPayload = {
        provider: settings.provider ?? "",
        model: settings.model ?? "",
        messages: [
          { role: "system", content: settings.systemPrompt || "" },
          {
            role: "user",
            content: "Hello",
          },
        ],
        functionCallingEnabled: true,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
        ...(settings.thinkingEnabled !== undefined && {
          thinkingEnabled: settings.thinkingEnabled,
        }),
        ...(settings.reasoningEffort && {
          reasoningEffort: settings.reasoningEffort,
        }),
        ...(settings.thinkingBudget && {
          thinkingBudget: settings.thinkingBudget,
        }),
        ...(settings.thinkingLevel && {
          thinkingLevel: settings.thinkingLevel,
        }),
        minContextLength: 120000,
        project: projectIdentifier,
        agent: agentIdentifier,
        harness: settings?.agents?.harness || "standard",
        topology: settings?.agents?.topology || "hierarchical",
        thoughtStructure: settings?.agents?.thoughtStructure || undefined,
        autoApprove: isAutoApprove,
        planFirst: isPlanFirst,
        maxIterations: maxIterationsCount === Infinity ? 0 : maxIterationsCount,
        maxSubAgentIterations: maxSubAgentIterationsCount === Infinity ? 0 : maxSubAgentIterationsCount,
        ...(isCriticGateEnabled && { enableCriticGate: true }),
        maxRecursionDepth: recursionDepthCount,
        ...(settings.agents?.workspaceEnabled === false && {
          workspaceEnabled: false,
        }),
        ...(settings.agents?.locale && {
          locale: settings.agents.locale,
        }),
      };
    }

    return `curl -X POST "https://api.prism.rod.dev${apiEndpointPath}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestPayload, null, 2).replace(/'/g, "'\\''")}'`;
  };

  const textModelsMap = config?.textToText?.models || {};
  const audioToTextModelsMap = config?.audioToText?.models || {};
  const ttsModelsMap = config?.textToSpeech?.models || {};
  const imageModelsMap = config?.textToImage?.models || {};

  const allProviderKeys = new Set([
    ...Object.keys(textModelsMap),
    ...Object.keys(imageModelsMap),
    ...Object.keys(audioToTextModelsMap),
    ...Object.keys(ttsModelsMap),
  ]);
  const modelsMap: Record<string, ExtendedModelOption[]> = {};
  for (const providerKey of allProviderKeys) {
    const textModels = (textModelsMap[providerKey] || []) as ExtendedModelOption[];
    const imageModels = ((imageModelsMap[providerKey] || []) as ExtendedModelOption[]).map(
      (modelOption) => ({
        ...modelOption,
        label: `${modelOption.label} (Image)`,
        _isImageGen: true,
      }),
    );
    const speechToTextModels = (
      (audioToTextModelsMap[providerKey] || []) as ExtendedModelOption[]
    ).map((modelOption) => ({
      ...modelOption,
      label: `${modelOption.label} (Transcribe)`,
      _isTranscription: true,
    }));
    const textToSpeechModels = ((ttsModelsMap[providerKey] || []) as ExtendedModelOption[]).map(
      (modelOption) => ({
        ...modelOption,
        label: `${modelOption.label} (TTS)`,
        _isTTS: true,
      }),
    );
    const seen = new Set<string>();
    const merged: ExtendedModelOption[] = [];
    for (const modelOption of [...textModels, ...imageModels, ...speechToTextModels, ...textToSpeechModels]) {
      if (!seen.has(modelOption.name)) {
        seen.add(modelOption.name);
        merged.push(modelOption);
      }
    }
    modelsMap[providerKey] = merged;
  }

  const _handleSystemPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => onChange({ systemPrompt: e.target.value });

  const currentProviderModels = modelsMap[settings.provider || ""] || [];
  const selectedModelDef = currentProviderModels.find(
    (modelOption) => modelOption.name === settings.model,
  );

  const isTranscription = selectedModelDef?._isTranscription === true;
  const isTTS = selectedModelDef?._isTTS === true;
  const isSpecialModel = isTranscription || isTTS;

  // -- Live token rate + elapsed time (reusable hook) ------------
  const {
    perfNow,
    needsTicker,
    turnActive,
    totalElapsedTime,
    liveTokensPerSecond,
    computedTokensPerSecond,
    hasActiveSubAgents,
  } = useTokenRate(conversationStats);

  // -- Live TTFT (Time To First Token) ---------------------------
  const { liveTimeToFirstToken, isLiveTimeToFirstToken } = useTimeToFirstToken(conversationStats, perfNow, needsTicker);

  // -- Stats tab (All / Orchestrator / Sub-Agents) --------------
  const [statsTab, setStatsTab] = useState("all");

  const showStatsTabBar =
    canSpawnSubAgents && !!(conversationStats?.orchestrator || conversationStats?.subAgents);

  // Resolve which stats object to render based on active tab
  const activeStats = conversationStats
    ? statsTab === "orchestrator"
      ? conversationStats.orchestrator
      : statsTab === "subAgents"
        ? conversationStats.subAgents
        : conversationStats
    : null;

  // Compute displayed elapsed for the active tab
  const activeElapsedTime =
    statsTab === "all"
      ? totalElapsedTime
      : activeStats?.completedElapsedTime || 0;

  const hasConversationMetadata = !!(conversationProject || conversationUsername || conversationAgent);

  const renderConversationMetadataBadges = () => (
    <>
      {conversationProject && (
        <span className={styles['stat-badge']}>
          <FolderKanban size={10} />
          {conversationProject}
        </span>
      )}
      {conversationUsername && (
        <span className={styles['stat-badge']}>
          <User size={10} />
          {conversationUsername}
        </span>
      )}
      {conversationAgent && (
        <span className={styles['stat-badge']}>
          <Bot size={10} />
          {conversationAgent}
        </span>
      )}
    </>
  );

  const renderStatsBadges = (stats: ConversationStats, showFull: boolean) => {
    const timeToFirstTokenValue =
      stats.avgTimeToGeneration ?? conversationStats?.lastTimeToGeneration;

    const estimatedLiveCost = stats.totalCost;

    return (
      <div className={styles['stats-badges']}>
        {renderConversationMetadataBadges()}
        <BadgeComponent
          type="messages"
          count={stats.messageCount}
          deletedCount={stats.deletedCount}
        />
        <BadgeComponent type="requests" count={stats.requestCount} />
        {conversationType === "agent" && settings.agents?.harness && (
          <span className={styles['stat-badge']}>
            <Brain size={10} />
            {formatHarnessLabel(settings.agents.harness)}
          </span>
        )}
        {conversationType === "agent" && settings.agents?.topology && (
          <span className={styles['stat-badge']}>
            <Network size={10} />
            {formatTopologyLabel(settings.agents.topology)}
          </span>
        )}
        {conversationType === "agent" && settings.agents?.thoughtStructure && (
          <span className={styles['stat-badge']}>
            <GitBranch size={10} />
            {formatThoughtStructureLabel(settings.agents.thoughtStructure as string)}
          </span>
        )}
        {conversationType === "agent" && settings.agents?.locale && settings.agents.locale !== "en" && (
          <span className={styles['stat-badge']}>
            <Globe size={10} />
            {availableLocales.find((localeOption) => localeOption.value === settings.agents?.locale)?.label || settings.agents.locale}
          </span>
        )}
        {conversationType === "agent" && settings.agents?.workspaceEnabled === false && (
          <span className={styles['stat-badge']}>
            <FolderOpen size={10} />
            No Workspace
          </span>
        )}
        {conversationType === "agent" && (stats.subAgentCount ?? 0) > 0 && (
          <span className={styles['stat-badge']}>
            <Users size={10} />
            {stats.subAgentCount} sub-agent{stats.subAgentCount !== 1 ? 's' : ''}
          </span>
        )}
        {conversationType === "agent" && (stats.maxSubAgentDepth ?? 0) > 0 && (
          <span className={styles['stat-badge']}>
            <Layers size={10} />
            depth {stats.maxSubAgentDepth}
          </span>
        )}
        {stats.uniqueModels && stats.uniqueModels.length > 0 && (
          <BadgeComponent
            type="model"
            models={stats.uniqueModels}
            providers={stats.uniqueProviders}
          />
        )}
        {stats.totalTokens && stats.totalTokens.total > 0 && (() => {
          const cacheRead = stats.totalTokens.cacheRead || 0;
          const cacheWrite = stats.totalTokens.cacheWrite || 0;
          const hasCachedTokens = cacheRead + cacheWrite > 0;
          const uncachedInputTokens = Math.max(0, stats.totalTokens.input - cacheRead - cacheWrite);
          const reasoning = stats.totalTokens.reasoning || 0;
          const outputTokens = stats.totalTokens.output || 0;

          let inputTokensLabel = "tokens in";
          if (hasCachedTokens) {
            const labelParts = [];
            if (uncachedInputTokens) {
              labelParts.push(`${uncachedInputTokens.toLocaleString()} new`);
            }
            if (cacheRead) {
              labelParts.push(`${cacheRead.toLocaleString()} read`);
            }
            if (cacheWrite) {
              labelParts.push(`${cacheWrite.toLocaleString()} write`);
            }
            inputTokensLabel = `tokens in (${labelParts.join(" · ")})`;
          }

          let outputTokensLabel = "tokens out";
          if (reasoning > 0) {
            outputTokensLabel = `tokens out (${reasoning.toLocaleString()} reasoning)`;
          }

          let totalTokensLabel = "tokens total";
          if (hasCachedTokens || reasoning > 0) {
            const labelParts = [];
            if (uncachedInputTokens) {
              labelParts.push(`${uncachedInputTokens.toLocaleString()} new`);
            }
            if (cacheRead) {
              labelParts.push(`${cacheRead.toLocaleString()} read`);
            }
            if (cacheWrite) {
              labelParts.push(`${cacheWrite.toLocaleString()} write`);
            }
            if (outputTokens) {
              if (reasoning > 0) {
                const nonReasoningOutput = Math.max(0, outputTokens - reasoning);
                if (nonReasoningOutput > 0) {
                  labelParts.push(`${nonReasoningOutput.toLocaleString()} out`);
                }
                labelParts.push(`${reasoning.toLocaleString()} reasoning`);
              } else {
                labelParts.push(`${outputTokens.toLocaleString()} out`);
              }
            }
            totalTokensLabel = `tokens total (${labelParts.join(" · ")})`;
          }

          return (
            <>
              <BadgeComponent
                type="tokens"
                value={stats.totalTokens.input}
                label={inputTokensLabel}
              />
              <BadgeComponent
                type="tokens"
                value={stats.totalTokens.output}
                label={outputTokensLabel}
              />
              <BadgeComponent
                type="tokens"
                value={stats.totalTokens.total}
                label={totalTokensLabel}
              />
            </>
          );
        })()}
        <BadgeComponent
          type="throughput"
          liveTokensPerSecond={liveTokensPerSecond}
          averageTokensPerSecond={stats.avgTokensPerSec}
          isActivelyGenerating={computedTokensPerSecond !== null || hasActiveSubAgents}
          turnActive={turnActive}
        />
        {/* TTFT badge — live during processing, latched after first token, static after completion */}
        {liveTimeToFirstToken !== null ? (
          <span
            className={`${styles['stat-badge']} ${isLiveTimeToFirstToken ? styles['ttft-badge-live'] : styles['ttft-badge']}`}
          >
            ⏱ {liveTimeToFirstToken.toFixed(isLiveTimeToFirstToken ? 1 : 2)}s TTFT
          </span>
        ) : (
          timeToFirstTokenValue != null && (
            <span className={`${styles['stat-badge']} ${styles['ttft-badge']}`}>
              ⏱ {timeToFirstTokenValue.toFixed(2)}s TTFT
            </span>
          )
        )}
        <BadgeComponent type="cost" cost={estimatedLiveCost} />
        {stats.originalTotalCost > 0 &&
          stats.originalTotalCost !== estimatedLiveCost && (
            <span className={`${styles['stat-badge']} ${styles['stat-badge-sub']}`}>
              ({formatCost(stats.originalTotalCost)} total)
            </span>
          )}
        {stats.conversationStartTime && (
          <BadgeComponent
            type="stopwatch"
            startTime={stats.conversationStartTime}
            variant="conversation"
            live
          />
        )}
        {showFull && activeElapsedTime > 0 && (
          <BadgeComponent
            type="stopwatch"
            seconds={activeElapsedTime}
            live={!!stats.currentTurnStart}
            variant="processing"
          />
        )}
        {!showFull &&
          stats.completedElapsedTime !== undefined &&
          stats.completedElapsedTime > 0 && (
            <BadgeComponent
              type="stopwatch"
              seconds={stats.completedElapsedTime}
              live={false}
              variant="processing"
            />
          )}
        {(() => {
          // When viewing "all" stats and there are sub-agents, aggregate tools from orchestrator and sub-agents
          const displayTools: Array<{ name: string; count: number }> = (() => {
            if (
              statsTab !== "all" ||
              !conversationStats?.subAgents ||
              !conversationStats?.orchestrator
            ) {
              return stats.usedTools || [];
            }

            // Merge tools from orchestrator and sub-agents
            const toolMap = new Map<string, number>();

            // Add orchestrator tools
            if (conversationStats.orchestrator?.usedTools) {
              for (const tool of conversationStats.orchestrator.usedTools) {
                toolMap.set(
                  tool.name,
                  (toolMap.get(tool.name) || 0) + (tool.count || 1),
                );
              }
            }

            // Add sub-agent tools
            if (conversationStats.subAgents?.usedTools) {
              for (const tool of conversationStats.subAgents.usedTools) {
                toolMap.set(
                  tool.name,
                  (toolMap.get(tool.name) || 0) + (tool.count || 1),
                );
              }
            }

            // Convert back to array and sort by count
            return Array.from(toolMap.entries())
              .map(([name, count]: [string, number]) => ({ name, count }))
              .sort((firstTool, secondTool) => secondTool.count - firstTool.count);
          })();

          if (!displayTools?.length) return null;

          const capabilities = displayTools.filter((tool) =>
            CAPABILITY_TOOL_NAMES.has(tool.name),
          );
          const toolCalls = displayTools.filter(
            (tool) => !CAPABILITY_TOOL_NAMES.has(tool.name),
          );
          return (
            <>
              {capabilities.map((tool) => (
                <ToolBadgeComponent
                  key={tool.name}
                  name={tool.name}
                  count={tool.count}
                />
              ))}
              {toolCalls.map((tool) => (
                <ToolCallBadgeComponent
                  key={tool.name}
                  name={tool.name}
                  count={tool.count}
                />
              ))}
            </>
          );
        })()}
        {stats.modalities && Object.values(stats.modalities).some(Boolean) && (
          <ModalityIconComponent modalities={stats.modalities} />
        )}
      </div>
    );
  };

  return (
    <>
      <div className={`settings-panel-component ${styles['container']}`}>
        {conversationStats && (
          <div className={styles['conversation-stats']}>
            <div className={styles['stats-header']}>
              <Layers size={12} style={{ marginRight: 4 }} /> {conversationLabel} Details
              {showStatsTabBar && (
                <StatsTabBarComponent
                  activeTab={statsTab}
                  onChange={setStatsTab}
                />
              )}
            </div>
            {activeStats ? (
              renderStatsBadges(activeStats, statsTab === "all")
            ) : (
              <div className={styles['stats-badges']}>
                {renderConversationMetadataBadges()}
                <BadgeComponent type="messages" count={0} />
              </div>
            )}
          </div>
        )}

        {!conversationStats && hasConversationMetadata && (
          <div className={styles['conversation-stats']}>
            <div className={styles['stats-header']}>
              <Layers size={12} style={{ marginRight: 4 }} /> {conversationLabel} Details
            </div>
            <div className={styles['stats-badges']}>
              {renderConversationMetadataBadges()}
            </div>
          </div>
        )}

        {workflows.length > 0 && (
          <div className={styles['section']} style={{ marginBottom: 12 }}>
            <div className={styles['section-header']}>
              <GitBranch size={12} style={{ marginRight: 4 }} /> Workflow
            </div>
            {workflows.map((workflow) => (
              <a
                key={workflow._id}
                href={`/workflows/${workflow._id}`}
                className={styles['workflow-link']}
              >
                <span className={styles['modality-icon']}>
                  <GitBranch size={12} />
                </span>
                <span className={styles['modality-name']}>
                  {workflow.workflowName || DEFAULT_WORKFLOW_TITLE}
                </span>
                <span className={styles['modality-status']}>
                  <ExternalLink size={10} />
                </span>
              </a>
            ))}
          </div>
        )}

        {readOnly && !hideProviderModel && (
          <div className={styles['section-title']}>
            <Cpu size={16} /> Model Settings
          </div>
        )}

        {readOnly && !hideProviderModel && (
          <div className={styles['form-group']}>
            <label>Provider</label>
            <div className={styles['read-only-value']}>
              <ProviderLogo provider={settings.provider} size={16} />
              {resolveProviderLabel(settings.provider) || "-"}
            </div>
          </div>
        )}

        {readOnly && !hideProviderModel && settings.provider && (
          <div className={styles['form-group']}>
            <label>Model</label>
            <div
              className={styles['read-only-value']}
              style={{
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                height: "auto",
                padding: "8px 10px",
                gap: 2,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ProviderLogo provider={settings.provider} size={14} />
                {selectedModelDef?.label || settings.model || "-"}
              </span>
              {selectedModelDef?.label &&
                selectedModelDef.label !== settings.model && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontWeight: 400,
                    }}
                  >
                    {settings.model}
                  </span>
                )}
            </div>
          </div>
        )}

        {isTTS &&
          ((): React.ReactNode => {
            const providerVoices =
              (settings.provider &&
                config?.textToSpeech?.voices?.[settings.provider]) ||
              [];
            const defaultVoice =
              (settings.provider &&
                config?.textToSpeech?.defaultVoices?.[settings.provider]) ||
              "";
            const currentVoice = settings.voice || defaultVoice;
            if (readOnly) {
              return currentVoice ? (
                <div className={styles['form-group']}>
                  <label>Voice</label>
                  <div className={styles['read-only-value']}>
                    <Mic size={14} /> {currentVoice}
                  </div>
                </div>
              ) : null;
            }
            const voiceOptions = providerVoices.map(
              (voice: string | VoiceOption) => {
                const id = typeof voice === "string" ? voice : voice.id || voice.name || "";
                const label = typeof voice === "string" ? voice : voice.name || voice.id || "";
                const gender = typeof voice === "string" ? undefined : voice.gender;
                return {
                  value: id,
                  label: `${label}${gender ? ` (${gender})` : ""}`,
                  icon: <Mic size={18} />,
                };
              },
            );
            return voiceOptions.length > 0 ? (
              <div className={styles['form-group']}>
                <label>Voice</label>
                <SelectComponent
                  value={currentVoice}
                  options={voiceOptions}
                  onChange={(value: string) => {
                    onChange({ voice: value });
                  }}
                  placeholder="Select Voice"
                  icon={<Mic size={18} />}
                />
              </div>
            ) : null;
          })()}

        {/* Models (non-live) that support thinking levels: Thinking Level dropdown — always visible */}
        {!selectedModelDef?.liveAPI &&
          selectedModelDef?.thinkingLevels &&
          !readOnly &&
          ((): React.ReactNode => {
            const canDisable =
              selectedModelDef.thinkingLevels!.includes("minimal");
            const options = [
              ...(canDisable ? [{ value: "none", label: "No Thinking" }] : []),
              ...selectedModelDef.thinkingLevels!.map((level) => ({
                value: level,
                label: level.charAt(0).toUpperCase() + level.slice(1),
              })),
            ];
            const currentValue =
              settings.thinkingEnabled === false && canDisable
                ? "none"
                : settings.thinkingLevel || "high";
            return (
              <div className={styles['form-group']}>
                <label>Thinking Level</label>
                <SelectComponent
                  value={currentValue}
                  options={options}
                  onChange={(value: string) => {
                    onChange({
                      thinkingLevel: value === "none" ? undefined : value,
                      thinkingEnabled: value !== "none",
                    });
                  }}
                  icon={<Brain size={18} />}
                />
              </div>
            );
          })()}

        {/* Live API model: Voice + Thinking Level dropdowns */}
        {selectedModelDef?.liveAPI &&
          !readOnly &&
          ((): React.ReactNode => {
            const googleVoices: VoiceOption[] =
              config?.textToSpeech?.voices?.google || [];
            const currentLiveVoice = settings.liveVoice || "Puck";
            const voiceOptions = googleVoices.map((voice) => ({
              value: voice.name,
              label: `${voice.name} (${voice.gender})`,
              icon: <AudioLines size={18} />,
            }));
            return voiceOptions.length > 0 ? (
              <div className={styles['form-group']}>
                <label>Voice</label>
                <SelectComponent
                  value={currentLiveVoice}
                  options={voiceOptions}
                  onChange={(value: string) => {
                    onChange({ liveVoice: value });
                  }}
                  placeholder="Select Voice"
                  icon={<AudioLines size={18} />}
                />
              </div>
            ) : null;
          })()}

        {selectedModelDef?.liveAPI &&
          !readOnly &&
          selectedModelDef?.thinkingLevels &&
          ((): React.ReactNode => {
            const canDisable =
              selectedModelDef.thinkingLevels!.includes("minimal");
            const options = [
              ...(canDisable ? [{ value: "none", label: "No Thinking" }] : []),
              ...selectedModelDef.thinkingLevels!.map((level) => ({
                value: level,
                label: level.charAt(0).toUpperCase() + level.slice(1),
              })),
            ];
            return (
              <div className={styles['form-group']}>
                <label>Thinking Level</label>
                <SelectComponent
                  value={
                    settings.liveThinkingLevel ||
                    (canDisable ? "none" : selectedModelDef.thinkingLevels![0])
                  }
                  options={options}
                  onChange={(value: string) => {
                    onChange({
                      liveThinkingLevel: value,
                      thinkingEnabled: value !== "none",
                    });
                  }}
                  icon={<Brain size={18} />}
                />
              </div>
            );
          })()}

        {!!(readOnly && selectedModelDef?.liveAPI && settings.liveVoice) && (
          <div className={styles['form-group']}>
            <label>Voice</label>
            <div className={styles['read-only-value']}>
              <AudioLines size={14} /> {settings.liveVoice}
            </div>
          </div>
        )}

        {/* LiveAPI models in readOnly mode */}
        {!!(
          readOnly &&
          selectedModelDef?.liveAPI &&
          selectedModelDef?.thinkingLevels
        ) &&
          (() => {
            const canDisable =
              selectedModelDef.thinkingLevels!.includes("minimal");
            const currentValue =
              settings.liveThinkingLevel ||
              (canDisable ? "none" : selectedModelDef.thinkingLevels![0]);
            return (
              <div className={styles['form-group']}>
                <label>Thinking Level</label>
                <div className={styles['read-only-value']}>
                  <Brain size={14} />{" "}
                  {currentValue === "none"
                    ? "No Thinking"
                    : currentValue.charAt(0).toUpperCase() +
                      currentValue.slice(1)}
                </div>
              </div>
            );
          })()}

        {/* Non-live models in readOnly mode */}
        {!!(
          readOnly &&
          !selectedModelDef?.liveAPI &&
          selectedModelDef?.thinkingLevels
        ) &&
          (() => {
            const canDisable =
              selectedModelDef.thinkingLevels!.includes("minimal");
            const currentValue =
              settings.thinkingEnabled === false && canDisable
                ? "none"
                : settings.thinkingLevel || "high";
            return (
              <div className={styles['form-group']}>
                <label>Thinking Level</label>
                <div className={styles['read-only-value']}>
                  <Brain size={14} />{" "}
                  {currentValue === "none"
                    ? "No Thinking"
                    : currentValue.charAt(0).toUpperCase() +
                      currentValue.slice(1)}
                </div>
              </div>
            );
          })()}

        {!!(
          readOnly &&
          !isTTS &&
          !selectedModelDef?.liveAPI &&
          settings.voice
        ) && (
          <div className={styles['form-group']}>
            <label>Voice</label>
            <div className={styles['read-only-value']}>
              <Mic size={14} /> {settings.voice}
            </div>
          </div>
        )}

        {/* -- Agent Settings (Toggles + Strategy + Native Tools) ------ */}
        {((agentToggles?.length ?? 0) > 0 || conversationType === "agent" || (selectedModelDef?.tools && selectedModelDef.tools.length > 0)) && (
          <div className={styles['section']}>
            <div className={styles['section-header']}>Agent Settings</div>
            {(() => {
              const isExistingAgentConversation = (conversationStats?.messageCount ?? 0) > 0;
              const isAgentSettingsLocked = readOnly || isExistingAgentConversation;
              return (
                <>

            {/* 1. Workspace */}
            {conversationType === "agent" && (
              <div
                className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
              >
                <span className={styles['modality-icon']}>
                  <FolderOpen size={12} />
                </span>
                <span className={styles['modality-name']}>Workspace</span>
                <ToggleSwitch
                  checked={settings.agents?.workspaceEnabled !== false}
                  onChange={(checked: boolean) => {
                    if (typeof window !== "undefined") {
                      localStorage.setItem(LS_WORKSPACE_TOGGLE_PREFERENCE, String(checked));
                    }
                    onChange({
                      agents: { ...settings.agents, workspaceEnabled: checked },
                    });
                  }}
                  disabled={isAgentSettingsLocked}
                />
              </div>
            )}

            {/* 2. Native Tools (Thinking first, then others) */}
            {selectedModelDef?.tools &&
              selectedModelDef.tools.length > 0 &&
              (() => {
                const TOOL_LABELS = {
                  google: { "Web Search": "Google Search" },
                  anthropic: selectedModelDef?.webFetch
                    ? { "Web Search": "Web Fetch" }
                    : {},
                };
                const providerToolLabels =
                  (settings.provider &&
                    (TOOL_LABELS as Record<string, Record<string, string>>)[
                      settings.provider
                    ]) ||
                  {};
                const getToolLabel = (tool: string) =>
                  (providerToolLabels as Record<string, string>)[tool] || tool;

                const getToolToggle = (tool: string) => {
                  switch (tool) {
                    case "Thinking": {
                      const isLmStudioProvider = settings.provider === "lm-studio";
                      const isLive = selectedModelDef?.liveAPI;
                      const canDisable =
                        !selectedModelDef?.thinkingLevels ||
                        selectedModelDef.thinkingLevels.includes("minimal");
                      const alwaysOn =
                        !canDisable && !!selectedModelDef?.thinkingLevels;
                      const modelName = (settings.model || "").toLowerCase();
                      const nameBasedThinking = (config?.thinkingPatterns || FALLBACK_THINKING_PATTERNS)
                        .some((pattern) => modelName.includes(pattern));
                      const lmStudioCanToggle =
                        isLmStudioProvider &&
                        (selectedModelDef?.thinking || nameBasedThinking);
                      const lmStudioLocked = isLmStudioProvider && !lmStudioCanToggle;
                      return {
                        checked: isLive
                          ? (settings.liveThinkingLevel || "none") !== "none"
                          : lmStudioLocked || alwaysOn
                            ? true
                            : isLmStudioProvider
                              ? settings.thinkingEnabled !== false
                              : settings.thinkingEnabled || false,
                        onChange: isLive
                          ? (value: boolean) => {
                              onChange({
                                liveThinkingLevel: value ? "low" : "none",
                              });
                            }
                          : lmStudioLocked || alwaysOn
                            ? () => {}
                            : (value: boolean) => {
                                onChange({ thinkingEnabled: value });
                              },
                        disabled: lmStudioLocked || alwaysOn,
                      };
                    }
                    case "Web Search":
                    case "Google Search":
                    case "Web Fetch":
                      return {
                        checked: settings.webSearchEnabled || false,
                        onChange: (value: boolean) => {
                          onChange({ webSearchEnabled: value });
                        },
                        disabled: settings.codeExecutionEnabled,
                      };
                    case "Code Execution":
                      return {
                        checked: settings.codeExecutionEnabled || false,
                        onChange: (value: boolean) => {
                          const updates: Partial<PrismSettings> = {
                            codeExecutionEnabled: value,
                          };
                          if (value) {
                            updates.webSearchEnabled = false;
                            updates.urlContextEnabled = false;
                          }
                          onChange(updates);
                        },
                        disabled: false,
                      };
                    case "URL Context":
                      return {
                        checked: settings.urlContextEnabled || false,
                        onChange: (value: boolean) => {
                          onChange({ urlContextEnabled: value });
                        },
                        disabled: settings.codeExecutionEnabled,
                      };
                    case "Tool Calling":
                      return {
                        checked:
                          lockedTools?.has("Tool Calling") ||
                          settings.functionCallingEnabled ||
                          false,
                        onChange: lockedTools?.has("Tool Calling")
                          ? () => {}
                          : (value: boolean) => {
                              onChange({ functionCallingEnabled: value });
                            },
                        disabled: !!lockedTools?.has("Tool Calling"),
                      };
                    case "Image Generation":
                      return {
                        checked: settings.forceImageGeneration || false,
                        onChange: (value: boolean) => {
                          onChange({ forceImageGeneration: value });
                        },
                        disabled: false,
                      };
                    default:
                      return null;
                  }
                };

                const filteredTools = selectedModelDef.tools
                  .filter((tool) => !(conversationType === "agent" && tool === "Tool Calling"))
                  .sort((firstTool, secondTool) => {
                    if (firstTool === "Thinking") return -1;
                    if (secondTool === "Thinking") return 1;
                    return 0;
                  });

                return (
                  <>
                    {filteredTools.map((tool) => {
                      const toggle = TOGGLEABLE_TOOLS.has(tool)
                        ? getToolToggle(tool)
                        : null;
                      const isThinking = tool === "Thinking";
                      return (
                        <div
                          key={tool}
                          className={`${styles['modality-layout-row']} ${toggle ? styles['tool-toggle-layout-row'] : ""}`}
                        >
                          {isThinking ? (
                            <>
                              <span className={styles['modality-icon']}>
                                <Brain size={12} />
                              </span>
                              <span className={styles['modality-name']}>Thinking</span>
                            </>
                          ) : (
                            <>
                              <ToolBadgeComponent
                                name={getToolLabel(tool)}
                                tooltip={tool}
                              />
                              <span style={{ flex: 1 }} />
                            </>
                          )}
                          {readOnly ? (
                            toggle ? (
                              <span
                                className={`${styles['modality-status']} ${toggle.checked ? styles['modality-active'] : ""}`}
                              >
                                {tool === "Image Generation"
                                  ? toggle.checked
                                    ? "Forced"
                                    : "Default"
                                  : toggle.checked
                                    ? "On"
                                    : "Off"}
                              </span>
                            ) : (
                              <span
                                className={`${styles['modality-status']} ${styles['modality-active']}`}
                              >
                                Supported
                              </span>
                            )
                          ) : toggle ? (
                            <ToggleSwitch
                              checked={toggle.checked}
                              onChange={toggle.onChange}
                              disabled={toggle.disabled}
                            />
                          ) : (
                            <span
                              className={`${styles['modality-status']} ${styles['modality-active']}`}
                            >
                              Supported
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}

            {/* 3–5. Auto Approve, Max Iterations, Sub-Agent Iterations */}
            {agentToggles?.filter((toggle) =>
              ["auto", "iterations", "subAgentIterations", "recursionDepth"].includes(toggle.key),
            ).map((toggle) => (
              <div
                key={toggle.key}
                className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
              >
                <span className={styles['modality-icon']}>{toggle.icon}</span>
                <span className={styles['modality-name']}>{toggle.label}</span>
                {toggle.type === "cycle" ? (
                  <CycleButton
                    value={toggle.value ?? 0}
                    isActive={toggle.isActive}
                    onClick={() => toggle.onChange?.(toggle.value ?? 0)}
                    title={toggle.title}
                    disabled={isAgentSettingsLocked}
                  />
                ) : (
                  <ToggleSwitch
                    checked={toggle.checked}
                    onChange={(value: boolean) => toggle.onChange?.(value)}
                    disabled={isAgentSettingsLocked}
                  />
                )}
              </div>
            ))}

            {/* 6–8. Thought Structure, Topology, Harness */}
            {conversationType === "agent" && (() => {
              const thoughtStructureOptions = buildThoughtStructureOptions();
              const topologyOptions = buildTopologyOptions();

              const selectedThoughtStructureValue =
                (settings.agents?.thoughtStructure as string) || "chain_of_thought";
              const selectedThoughtStructureTooltip =
                thoughtStructureOptions.find(
                  (option: { value: string; tooltip?: React.ReactNode }) => option.value === selectedThoughtStructureValue,
                )?.tooltip ?? null;

              const selectedTopologyValue =
                settings.agents?.topology || "hierarchical";
              const selectedTopologyTooltip =
                topologyOptions.find(
                  (option: { value: string; tooltip?: React.ReactNode }) => option.value === selectedTopologyValue,
                )?.tooltip ?? null;

              return (
                <>
                  {/* 6. Agent Thought Structure */}
                  <div
                    className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
                  >
                    <SelectComponent
                      value={selectedThoughtStructureValue}
                      options={thoughtStructureOptions}
                      onChange={(value: string) =>
                        onChange({
                          agents: {
                            ...settings.agents,
                            thoughtStructure: value,
                          },
                        })
                      }
                      label="Thought Structure"
                      labelIcon={<Layers size={12} />}
                      compact
                      disabled={isAgentSettingsLocked}
                      triggerTooltipContent={selectedThoughtStructureTooltip}
                      triggerTooltipRich
                    />
                  </div>

                  {/* 7. Sub-agent Topology */}
                  <div
                    className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
                  >
                    <SelectComponent
                      value={selectedTopologyValue}
                      options={topologyOptions}
                      onChange={(value: string) =>
                        onChange({
                          agents: { ...settings.agents, topology: value },
                        })
                      }
                      label="Sub-Agent Topology"
                      labelIcon={<Network size={12} />}
                      compact
                      disabled={isAgentSettingsLocked}
                      triggerTooltipContent={selectedTopologyTooltip}
                      triggerTooltipRich
                    />
                  </div>

                  {/* 8. Harness */}
                  <div
                    className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
                  >
                    <SelectComponent
                      value={settings.agents?.harness || "standard"}
                      options={[
                        { value: "standard", label: "Standard (ReAct)" },
                      ]}
                      onChange={(value: string) =>
                        onChange({
                          agents: { ...settings.agents, harness: value },
                        })
                      }
                      label="Agent Harness"
                      labelIcon={<Brain size={12} />}
                      compact
                      disabled={isAgentSettingsLocked}
                    />
                  </div>
                </>
              );
            })()}

            {/* 9. Agent Locale */}
            {conversationType === "agent" && (
              <div
                className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
              >
                <SelectComponent
                  value={settings.agents?.locale || "en"}
                  options={availableLocales}
                  onChange={(value: string) =>
                    onChange({
                      agents: { ...settings.agents, locale: value },
                    })
                  }
                  label="Agent Locale"
                  labelIcon={<Globe size={12} />}
                  compact
                  disabled={isAgentSettingsLocked}
                />
              </div>
            )}

            {/* 10–11. Critic Gate, Plan Mode */}
            {agentToggles?.filter((toggle) =>
              ["criticGate", "plan"].includes(toggle.key),
            ).map((toggle) => (
              <div
                key={toggle.key}
                className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
              >
                <span className={styles['modality-icon']}>{toggle.icon}</span>
                <span className={styles['modality-name']}>{toggle.label}</span>
                {toggle.type === "cycle" ? (
                  <CycleButton
                    value={toggle.value ?? 0}
                    isActive={toggle.isActive}
                    onClick={() => toggle.onChange?.(toggle.value ?? 0)}
                    title={toggle.title}
                    disabled={isAgentSettingsLocked}
                  />
                ) : (
                  <ToggleSwitch
                    checked={toggle.checked}
                    onChange={(value: boolean) => toggle.onChange?.(value)}
                    disabled={isAgentSettingsLocked}
                  />
                )}
              </div>
            ))}
                </>
              );
            })()}
          </div>
        )}

        {!isSpecialModel && !readOnly && !hideSystemPrompt && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              width: "100%",
            }}
          >
            <button
              className={`${styles['system-prompt-button']} ${settings.systemPrompt ? styles['system-prompt-is-active-state'] : ""}`}
              onClick={() => {
                setIsSystemPromptOpen((previousOpenState) => !previousOpenState);
                onSystemPromptClick?.();
              }}
            >
              <Edit3 size={16} />
              System Prompt
            </button>
            {isSystemPromptOpen && (
              <TextAreaComponent
                className={styles['system-prompt-text-area']}
                value={settings.systemPrompt || ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  onChange({ systemPrompt: e.target.value });
                }}
                placeholder="Enter system prompt instructions here..."
                minRows={4}
                maxRows={12}
              />
            )}
          </div>
        )}

        {!!(readOnly && !hideSystemPrompt && settings.systemPrompt) && (
          <div className={styles['form-group']}>
            <label>
              <Edit3 size={12} /> System Prompt
            </label>
            <div className={styles['read-only-system-prompt']}>
              {settings.systemPrompt}
            </div>
          </div>
        )}

        {/* Copy curl button */}
        <div className={styles['copy-curl-container-section']}>
          <button
            type="button"
            className={`${styles['copy-curl-action-button']} ${isCopied ? styles['copy-curl-button-copied-state'] : ""}`}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              const generatedCurlCommand = generateCurlCommand();
              copyToClipboard(generatedCurlCommand);
            }}
          >
            {isCopied ? (
              <>
                <Check size={14} />
                <span>cURL Copied!</span>
              </>
            ) : (
              <>
                <Terminal size={14} />
                <span>Copy cURL</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!readOnly && showSystemPromptModal && (
        <SystemPromptModal
          activePrompt={settings.systemPrompt}
          onApply={(text) => onChange({ systemPrompt: text })}
          onClose={() => onCloseSystemPromptModal?.()}
        />
      )}
    </>
  );
}
