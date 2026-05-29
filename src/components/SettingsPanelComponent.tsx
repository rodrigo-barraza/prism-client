"use client";
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
  usedTools?: Array<{ name: string; count: number }>;
  orchestrator?: SessionStats;
  workers?: SessionStats;
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
  canSpawnWorkers?: boolean;
  agentToggles?: AgentToggleOption[];
}

interface ExtendedModelOption extends ModelOption {
  _isImageGen?: boolean;
  _isTranscription?: boolean;
  _isTTS?: boolean;
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
  canSpawnWorkers = false,
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
  for (const p of allProviderKeys) {
    const textModels = (textModelsMap[p] || []) as ExtendedModelOption[];
    const imgModels = ((imageModelsMap[p] || []) as ExtendedModelOption[]).map(
      (m) => ({
        ...m,
        label: `${m.label} (Image)`,
        _isImageGen: true,
      }),
    );
    const sttModels = (
      (audioToTextModelsMap[p] || []) as ExtendedModelOption[]
    ).map((m) => ({
      ...m,
      label: `${m.label} (Transcribe)`,
      _isTranscription: true,
    }));
    const ttsModels = ((ttsModelsMap[p] || []) as ExtendedModelOption[]).map(
      (m) => ({
        ...m,
        label: `${m.label} (TTS)`,
        _isTTS: true,
      }),
    );
    // Merge text models first, then image, then transcription, then TTS — deduplicated by name
    const seen = new Set<string>();
    const merged: ExtendedModelOption[] = [];
    for (const m of [...textModels, ...imgModels, ...sttModels, ...ttsModels]) {
      if (!seen.has(m.name)) {
        seen.add(m.name);
        merged.push(m);
      }
    }
    modelsMap[p] = merged;
  }

  const _handleSystemPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => onChange({ systemPrompt: e.target.value });

  const currentProviderModels = modelsMap[settings.provider || ""] || [];
  const selectedModelDef = currentProviderModels.find(
    (m) => m.name === settings.model,
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
    hasActiveWorkers,
  } = useTokenRate(sessionStats);

  // -- Live TTFT (Time To First Token) ---------------------------
  const { liveTtft, isLiveTtft } = useTtft(sessionStats, perfNow, needsTicker);

  // -- Stats tab (All / Orchestrator / Workers) --------------
  const [statsTab, setStatsTab] = useState("all");

  const showStatsTabBar =
    canSpawnWorkers && !!(sessionStats?.orchestrator || sessionStats?.workers);

  // Resolve which stats object to render based on active tab
  const activeStats = sessionStats
    ? statsTab === "orchestrator"
      ? sessionStats.orchestrator
      : statsTab === "workers"
        ? sessionStats.workers
        : sessionStats
    : null;

  // Compute displayed elapsed for the active tab
  const activeElapsedTime =
    statsTab === "all"
      ? totalElapsedTime
      : activeStats?.completedElapsedTime || 0;

