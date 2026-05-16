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
import { SelectComponent, ToggleComponent as ToggleSwitch } from "@rodrigo-barraza/components-library";
import CycleButton from "./CycleButtonComponent";
import ModalityIconComponent from "./ModalityIconComponent";
import SystemPromptModal from "./SystemPromptModalComponent";
import ModelBadgeComponent from "./ModelBadgeComponent";
import styles from "./SettingsPanelComponent.module.css";
import CostBadgeComponent from "./CostBadgeComponent";
import TokenCountBadgeComponent from "./TokenCountBadgeComponent";
import RequestCountBadgeComponent from "./RequestCountBadgeComponent";
import MessageCountBadgeComponent from "./MessageCountBadgeComponent";
import StopwatchBadgeComponent from "./StopwatchBadgeComponent";
import StatsTabBarComponent from "./StatsTabBarComponent";
import { formatCost, CAPABILITY_TOOL_NAMES } from "../utils/utilities";
import { TOGGLEABLE_TOOLS } from "./WorkflowNodeConstantsComponent";
import ToolBadgeComponent from "./ToolBadgeComponent";
import ToolCallBadgeComponent from "./ToolCallBadgeComponent";
import ThroughputBadgeComponent from "./ThroughputBadgeComponent";
import useTokenRate from "../hooks/useTokenRate";
import useTtft from "../hooks/useTtft";



