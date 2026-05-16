"use client";

import { useMemo } from "react";
import { Bot, X, Brain } from "lucide-react";
import ToggleButtonComponent from "./ToggleButtonComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import styles from "./AgentCardComponent.module.css";

/**
 * AgentCardComponent — a card for a single agent instance in the benchmark sidebar.
 *
 * Uses ModelPickerPopoverComponent for model selection instead of a native <select>.
 *
 * Props:
 *   agent            — { instanceId, agentId, name, description, provider, modelName }
 *   isThinking       — boolean — whether thinking is enabled for this agent
 *   supportsThinking — boolean — whether the current backing model supports thinking
 *   config           — Prism config object (used by ModelPickerPopoverComponent)
 *   onRemove         — callback(instanceId)
 *   onChangeModel    — callback(instanceId, provider, modelName)
 *   onToggleThinking — callback(instanceId)
 */
export default function AgentCardComponent({
  // @ts-ignore
  // @ts-ignore
  agent: any,
  isThinking = false,
  supportsThinking = false,
  // @ts-ignore
  // @ts-ignore
  config: any,
  // @ts-ignore
  // @ts-ignore
  onRemove: any,
  // @ts-ignore
  // @ts-ignore
  onChangeModel: any,
  // @ts-ignore
  // @ts-ignore
  onToggleThinking: any,
}) {
  // Filter config to only FC-capable models for the picker
  const fcConfig = useMemo<any>(() => {
    // @ts-ignore
    if (!config) return null;
    // @ts-ignore
    const textModelsMap = config.textToText?.models || {};
    const filteredTextModels = {};

    for (const [provider, models] of Object.entries(textModelsMap)) {
      // @ts-ignore
      const fcModels = models.filter((m: any) =>
        m.tools?.includes("Tool Calling"),
      );
      // @ts-ignore
      if (fcModels.length > 0) filteredTextModels[provider] = fcModels;
    }

    // @ts-ignore
    const filteredProviderList = (config.providerList || []).filter(
      // @ts-ignore
      // @ts-ignore
      (p) => filteredTextModels[p],
    );

    return {
      // @ts-ignore
      ...config,
      providerList: filteredProviderList,
      textToText: {
        // @ts-ignore
        ...config.textToText,
        models: filteredTextModels,
      },
      // Suppress non-text sections in the picker
      textToImage: { models: {} },
      textToSpeech: { models: {}, voices: {}, defaultVoices: {} },
      audioToText: { models: {} },
    };
  // @ts-ignore
  }, [config]);

  // Build settings-like object for the trigger display
  const pickerSettings = useMemo<any>(() => ({
    // @ts-ignore
    provider: agent.provider || "",
    // @ts-ignore
    model: agent.modelName || "",
  // @ts-ignore
  // @ts-ignore
  }), [agent.provider, agent.modelName]);

  const handlePickerSelect = (provider: any, name: any) => {
    // @ts-ignore
    // @ts-ignore
    onChangeModel?.(agent.instanceId, provider, name);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <Bot size={14} className={styles.botIcon} />
        {/* @ts-ignore */}
        <span className={styles.name} title={`Agent: ${agent.name}`}>
          {/* @ts-ignore */}
          Agent: {agent.name}
        </span>
        <span className={styles.badge}>Agent</span>
        <button
          className={styles.removeBtn}
          onClick={(e) => {
            e.stopPropagation();
            // @ts-ignore
            // @ts-ignore
            onRemove?.(agent.instanceId);
          }}
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>

      {/* Model selector — uses ModelPickerPopoverComponent trigger */}
      {/* @ts-ignore */}
      <ModelPickerPopoverComponent
        config={fcConfig}
        settings={pickerSettings}
        onSelectModel={handlePickerSelect}
      />

      <div className={styles.footer}>
        <span className={styles.description}>
          {/* @ts-ignore */}
          {agent.description}
        </span>
        <div className={styles.toggles}>
          {supportsThinking && (
            <ToggleButtonComponent
              icon={<Brain size={10} />}
              label="Think"
              active={isThinking}
              title={isThinking ? "Disable thinking" : "Enable thinking"}
              onClick={(e: any) => {
                e.stopPropagation();
                // @ts-ignore
                // @ts-ignore
                onToggleThinking?.(agent.instanceId);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
