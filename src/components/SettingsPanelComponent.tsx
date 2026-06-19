"use client";

import { DEFAULT_WORKFLOW_TITLE, FALLBACK_THINKING_PATTERNS } from "@/constants";
import { useState } from "react";
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
} from "lucide-react";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import {
  SelectComponent,
  ToggleComponent as ToggleSwitch,
  TextAreaComponent,
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
import { buildTopologyOptions, buildReasoningStrategyOptions } from "./AgentStrategyOptionsComponent";
import useTokenRate from "../hooks/useTokenRate";
import useTtft from "../hooks/useTtft";
import type {
  PrismConfig,
  PrismSettings,
  ModelOption,
  Workflow,
  VoiceOption,
} from "../types/types";

export interface SessionStats {
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
  orchestrator?: SessionStats;
  subAgents?: SessionStats;
  modalities?: Record<string, boolean>;
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
  sessionStats?: SessionStats | null;
  lockedTools?: Set<string>;
  sessionType?: string;
  canSpawnSubAgents?: boolean;
  agentToggles?: AgentToggleOption[];
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
  sequential: "Sequential (CoT)",
  hierarchical: "Hierarchical (ToT)",
  hierarchical_aggregation: "Aggregation (GoT)",
  peer_to_peer: "Mesh (GoT DAG)",
  p2p: "Mesh (GoT DAG)",
};

export function formatTopologyLabel(topology: string): string {
  return TOPOLOGY_LABELS[topology] || topology
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const REASONING_STRATEGY_LABELS: Record<string, string> = {
  chain_of_thought: "CoT",
  tree_of_thoughts: "ToT",
  graph_of_thoughts: "GoT",
};

export function formatReasoningStrategyLabel(strategy: string): string {
  return REASONING_STRATEGY_LABELS[strategy] || strategy
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
  sessionStats = null,
  lockedTools,
  sessionType = "conversation",
  canSpawnSubAgents = false,
  agentToggles,
}: SettingsPanelProps) {
  const sessionLabel = sessionType === "agent" ? "Session" : "Conversation";
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(
    () => !!settings.systemPrompt,
  );

  const textModelsMap = config?.textToText?.models || {};
  const audioToTextModelsMap = config?.audioToText?.models || {};
  const ttsModelsMap = config?.textToSpeech?.models || {};
  const imageModelsMap = config?.textToImage?.models || {};

  // Build a merged models map: textToText + textToImage + audioToText + textToSpeech
  const allProviderKeys = new Set([
    ...Object.keys(textModelsMap),
    ...Object.keys(imageModelsMap),
    ...Object.keys(audioToTextModelsMap),
    ...Object.keys(ttsModelsMap),
  ]);
  const modelsMap: Record<string, ExtendedModelOption[]> = {};
  for (const providerKey of allProviderKeys) {
    const textModels = (textModelsMap[providerKey] || []) as ExtendedModelOption[];
    const imgModels = ((imageModelsMap[providerKey] || []) as ExtendedModelOption[]).map(
      (modelOption) => ({
        ...modelOption,
        label: `${modelOption.label} (Image)`,
        _isImageGen: true,
      }),
    );
    const sttModels = (
      (audioToTextModelsMap[providerKey] || []) as ExtendedModelOption[]
    ).map((modelOption) => ({
      ...modelOption,
      label: `${modelOption.label} (Transcribe)`,
      _isTranscription: true,
    }));
    const ttsModels = ((ttsModelsMap[providerKey] || []) as ExtendedModelOption[]).map(
      (modelOption) => ({
        ...modelOption,
        label: `${modelOption.label} (TTS)`,
        _isTTS: true,
      }),
    );
    // Merge text models first, then image, then transcription, then TTS — deduplicated by name
    const seen = new Set<string>();
    const merged: ExtendedModelOption[] = [];
    for (const modelOption of [...textModels, ...imgModels, ...sttModels, ...ttsModels]) {
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
    liveTokensPerSec,
    computedTokPerSec,
    hasActiveSubAgents,
  } = useTokenRate(sessionStats);

  // -- Live TTFT (Time To First Token) ---------------------------
  const { liveTtft, isLiveTtft } = useTtft(sessionStats, perfNow, needsTicker);

  // -- Stats tab (All / Orchestrator / Sub-Agents) --------------
  const [statsTab, setStatsTab] = useState("all");

  const showStatsTabBar =
    canSpawnSubAgents && !!(sessionStats?.orchestrator || sessionStats?.subAgents);

  // Resolve which stats object to render based on active tab
  const activeStats = sessionStats
    ? statsTab === "orchestrator"
      ? sessionStats.orchestrator
      : statsTab === "subAgents"
        ? sessionStats.subAgents
        : sessionStats
    : null;

  // Compute displayed elapsed for the active tab
  const activeElapsedTime =
    statsTab === "all"
      ? totalElapsedTime
      : activeStats?.completedElapsedTime || 0;

  const renderStatsBadges = (stats: SessionStats, showFull: boolean) => {
    const timeToFirstTokenValue =
      stats.avgTimeToGeneration ?? sessionStats?.lastTimeToGeneration;

    const estimatedLiveCost = stats.totalCost;

    return (
      <div className={styles['stats-badges']}>
        <BadgeComponent
          type="messages"
          count={stats.messageCount}
          deletedCount={stats.deletedCount}
        />
        <BadgeComponent type="requests" count={stats.requestCount} />
        {sessionType === "agent" && settings.agents?.harness && (
          <span className={styles['stat-badge']}>
            <Brain size={10} />
            {formatHarnessLabel(settings.agents.harness)}
          </span>
        )}
        {sessionType === "agent" && settings.agents?.topology && (
          <span className={styles['stat-badge']}>
            <Network size={10} />
            {formatTopologyLabel(settings.agents.topology)}
          </span>
        )}
        {(() => {
          const activeStrategy = settings.agents?.reasoningStrategy as string | undefined;
          return sessionType === "agent" && activeStrategy && activeStrategy !== "chain_of_thought" ? (
            <span className={styles['stat-badge']}>
              <Brain size={10} />
              {formatReasoningStrategyLabel(activeStrategy)}
            </span>
          ) : null;
        })()}
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
          liveTokensPerSecond={liveTokensPerSec}
          averageTokensPerSecond={stats.avgTokensPerSec}
          isActivelyGenerating={computedTokPerSec !== null || hasActiveSubAgents}
          turnActive={turnActive}
        />
        {/* TTFT badge — live during processing, latched after first token, static after completion */}
        {liveTtft !== null ? (
          <span
            className={`${styles['stat-badge']} ${isLiveTtft ? styles['ttft-badge-live'] : styles['ttft-badge']}`}
          >
            ⏱ {liveTtft.toFixed(isLiveTtft ? 1 : 2)}s TTFT
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
              !sessionStats?.subAgents ||
              !sessionStats?.orchestrator
            ) {
              return stats.usedTools || [];
            }

            // Merge tools from orchestrator and sub-agents
            const toolMap = new Map<string, number>();

            // Add orchestrator tools
            if (sessionStats.orchestrator?.usedTools) {
              for (const tool of sessionStats.orchestrator.usedTools) {
                toolMap.set(
                  tool.name,
                  (toolMap.get(tool.name) || 0) + (tool.count || 1),
                );
              }
            }

            // Add sub-agent tools
            if (sessionStats.subAgents?.usedTools) {
              for (const tool of sessionStats.subAgents.usedTools) {
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
        {sessionStats && (
          <div className={styles['session-stats']}>
            <div className={styles['stats-header']}>
              <Layers size={12} style={{ marginRight: 4 }} /> {sessionLabel}
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
                <BadgeComponent type="messages" count={0} />
              </div>
            )}
          </div>
        )}

        {workflows.length > 0 && (
          <div className={styles['section']} style={{ marginBottom: 12 }}>
            <div className={styles['section-header']}>
              <GitBranch size={12} style={{ marginRight: 4 }} /> Workflow
            </div>
            {workflows.map((wf) => (
              <a
                key={wf._id}
                href={`/workflows/${wf._id}`}
                className={styles['workflow-link']}
              >
                <span className={styles['modality-icon']}>
                  <GitBranch size={12} />
                </span>
                <span className={styles['modality-name']}>
                  {wf.workflowName || DEFAULT_WORKFLOW_TITLE}
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
              <span>{selectedModelDef?.label || settings.model || "-"}</span>
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

        {/* -- Agent Toggles (Plan, Auto, Iterations) ---------------- */}
        {(agentToggles?.length ?? 0) > 0 && (
          <div className={styles['section']}>
            <div className={styles['section-header']}>Agent</div>
            {agentToggles?.map((toggle) => (
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
                  />
                ) : (
                  <ToggleSwitch
                    checked={toggle.checked}
                    onChange={(value: boolean) => toggle.onChange?.(value)}
                    size="mini"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* -- Strategy Overrides (Harness / Topology / Reasoning) ----- */}
        {sessionType === "agent" && (() => {
          const isExistingSession = (sessionStats?.messageCount ?? 0) > 0;
          const isStrategyLocked = readOnly || isExistingSession;
          return (
          <div className={styles['section']}>
            <div className={styles['section-header']}>Strategy</div>

            {/* Harness */}
            <div
              className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
            >
              <span className={styles['modality-icon']}>
                <Brain size={12} />
              </span>
              <span className={styles['modality-name']}>Harness</span>
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
                compact
                disabled={isStrategyLocked}
              />
            </div>

            {/* Reasoning Strategy */}
            <div
              className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
            >
              <span className={styles['modality-icon']}>
                <Layers size={12} />
              </span>
              <span className={styles['modality-name']}>Reasoning</span>
              <SelectComponent
                value={
                  (settings.agents?.reasoningStrategy as string) ||
                  "chain_of_thought"
                }
                options={buildReasoningStrategyOptions()}
                onChange={(value: string) =>
                  onChange({
                    agents: {
                      ...settings.agents,
                      reasoningStrategy: value,
                    },
                  })
                }
                compact
                disabled={isStrategyLocked}
              />
            </div>

            {/* Topology */}
            <div
              className={`${styles['modality-layout-row']} ${styles['tool-toggle-layout-row']}`}
            >
              <span className={styles['modality-icon']}>
                <Network size={12} />
              </span>
              <span className={styles['modality-name']}>Topology</span>
              <SelectComponent
                value={settings.agents?.topology || "hierarchical"}
                options={buildTopologyOptions()}
                onChange={(value: string) =>
                  onChange({
                    agents: { ...settings.agents, topology: value },
                  })
                }
                compact
                disabled={isStrategyLocked}
              />
            </div>
          </div>
          );
        })()}

        {/* -- Tools ------------------------------------------------- */}
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
                  const isLmStudio = settings.provider === "lm-studio";
                  const isLive = selectedModelDef?.liveAPI;
                  const canDisable =
                    !selectedModelDef?.thinkingLevels ||
                    selectedModelDef.thinkingLevels.includes("minimal");
                  const alwaysOn =
                    !canDisable && !!selectedModelDef?.thinkingLevels;
                  const modelName = (settings.model || "").toLowerCase();
                  const nameBasedThinking = (config?.thinkingPatterns || FALLBACK_THINKING_PATTERNS)
                    .some((pattern) => modelName.includes(pattern));
                  const lmCanToggle =
                    isLmStudio &&
                    (selectedModelDef?.thinking || nameBasedThinking);
                  const lmLocked = isLmStudio && !lmCanToggle;
                  return {
                    checked: isLive
                      ? (settings.liveThinkingLevel || "none") !== "none"
                      : lmLocked || alwaysOn
                        ? true
                        : isLmStudio
                          ? settings.thinkingEnabled !== false
                          : settings.thinkingEnabled || false,
                    onChange: isLive
                      ? (value: boolean) => {
                          onChange({
                            liveThinkingLevel: value ? "low" : "none",
                          });
                        }
                      : lmLocked || alwaysOn
                        ? () => {}
                        : (value: boolean) => {
                            onChange({ thinkingEnabled: value });
                          },
                    disabled: lmLocked || alwaysOn,
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

            return (
              <div className={styles['section']}>
                <div className={styles['section-header']}>Native Tools</div>
                {selectedModelDef.tools.map((tool) => {
                  const toggle = TOGGLEABLE_TOOLS.has(tool)
                    ? getToolToggle(tool)
                    : null;
                  return (
                    <div
                      key={tool}
                      className={`${styles['modality-layout-row']} ${toggle ? styles['tool-toggle-layout-row'] : ""}`}
                    >
                      <ToolBadgeComponent
                        name={getToolLabel(tool)}
                        tooltip={tool}
                      />
                      <span style={{ flex: 1 }} />
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
                          size="mini"
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
              </div>
            );
          })()}

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