  const renderStatsBadges = (stats: SessionStats, showFull: boolean) => {
    const ttftVal =
      stats.avgTimeToGeneration ?? sessionStats?.lastTimeToGeneration;
    return (
      <div className={styles.statsBadges}>
        <BadgeComponent
          type="messages"
          count={stats.messageCount}
          deletedCount={stats.deletedCount}
        />
        <BadgeComponent type="requests" count={stats.requestCount} />
        {stats.uniqueModels && stats.uniqueModels.length > 0 && (
          <BadgeComponent
            type="model"
            models={stats.uniqueModels}
            providers={stats.uniqueProviders}
          />
        )}
        {stats.totalTokens && stats.totalTokens.total > 0 && (
          <>
            <BadgeComponent
              type="tokens"
              value={stats.totalTokens.input}
              label="tokens in"
            />
            <BadgeComponent
              type="tokens"
              value={stats.totalTokens.output}
              label="tokens out"
            />
            <BadgeComponent
              type="tokens"
              value={stats.totalTokens.total}
              label="tokens total"
            />
            {stats.totalTokens.cacheRead !== undefined &&
              stats.totalTokens.cacheRead > 0 && (
                <BadgeComponent
                  type="tokens"
                  value={stats.totalTokens.cacheRead}
                  label="cached read"
                />
              )}
            {stats.totalTokens.cacheWrite !== undefined &&
              stats.totalTokens.cacheWrite > 0 && (
                <BadgeComponent
                  type="tokens"
                  value={stats.totalTokens.cacheWrite}
                  label="cached write"
                />
              )}
            {stats.totalTokens.reasoning !== undefined &&
              stats.totalTokens.reasoning > 0 && (
                <BadgeComponent
                  type="tokens"
                  value={stats.totalTokens.reasoning}
                  label="reasoning"
                />
              )}
          </>
        )}
        <BadgeComponent
          type="throughput"
          liveTokPerSec={liveTokensPerSec}
          avgTokPerSec={stats.avgTokensPerSec}
          isActivelyGenerating={computedTokPerSec !== null || hasActiveWorkers}
          turnActive={turnActive}
        />
        {/* TTFT badge — live during processing, latched after first token, static after completion */}
        {liveTtft !== null ? (
          <span
            className={`${styles.statBadge} ${isLiveTtft ? styles.ttftBadgeLive : styles.ttftBadge}`}
          >
            ⏱ {liveTtft.toFixed(isLiveTtft ? 1 : 2)}s TTFT
          </span>
        ) : (
          ttftVal != null && (
            <span className={`${styles.statBadge} ${styles.ttftBadge}`}>
              ⏱ {ttftVal.toFixed(2)}s TTFT
            </span>
          )
        )}
        <BadgeComponent type="cost" cost={stats.totalCost} />
        {stats.originalTotalCost > 0 &&
          stats.originalTotalCost !== stats.totalCost && (
            <span className={`${styles.statBadge} ${styles.statBadgeSub}`}>
              ({formatCost(stats.originalTotalCost)} total)
            </span>
          )}
        {showFull && activeElapsedTime > 0 && (
          <BadgeComponent
            type="stopwatch"
            seconds={activeElapsedTime}
            live={!!stats.currentTurnStart}
          />
        )}
        {!showFull &&
          stats.completedElapsedTime !== undefined &&
          stats.completedElapsedTime > 0 && (
            <BadgeComponent
              type="stopwatch"
              seconds={stats.completedElapsedTime}
              live={false}
            />
          )}
        {(() => {
          // When viewing "all" stats and there are workers, aggregate tools from orchestrator and workers
          const displayTools: Array<{ name: string; count: number }> = (() => {
            if (
              statsTab !== "all" ||
              !sessionStats?.workers ||
              !sessionStats?.orchestrator
            ) {
              return stats.usedTools || [];
            }

            // Merge tools from orchestrator and workers
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

            // Add worker tools
            if (sessionStats.workers?.usedTools) {
              for (const tool of sessionStats.workers.usedTools) {
                toolMap.set(
                  tool.name,
                  (toolMap.get(tool.name) || 0) + (tool.count || 1),
                );
              }
            }

            // Convert back to array and sort by count
            return Array.from(toolMap.entries())
              .map(([name, count]: [string, number]) => ({ name, count }))
              .sort((a, b) => b.count - a.count);
          })();

          if (!displayTools?.length) return null;

          const capabilities = displayTools.filter((t) =>
            CAPABILITY_TOOL_NAMES.has(t.name),
          );
          const toolCalls = displayTools.filter(
            (t) => !CAPABILITY_TOOL_NAMES.has(t.name),
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
      <div className={styles.container}>
        {sessionStats && (
          <div className={styles.sessionStats}>
            <div className={styles.statsHeader}>
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
              <div className={styles.statsBadges}>
                <BadgeComponent type="messages" count={0} />
              </div>
            )}
          </div>
        )}

        {workflows.length > 0 && (
          <div className={styles.section} style={{ marginBottom: 12 }}>
            <div className={styles.sectionHeader}>
              <GitBranch size={12} style={{ marginRight: 4 }} /> Workflow
            </div>
            {workflows.map((wf) => (
              <a
                key={wf._id}
                href={`/workflows/${wf._id}`}
                className={styles.workflowLink}
              >
                <span className={styles.modalityIcon}>
                  <GitBranch size={12} />
                </span>
                <span className={styles.modalityName}>
                  {wf.workflowName || "Untitled Workflow"}
                </span>
                <span className={styles.modalityStatus}>
                  <ExternalLink size={10} />
                </span>
              </a>
            ))}
          </div>
        )}

        {readOnly && !hideProviderModel && (
          <div className={styles.sectionTitle}>
            <Cpu size={16} /> Model Settings
          </div>
        )}

        {readOnly && !hideProviderModel && (
          <div className={styles.formGroup}>
            <label>Provider</label>
            <div className={styles.readOnlyValue}>
              <ProviderLogo provider={settings.provider} size={16} />
              {resolveProviderLabel(settings.provider) || "-"}
            </div>
          </div>
        )}

        {readOnly && !hideProviderModel && settings.provider && (
          <div className={styles.formGroup}>
            <label>Model</label>
            <div
              className={styles.readOnlyValue}
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
                <div className={styles.formGroup}>
                  <label>Voice</label>
                  <div className={styles.readOnlyValue}>
                    <Mic size={14} /> {currentVoice}
                  </div>
                </div>
              ) : null;
            }
            const voiceOptions = providerVoices.map(
              (v: string | VoiceOption) => {
                const id = typeof v === "string" ? v : v.id || v.name || "";
                const label = typeof v === "string" ? v : v.name || v.id || "";
                const gender = typeof v === "string" ? undefined : v.gender;
                return {
                  value: id,
                  label: `${label}${gender ? ` (${gender})` : ""}`,
                  icon: <Mic size={18} />,
                };
              },
            );
            return voiceOptions.length > 0 ? (
              <div className={styles.formGroup}>
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
              <div className={styles.formGroup}>
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
            const voiceOptions = googleVoices.map((v) => ({
              value: v.name,
              label: `${v.name} (${v.gender})`,
              icon: <AudioLines size={18} />,
            }));
            return voiceOptions.length > 0 ? (
              <div className={styles.formGroup}>
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
              <div className={styles.formGroup}>
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
          <div className={styles.formGroup}>
            <label>Voice</label>
            <div className={styles.readOnlyValue}>
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
              <div className={styles.formGroup}>
                <label>Thinking Level</label>
                <div className={styles.readOnlyValue}>
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
              <div className={styles.formGroup}>
                <label>Thinking Level</label>
                <div className={styles.readOnlyValue}>
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
          <div className={styles.formGroup}>
            <label>Voice</label>
            <div className={styles.readOnlyValue}>
              <Mic size={14} /> {settings.voice}
            </div>
          </div>
        )}

        {/* -- Agent Toggles (Plan, Auto, Iterations) ---------------- */}
        {(agentToggles?.length ?? 0) > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>Agent</div>
            {agentToggles?.map((toggle) => (
              <div
                key={toggle.key}
                className={`${styles.modalityRow} ${styles.toolToggleRow}`}
              >
                <span className={styles.modalityIcon}>{toggle.icon}</span>
                <span className={styles.modalityName}>{toggle.label}</span>
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
                    onChange={(val: boolean) => toggle.onChange?.(val)}
                    size="mini"
                  />
                )}
              </div>
            ))}
          </div>
        )}

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
                  const nameBasedThinking = [
                    "qwen3",
                    "deepseek-r1",
                    "deepseek-v3",
                    "gpt-oss",
                    "gemma-4",
                  ].some((p) => modelName.includes(p));
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
              <div className={styles.section}>
                <div className={styles.sectionHeader}>Native Tools</div>
                {selectedModelDef.tools.map((tool) => {
                  const toggle = TOGGLEABLE_TOOLS.has(tool)
                    ? getToolToggle(tool)
                    : null;
                  return (
                    <div
                      key={tool}
                      className={`${styles.modalityRow} ${toggle ? styles.toolToggleRow : ""}`}
                    >
                      <ToolBadgeComponent
                        name={getToolLabel(tool)}
                        tooltip={tool}
                      />
                      <span style={{ flex: 1 }} />
                      {readOnly ? (
                        toggle ? (
                          <span
                            className={`${styles.modalityStatus} ${toggle.checked ? styles.modalityActive : ""}`}
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
                            className={`${styles.modalityStatus} ${styles.modalityActive}`}
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
                          className={`${styles.modalityStatus} ${styles.modalityActive}`}
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
              className={`${styles.systemPromptButton} ${settings.systemPrompt ? styles.systemPromptActive : ""}`}
              onClick={() => {
                setIsSystemPromptOpen((prev) => !prev);
                onSystemPromptClick?.();
              }}
            >
              <Edit3 size={16} />
              System Prompt
            </button>
            {isSystemPromptOpen && (
              <TextAreaComponent
                className={styles.systemPromptTextArea}
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
          <div className={styles.formGroup}>
            <label>
              <Edit3 size={12} /> System Prompt
            </label>
            <div className={styles.readOnlySystemPrompt}>
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
