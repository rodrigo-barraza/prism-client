"use client";

import { useMemo } from "react";
import { Bot, X, Brain } from "lucide-react";
import ToggleButtonComponent from "./ToggleButtonComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import styles from "./AgentCardComponent.module.css";
import type { AgentInstance, PrismConfig, ModelsMap, ModelOption } from "../types/types";

interface AgentCardComponentProps {
  agent: AgentInstance;
  isThinking?: boolean;
  supportsThinking?: boolean;
  config: PrismConfig | null;
  onRemove?: (instanceId: string) => void;
  onChangeModel?: (instanceId: string, provider: string, modelName: string) => void;
  onToggleThinking?: (instanceId: string) => void;
}

export default function AgentCardComponent({
  agent,
  isThinking = false,
  supportsThinking = false,
  config,
  onRemove,
  onChangeModel,
  onToggleThinking,
}: AgentCardComponentProps) {
  const functionCallingConfig = useMemo(() => {
    if (!config) return null;
    const textModelsMap: ModelsMap = config.textToText?.models || {};
    const filteredTextModels: ModelsMap = {};

    for (const [provider, models] of Object.entries(textModelsMap)) {
      const functionCallingModels = models.filter((model: ModelOption) =>
        model.tools?.includes("Tool Calling"),
      );
      if (functionCallingModels.length > 0)
        filteredTextModels[provider] = functionCallingModels;
    }

    const filteredProviderList = (config.providerList || []).filter(
      (provider: string) => filteredTextModels[provider],
    );

    return {
      ...config,
      providerList: filteredProviderList,
      textToText: {
        ...config.textToText,
        models: filteredTextModels,
      },
      textToImage: { ...config.textToImage, models: {} },
      textToSpeech: { ...config.textToSpeech, models: {}, voices: {}, defaultVoices: {} },
      audioToText: { ...config.audioToText, models: {} },
      embedding: { ...config.embedding, models: {} },
    };
  }, [config]);

  const pickerSettings = useMemo(
    () => ({
      provider: agent.provider || "",
      model: agent.modelName || "",
    }),
    [agent.provider, agent.modelName],
  );

  const handlePickerSelect = (provider: string, name: string) => {
    onChangeModel?.(agent.instanceId, provider, name);
  };

  return (
    <div className={`agent-card-component ${styles['card']}`}>
      <div className={styles['header']}>
        <Bot size={14} className={styles['bot-icon']} />
        <span className={styles['name']} title={`Agent: ${agent.name}`}>
          Agent: {agent.name}
        </span>
        <span className={styles['badge']}>Agent</span>
        <button
          className={styles['remove-button']}
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            onRemove?.(agent.instanceId);
          }}
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>

      <ModelPickerPopoverComponent
        config={functionCallingConfig}
        settings={pickerSettings}
        onSelectModel={handlePickerSelect}
      />

      <div className={styles['footer']}>
        <span className={styles['description']}>{agent.description}</span>
        <div className={styles['toggles']}>
          {supportsThinking && (
            <ToggleButtonComponent
              icon={<Brain size={10} />}
              label="Think"
              active={isThinking}
              title={isThinking ? "Disable thinking" : "Enable thinking"}
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                onToggleThinking?.(agent.instanceId);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
