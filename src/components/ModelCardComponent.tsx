"use client";

import { useMemo } from "react";
import { X, Brain, Wrench, Copy } from "lucide-react";
import ToggleButtonComponent from "./ToggleButtonComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import ProviderLogo from "./ProviderLogosComponent";
import styles from "./ModelCardComponent.module.css";

/**
 * ModelCardComponent — a card for a single model instance in the benchmark sidebar.
 *
 * Uses ModelPickerPopoverComponent for inline model switching.
 *
 * Props:
 *   model            — { instanceId, provider, name, label, display_name, thinking }
 *   dupeCount        — number — how many instances of this same model exist
 *   isThinking       — boolean — whether thinking is enabled for this instance
 *   supportsThinking — boolean — whether the backing model supports thinking
 *   isTools          — boolean — whether tools are enabled for this instance
 *   config           — Prism config object (used by ModelPickerPopoverComponent)
 *   onRemove         — callback(instanceId)
 *   onChangeModel    — callback(instanceId, provider, modelName)
 *   onToggleThinking — callback(instanceId)
 *   onToggleTools    — callback(instanceId)
 */
export default function ModelCardComponent({
  // @ts-ignore
  // @ts-ignore
  model: any,
  dupeCount = 1,
  isThinking = false,
  supportsThinking = false,
  isTools = false,
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
  // @ts-ignore
  // @ts-ignore
  onToggleTools: any,
}) {


  // Build settings-like object for the picker trigger display
  const pickerSettings = useMemo<any>(() => ({
    // @ts-ignore
    provider: model.provider || "",
    // @ts-ignore
    model: model.name || "",
  // @ts-ignore
  // @ts-ignore
  }), [model.provider, model.name]);

  const handlePickerSelect = (provider: any, name: any) => {
    // @ts-ignore
    // @ts-ignore
    onChangeModel?.(model.instanceId, provider, name);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        {/* @ts-ignore */}
        <ProviderLogo provider={model.provider} size={14} />
        {/* @ts-ignore */}
        <span className={styles.name} title={`Model: ${model.key}`}>
          {/* @ts-ignore */}
          Model: {model.key}
        </span>
        {dupeCount > 1 && (
          <span className={styles.dupeBadge} title={`${dupeCount} instances of this model`}>
            <Copy size={8} />
            {dupeCount}
          </span>
        )}
        <button
          className={styles.removeBtn}
          onClick={(e) => {
            e.stopPropagation();
            // @ts-ignore
            // @ts-ignore
            onRemove?.(model.instanceId);
          }}
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>

      {/* Model switcher — uses ModelPickerPopoverComponent trigger */}
      {/* @ts-ignore */}
      <ModelPickerPopoverComponent
        // @ts-ignore
        config={config}
        settings={pickerSettings}
        onSelectModel={handlePickerSelect}
      />

      <div className={styles.footer}>
        <div className={styles.toggles}>
          <ToggleButtonComponent
            icon={<Wrench size={10} />}
            label="Tools"
            active={isTools}
            title={isTools ? "Disable tools" : "Enable tools"}
            onClick={(e: any) => {
              e.stopPropagation();
              // @ts-ignore
              // @ts-ignore
              onToggleTools?.(model.instanceId);
            }}
          />
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
                onToggleThinking?.(model.instanceId);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
