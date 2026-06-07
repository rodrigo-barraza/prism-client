"use client";

import { useMemo } from "react";
import { X, Brain, Wrench, Copy } from "lucide-react";
import ToggleButtonComponent from "./ToggleButtonComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ProviderLogo from "./ProviderLogosComponent";
import styles from "./ModelCardComponent.module.css";
import type { PrismConfig } from "../types/types";

interface BenchmarkModelInstance {
  instanceId: string;
  provider: string;
  name: string;
  key?: string;
  label?: string;
  display_name?: string;
  thinking?: boolean;
}

interface ModelCardProps {
  model: BenchmarkModelInstance;
  dupeCount?: number;
  isThinking?: boolean;
  supportsThinking?: boolean;
  isTools?: boolean;
  config?: PrismConfig | null;
  onRemove?: (instanceId: string) => void;
  onChangeModel?: (instanceId: string, provider: string, modelName: string) => void;
  onToggleThinking?: (instanceId: string) => void;
  onToggleTools?: (instanceId: string) => void;
}

export default function ModelCardComponent({
  model,
  dupeCount = 1,
  isThinking = false,
  supportsThinking = false,
  isTools = false,
  config,
  onRemove,
  onChangeModel,
  onToggleThinking,
  onToggleTools,
}: ModelCardProps) {
  const pickerSettings = useMemo(
    () => ({
      provider: model.provider || "",
      model: model.name || "",
    }),
    [model.provider, model.name],
  );

  const handlePickerSelect = (provider: string, name: string) => {
    onChangeModel?.(model.instanceId, provider, name);
  };

  return (
    <div className={`model-card-component ${styles['card']}`}>
      <div className={styles['header']}>
        <ProviderLogo provider={model.provider} size={14} />
        <span className={styles['name']} title={`Model: ${model.key || model.name}`}>
          Model: {model.key || model.name}
        </span>
        {dupeCount > 1 && (
          <span
            className={styles['dupe-badge']}
            title={`${dupeCount} instances of this model`}
          >
            <Copy size={8} />
            {dupeCount}
          </span>
        )}
        <button
          className={styles['remove-button']}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onRemove?.(model.instanceId);
          }}
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>

      {/* Model switcher — uses ModelPickerPopoverComponent trigger */}
      <ModelPickerPopoverComponent
        config={config ?? null}
        settings={pickerSettings}
        onSelectModel={handlePickerSelect}
      />

      <div className={styles['footer']}>
        <div className={styles['toggles']}>
          <ToggleButtonComponent
            icon={<Wrench size={10} />}
            label="Tools"
            active={isTools}
            title={isTools ? "Disable tools" : "Enable tools"}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onToggleTools?.(model.instanceId);
            }}
          />
          {supportsThinking && (
            <ToggleButtonComponent
              icon={<Brain size={10} />}
              label="Think"
              active={isThinking}
              title={isThinking ? "Disable thinking" : "Enable thinking"}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onToggleThinking?.(model.instanceId);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