export default function SettingsPanel({
  // @ts-ignore
  // @ts-ignore
  config: any,
  // @ts-ignore
  // @ts-ignore
  settings: any,
  // @ts-ignore
  // @ts-ignore
  onChange: any,
  // @ts-ignore
  // @ts-ignore
  _hasAssistantImages: any,
  // @ts-ignore
  // @ts-ignore
  _inferenceMode: any,
  readOnly = false,
  hideProviderModel = false,
  hideSystemPrompt = false,
  // @ts-ignore
  // @ts-ignore
  onSystemPromptClick: any,
  showSystemPromptModal = false,
  // @ts-ignore
  // @ts-ignore
  onCloseSystemPromptModal: any,
  workflows = [],
  sessionStats = null,
  // @ts-ignore
  // @ts-ignore
  lockedTools: any,
  sessionType = "conversation",
  canSpawnWorkers = false,
  // @ts-ignore
  // @ts-ignore
  agentToggles: any,
}) {
  const sessionLabel = sessionType === "agent" ? "Session" : "Conversation";

  // @ts-ignore
  const { _providers = {}, textToText = {} } = config || {};
  const textModelsMap = textToText.models || {};
  // @ts-ignore
  const audioToTextModelsMap = config?.audioToText?.models || {};
  // @ts-ignore
  const ttsModelsMap = config?.textToSpeech?.models || {};
  // @ts-ignore
  const imageModelsMap = config?.textToImage?.models || {};

  // Build a merged models map: textToText + textToImage + audioToText + textToSpeech
  const allProviderKeys = new Set([
    ...Object.keys(textModelsMap),
    ...Object.keys(imageModelsMap),
    ...Object.keys(audioToTextModelsMap),
    ...Object.keys(ttsModelsMap),
  ]);
  const modelsMap = {};
  for (const p of allProviderKeys) {
    const textModels = textModelsMap[p] || [];
    const imgModels = (imageModelsMap[p] || []).map((m: any) => ({
      ...m,
      label: `${m.label} (Image)`,
      _isImageGen: true,
    }));
    const sttModels = (audioToTextModelsMap[p] || []).map((m: any) => ({
      ...m,
      label: `${m.label} (Transcribe)`,
      _isTranscription: true,
    }));
    const ttsModels = (ttsModelsMap[p] || []).map((m: any) => ({
      ...m,
      label: `${m.label} (TTS)`,
      _isTTS: true,
    }));
    // Merge text models first, then image, then transcription, then TTS — deduplicated by name
    const seen = new Set();
    const merged = [];
    for (const m of [...textModels, ...imgModels, ...sttModels, ...ttsModels]) {
      if (!seen.has(m.name)) {
        seen.add(m.name);
        merged.push(m);
      }
    }
    // @ts-ignore
    modelsMap[p] = merged;
  }

  const _handleSystemPromptChange = (e: any) =>
    // @ts-ignore
    onChange({ systemPrompt: e.target.value });

  // @ts-ignore
  // @ts-ignore
  const currentProviderModels = modelsMap[settings.provider] || [];
  const selectedModelDef = currentProviderModels.find(
    // @ts-ignore
    (m: any) => m.name === settings.model,
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
  const [statsTab, setStatsTab] = useState<any>("all");


  const showStatsTabBar =
    // @ts-ignore
    // @ts-ignore
    canSpawnWorkers && !!(sessionStats?.orchestrator || sessionStats?.workers);

  // Resolve which stats object to render based on active tab
  const activeStats = sessionStats
    ? statsTab === "orchestrator"
      // @ts-ignore
      ? sessionStats.orchestrator
      : statsTab === "workers"
        // @ts-ignore
        ? sessionStats.workers
        : sessionStats
    : null;

  // Compute displayed elapsed for the active tab
  const activeElapsedTime =
    statsTab === "all"
      ? totalElapsedTime
      : activeStats?.completedElapsedTime || 0;

  const renderStatsBadges = (stats: any, showFull: any) => (
    <div className={styles.statsBadges}>
      <MessageCountBadgeComponent
        count={stats.messageCount}
        deletedCount={stats.deletedCount}
      />
      <RequestCountBadgeComponent count={stats.requestCount} />
      {stats.uniqueModels?.length > 0 && (
        // @ts-ignore
        <ModelBadgeComponent
          models={stats.uniqueModels}
          providers={stats.uniqueProviders}
        />
      )}
      {stats.totalTokens?.total > 0 && (
        <>
          <TokenCountBadgeComponent
            value={stats.totalTokens.input}
            label="tokens in"
          />
          <TokenCountBadgeComponent
            value={stats.totalTokens.output}
            label="tokens out"
          />
          <TokenCountBadgeComponent
            value={stats.totalTokens.total}
            label="tokens total"
          />
          {stats.totalTokens.cacheRead > 0 && (
            <TokenCountBadgeComponent
              value={stats.totalTokens.cacheRead}
              label="cached read"
            />
          )}
          {stats.totalTokens.cacheWrite > 0 && (
            <TokenCountBadgeComponent
              value={stats.totalTokens.cacheWrite}
              label="cached write"
            />
          )}
          {stats.totalTokens.reasoning > 0 && (
            <TokenCountBadgeComponent
              value={stats.totalTokens.reasoning}
              label="reasoning"
            />
          )}
        </>
      )}
      <ThroughputBadgeComponent
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
        // @ts-ignore
        (stats.avgTimeToGeneration ?? sessionStats?.lastTimeToGeneration) !=
          null && (
          <span className={`${styles.statBadge} ${styles.ttftBadge}`}>
            ⏱{" "}
            {(
              // @ts-ignore
              stats.avgTimeToGeneration ?? sessionStats?.lastTimeToGeneration
            ).toFixed(2)}
            s TTFT
          </span>
        )
      )}
      <CostBadgeComponent cost={stats.totalCost} />
      {stats.originalTotalCost > 0 &&
        stats.originalTotalCost !== stats.totalCost && (
          <span className={`${styles.statBadge} ${styles.statBadgeSub}`}>
            ({formatCost(stats.originalTotalCost)} total)
          </span>
        )}
      {showFull && activeElapsedTime > 0 && (
        // @ts-ignore
        <StopwatchBadgeComponent
          seconds={activeElapsedTime}
          live={!!stats.currentTurnStart}
        />
      )}
      {!showFull && stats.completedElapsedTime > 0 && (
        // @ts-ignore
        <StopwatchBadgeComponent
          seconds={stats.completedElapsedTime}
          live={false}
        />
      )}
      {(() => {
        // When viewing "all" stats and there are workers, aggregate tools from orchestrator and workers
        const displayTools = (() => {
          if (
            statsTab !== "all" ||
            // @ts-ignore
            !sessionStats?.workers ||
            // @ts-ignore
            !sessionStats?.orchestrator
          ) {
            return stats.usedTools || [];
          }

          // Merge tools from orchestrator and workers
          const toolMap = new Map();

          // Add orchestrator tools
          // @ts-ignore
          if (sessionStats.orchestrator?.usedTools) {
            // @ts-ignore
            for (const tool of sessionStats.orchestrator.usedTools) {
              toolMap.set(
                tool.name,
                (toolMap.get(tool.name) || 0) + (tool.count || 1),
              );
            }
          }

          // Add worker tools
          // @ts-ignore
          if (sessionStats.workers?.usedTools) {
            // @ts-ignore
            for (const tool of sessionStats.workers.usedTools) {
              toolMap.set(
                tool.name,
                (toolMap.get(tool.name) || 0) + (tool.count || 1),
              );
            }
          }

          // Convert back to array and sort by count
          return Array.from(toolMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        })();

        if (!displayTools?.length) return null;

        const capabilities = displayTools.filter((t: any) =>
          CAPABILITY_TOOL_NAMES.has(t.name),
        );
        const toolCalls = displayTools.filter(
          (t: any) => !CAPABILITY_TOOL_NAMES.has(t.name),
        );
        return (
          <>
            {capabilities.map((tool: any) => (
              // @ts-ignore
              <ToolBadgeComponent
                key={tool.name}
                name={tool.name}
                count={tool.count}
              />
            ))}
            {toolCalls.map((tool: any) => (
              // @ts-ignore
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
        // @ts-ignore
        <ModalityIconComponent modalities={stats.modalities} />
      )}
    </div>
  );

  return (
    <>
      <div className={styles.container}>
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
              <MessageCountBadgeComponent count={0} />
            </div>
          )}
        </div>



        {workflows.length > 0 && (
          <div className={styles.section} style={{ marginBottom: 12 }}>
            <div className={styles.sectionHeader}>
              <GitBranch size={12} style={{ marginRight: 4 }} /> Workflow
            </div>
            {workflows.map((wf) => (
              <a
                // @ts-ignore
                key={wf._id}
                // @ts-ignore
                href={`/workflows/${wf._id}`}
                className={styles.workflowLink}
              >
                <span className={styles.modalityIcon}>
                  <GitBranch size={12} />
                </span>
                <span className={styles.modalityName}>
                  {/* @ts-ignore */}
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
              {/* @ts-ignore */}
              <ProviderLogo provider={settings.provider} size={16} />
              {/* @ts-ignore */}
              {resolveProviderLabel(settings.provider) || "-"}
            </div>
          </div>
        )}

        {/* @ts-ignore */}
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
              {/* @ts-ignore */}
              <span>{selectedModelDef?.label || settings.model || "-"}</span>
              {selectedModelDef?.label &&
                // @ts-ignore
                selectedModelDef.label !== settings.model && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontWeight: 400,
                    }}
                  >
                    {/* @ts-ignore */}
                    {settings.model}
                  </span>
                )}
            </div>
          </div>
        )}

        {isTTS &&
          (() => {
            const providerVoices =
              // @ts-ignore
              // @ts-ignore
              config?.textToSpeech?.voices?.[settings.provider] || [];
            const defaultVoice =
              // @ts-ignore
              // @ts-ignore
              config?.textToSpeech?.defaultVoices?.[settings.provider] || "";
            // @ts-ignore
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
            const voiceOptions = providerVoices.map((v: any) => ({
              value: v.name || v.voice_id || v,
              label: `${v.label || v.name || v}${v.gender ? ` (${v.gender})` : ""}`,
              icon: <Mic size={18} />,
            }));
            return voiceOptions.length > 0 ? (
              <div className={styles.formGroup}>
                <label>Voice</label>
                <SelectComponent
                  value={currentVoice}
                  options={voiceOptions}
                  // @ts-ignore
                  onChange={(val: any) => onChange({ voice: val })}
                  placeholder="Select Voice"
                  icon={<Mic size={18} />}
                />
              </div>
            ) : null;
          })()}

        {/* Google models (non-live): Thinking Level dropdown — always visible */}
        {!selectedModelDef?.liveAPI &&
          // @ts-ignore
          settings.provider === "google" &&
          selectedModelDef?.thinkingLevels &&
          !readOnly &&
          (() => {
            const canDisable =
              selectedModelDef.thinkingLevels.includes("minimal");
            const options = [
              ...(canDisable ? [{ value: "none", label: "No Thinking" }] : []),
              ...selectedModelDef.thinkingLevels.map((level: any) => ({
                value: level,
                label: level.charAt(0).toUpperCase() + level.slice(1),
              })),
            ];
            const currentValue =
              // @ts-ignore
              settings.thinkingEnabled === false && canDisable
                ? "none"
                // @ts-ignore
                : settings.thinkingLevel || "high";
            return (
              <div className={styles.formGroup}>
                <label>Thinking Level</label>
                <SelectComponent
                  value={currentValue}
                  options={options}
                  onChange={(val: any) =>
                    // @ts-ignore
                    onChange({
                      thinkingLevel: val === "none" ? undefined : val,
                      thinkingEnabled: val !== "none",
                    })
                  }
                  icon={<Brain size={18} />}
                />
              </div>
            );
          })()}

        {/* Live API model: Voice + Thinking Level dropdowns */}
        {selectedModelDef?.liveAPI &&
          !readOnly &&
          (() => {
            // @ts-ignore
            const googleVoices = config?.textToSpeech?.voices?.google || [];
            // @ts-ignore
            const currentLiveVoice = settings.liveVoice || "Puck";
            const voiceOptions = googleVoices.map((v: any) => ({
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
                  // @ts-ignore
                  onChange={(val: any) => onChange({ liveVoice: val })}
                  placeholder="Select Voice"
                  icon={<AudioLines size={18} />}
                />
              </div>
            ) : null;
          })()}

        {selectedModelDef?.liveAPI &&
          !readOnly &&
          selectedModelDef?.thinkingLevels &&
          (() => {
            const canDisable =
              selectedModelDef.thinkingLevels.includes("minimal");
            const options = [
              ...(canDisable ? [{ value: "none", label: "No Thinking" }] : []),
              ...selectedModelDef.thinkingLevels.map((level: any) => ({
                value: level,
                label: level.charAt(0).toUpperCase() + level.slice(1),
              })),
            ];
            return (
              <div className={styles.formGroup}>
                <label>Thinking Level</label>
                <SelectComponent
                  value={
                    // @ts-ignore
                    settings.liveThinkingLevel ||
                    (canDisable ? "none" : selectedModelDef.thinkingLevels[0])
                  }
                  options={options}
                  onChange={(val: any) =>
                    // @ts-ignore
                    onChange({
                      liveThinkingLevel: val,
                      thinkingEnabled: val !== "none",
                    })
                  }
                  icon={<Brain size={18} />}
                />
              </div>
            );
          })()}

        {/* readOnly: show live voice if saved */}
        {/* @ts-ignore */}
        {readOnly && selectedModelDef?.liveAPI && settings.liveVoice && (
          <div className={styles.formGroup}>
            <label>Voice</label>
            <div className={styles.readOnlyValue}>
              {/* @ts-ignore */}
              <AudioLines size={14} /> {settings.liveVoice}
            </div>
          </div>
        )}

        {readOnly &&
          selectedModelDef?.liveAPI &&
          // @ts-ignore
          settings.liveThinkingLevel && (
            <div className={styles.formGroup}>
              <label>Thinking Level</label>
              <div className={styles.readOnlyValue}>
                <Brain size={14} />{" "}
                {/* @ts-ignore */}
                {settings.liveThinkingLevel === "none"
                  ? "No Thinking"
                  // @ts-ignore
                  : settings.liveThinkingLevel}
              </div>
            </div>
          )}

        {/* readOnly: show voice if saved even without TTS model context */}
        {/* @ts-ignore */}
        {readOnly && !isTTS && !selectedModelDef?.liveAPI && settings.voice && (
          <div className={styles.formGroup}>
            <label>Voice</label>
            <div className={styles.readOnlyValue}>
              {/* @ts-ignore */}
              <Mic size={14} /> {settings.voice}
            </div>
          </div>
        )}

        {!isSpecialModel && !readOnly && !hideSystemPrompt && (
          <button
            // @ts-ignore
            className={`${styles.systemPromptBtn} ${settings.systemPrompt ? styles.systemPromptActive : ""}`}
            // @ts-ignore
            onClick={() => onSystemPromptClick?.()}
          >
            <Edit3 size={16} />
            System Prompt
          </button>
        )}

        {/* @ts-ignore */}
        {readOnly && !hideSystemPrompt && settings.systemPrompt && (
          <div className={styles.formGroup}>
            <label>
              <Edit3 size={12} /> System Prompt
            </label>
            <div className={styles.readOnlySystemPrompt}>
              {/* @ts-ignore */}
              {settings.systemPrompt}
            </div>
          </div>
        )}

        {/* -- Agent Toggles (Plan, Auto, Iterations) ---------------- */}
        {/* @ts-ignore */}
        {agentToggles?.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>Agent</div>
            {/* @ts-ignore */}
            {agentToggles.map((toggle: any) => (
              <div
                key={toggle.key}
                className={`${styles.modalityRow} ${styles.toolToggleRow}`}
              >
                <span className={styles.modalityIcon}>{toggle.icon}</span>
                <span className={styles.modalityName}>{toggle.label}</span>
                {toggle.type === "cycle" ? (
                  <CycleButton
                    value={toggle.value}
                    isActive={toggle.isActive}
                    onClick={toggle.onChange}
                    title={toggle.title}
                  />
                ) : (
                  <ToggleSwitch
                    checked={toggle.checked}
                    onChange={toggle.onChange}
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
            // @ts-ignore
            // @ts-ignore
            const providerToolLabels = TOOL_LABELS[settings.provider] || {};
            const getToolLabel = (tool: any) => providerToolLabels[tool] || tool;

            const getToolToggle = (tool: any) => {
              switch (tool) {
                case "Thinking": {
                  // @ts-ignore
                  const isLmStudio = settings.provider === "lm-studio";
                  const isLive = selectedModelDef?.liveAPI;
                  const canDisable =
                    !selectedModelDef?.thinkingLevels ||
                    selectedModelDef.thinkingLevels.includes("minimal");
                  const alwaysOn =
                    // @ts-ignore
                    !canDisable && settings.provider === "google";
                  // @ts-ignore
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
                      // @ts-ignore
                      ? (settings.liveThinkingLevel || "none") !== "none"
                      : lmLocked || alwaysOn
                        ? true
                        : isLmStudio
                          // @ts-ignore
                          ? settings.thinkingEnabled !== false
                          // @ts-ignore
                          : settings.thinkingEnabled || false,
                    onChange: isLive
                      ? (val: any) =>
                          // @ts-ignore
                          onChange({ liveThinkingLevel: val ? "low" : "none" })
                      : lmLocked || alwaysOn
                        ? () => {}
                        // @ts-ignore
                        : (val: any) => onChange({ thinkingEnabled: val }),
                    disabled: lmLocked || alwaysOn,
                  };
                }
                case "Web Search":
                case "Google Search":
                case "Web Fetch":
                  return {
                    // @ts-ignore
                    checked: settings.webSearchEnabled || false,
                    // @ts-ignore
                    onChange: (val: any) => onChange({ webSearchEnabled: val }),
                    // @ts-ignore
                    disabled: settings.codeExecutionEnabled,
                  };
                case "Code Execution":
                  return {
                    // @ts-ignore
                    checked: settings.codeExecutionEnabled || false,
                    onChange: (val: any) => {
                      const updates = { codeExecutionEnabled: val };
                      if (val) {
                        // @ts-ignore
                        updates.webSearchEnabled = false;
                        // @ts-ignore
                        updates.urlContextEnabled = false;
                      }
                      // @ts-ignore
                      onChange(updates);
                    },
                    disabled: false,
                  };
                case "URL Context":
                  return {
                    // @ts-ignore
                    checked: settings.urlContextEnabled || false,
                    // @ts-ignore
                    onChange: (val: any) => onChange({ urlContextEnabled: val }),
                    // @ts-ignore
                    disabled: settings.codeExecutionEnabled,
                  };
                case "Tool Calling":
                  return {
                    checked:
                      // @ts-ignore
                      lockedTools?.has("Tool Calling") ||
                      // @ts-ignore
                      settings.functionCallingEnabled ||
                      false,
                    // @ts-ignore
                    onChange: lockedTools?.has("Tool Calling")
                      ? () => {}
                      // @ts-ignore
                      : (val: any) => onChange({ functionCallingEnabled: val }),
                    // @ts-ignore
                    disabled: !!lockedTools?.has("Tool Calling"),
                  };
                case "Image Generation":
                  return {
                    // @ts-ignore
                    checked: settings.forceImageGeneration || false,
                    // @ts-ignore
                    onChange: (val: any) => onChange({ forceImageGeneration: val }),
                    disabled: false,
                  };
                default:
                  return null;
              }
            };

            return (
              <div className={styles.section}>
                <div className={styles.sectionHeader}>Native Tools</div>
                {selectedModelDef.tools.map((tool: any) => {
                  const toggle = TOGGLEABLE_TOOLS.has(tool)
                    ? getToolToggle(tool)
                    : null;
                  return (
                    <div
                      key={tool}
                      className={`${styles.modalityRow} ${toggle ? styles.toolToggleRow : ""}`}
                    >
                      {/* @ts-ignore */}
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
      </div>

      {!readOnly && showSystemPromptModal && (
        <SystemPromptModal
          // @ts-ignore
          activePrompt={settings.systemPrompt}
          // @ts-ignore
          onApply={(text: any) => onChange({ systemPrompt: text })}
          // @ts-ignore
          onClose={() => onCloseSystemPromptModal?.()}
        />
      )}
    </>
  );
}
