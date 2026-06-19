"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Cpu, HardDrive, Zap, Database, Loader2 } from "lucide-react";
import {
  InputComponent,
  ModalComponent,
  SliderComponent,
  ToggleComponent as ToggleSwitch,
  CheckboxComponent,
} from "@rodrigo-barraza/components-library";
import ProviderLogo from "./ProviderLogosComponent";
import { formatFileSize, formatContextTokens } from "@rodrigo-barraza/utilities-library";
import styles from "./ModelLoadConfigPanelComponent.module.css";
import { LS_LM_STUDIO_LOAD_CONFIG_PREFIX as LS_KEY_PREFIX } from "../constants";

interface ModelLoadConfig {
  contextLength: number;
  gpuLayers?: number;
  flashAttention: boolean;
  offloadKvCache: boolean;
}

interface ArchParams {
  layers: number;
  kvHeads: number;
  headDim: number;
  attnRatio: number;
  isKnown: boolean;
}

interface MemoryEstimate {
  gpuGiB: number;
  totalGiB: number;
}

interface ModelLoadConfigService {
  estimateLmStudioMemory: (modelKey: string, config: ModelLoadConfig) => Promise<MemoryEstimate>;
}

interface ModelLoadConfigPanelProps {
  model: {
    key?: string;
    name?: string;
    display_name?: string;
    max_context_length?: number;
    contextLength?: number;
    size_bytes?: number;
    architecture?: string | null;
    params_string?: string | null;
    modelParameters?: string | null;
    quantization?: string | { name: string } | null;
    archParams?: ArchParams;
  };
  onLoad: (modelKey: string, config: Omit<ModelLoadConfig, 'gpuLayers'>) => void;
  onClose: () => void;
  service?: ModelLoadConfigService | null;
  loading?: boolean;
}

// Architecture modelParameters are resolved server-side by Prism (gguf-arch.js).
// This fallback is used only if the API response doesn't include archParams.
const DEFAULT_ARCH_PARAMS = {
  layers: 32,
  kvHeads: 8,
  headDim: 128,
  attnRatio: 1.0,
  isKnown: false,
};

/**
 * Load persisted config for a model key from localStorage.
 */
function loadPersistedConfig(modelKey: string): ModelLoadConfig | null {
  try {
    const raw = localStorage.getItem(`${LS_KEY_PREFIX}${modelKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Save config for a model key to localStorage.
 */
function savePersistedConfig(modelKey: string, config: ModelLoadConfig) {
  try {
    localStorage.setItem(`${LS_KEY_PREFIX}${modelKey}`, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

/**
 * ModelLoadConfigPanel — LM Studio-style model load configuration modal.
 *
 * Shows context length slider, GPU offload slider (estimation),
 * flash attention toggle, and estimated VRAM/RAM usage bar.
 */
export default function ModelLoadConfigPanel({
  model,
  onLoad,
  onClose,
  service,
  loading = false,
}: ModelLoadConfigPanelProps) {
  const modelKey = model.key || model.name || "";
  const maxContext = model.max_context_length || model.contextLength || 131072;
  const sizeBytes = model.size_bytes || 0;
  const architecture = model.architecture || null;
  const modelParameters = model.params_string || model.modelParameters || null;
  const quantization =
    (typeof model.quantization === "object"
      ? model.quantization?.name
      : model.quantization) || null;

  // Architecture modelParameters come from the Prism backend (gguf-arch.js)
  const archParams = model.archParams || DEFAULT_ARCH_PARAMS;
  const totalLayers = archParams.layers;

  // Load persisted or default values
  const persisted = useMemo(() => loadPersistedConfig(modelKey), [modelKey]);

  const [contextLength, setContextLength] = useState(
    () => persisted?.contextLength || Math.min(4096, maxContext),
  );
  const [gpuLayers, setGpuLayers] = useState(
    () => persisted?.gpuLayers ?? totalLayers,
  );
  const [flashAttention, setFlashAttention] = useState(
    () => persisted?.flashAttention ?? true,
  );
  const [offloadKvCache, setOffloadKvCache] = useState(
    () => persisted?.offloadKvCache ?? true,
  );
  const [rememberSettings, setRememberSettings] = useState(() => !!persisted);

  // -- Memory Estimation (from backend) --------------------
  const [memory, setMemory] = useState({ gpuGiB: 0, totalGiB: 0 });
  const [maxMemory, setMaxMemory] = useState({ gpuGiB: 0, totalGiB: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!service?.estimateLmStudioMemory) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const [current, max] = await Promise.all([
          service.estimateLmStudioMemory(modelKey, {
            contextLength,
            gpuLayers,
            flashAttention,
            offloadKvCache,
          }),
          service.estimateLmStudioMemory(modelKey, {
            contextLength: maxContext,
            gpuLayers: totalLayers,
            flashAttention,
            offloadKvCache: true,
          }),
        ]);
        setMemory(current);
        setMaxMemory(max);
      } catch {
        // Silently ignore — estimation is non-critical
      }
    }, 100);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    service,
    modelKey,
    contextLength,
    gpuLayers,
    flashAttention,
    offloadKvCache,
    maxContext,
    totalLayers,
  ]);

  const barMax = Math.max(maxMemory.totalGiB, memory.totalGiB, 1);

  const handleLoad = useCallback(() => {
    if (rememberSettings) {
      savePersistedConfig(modelKey, {
        contextLength,
        gpuLayers,
        flashAttention,
        offloadKvCache,
      });
    } else {
      // Clear any persisted config
      try {
        localStorage.removeItem(`${LS_KEY_PREFIX}${modelKey}`);
      } catch {
        // ignore
      }
    }

    onLoad(modelKey, {
      contextLength,
      flashAttention,
      offloadKvCache,
    });
  }, [
    modelKey,
    contextLength,
    gpuLayers,
    flashAttention,
    offloadKvCache,
    rememberSettings,
    onLoad,
  ]);

  // Keyboard shortcut: Ctrl+Enter to load
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleLoad();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleLoad]);

  const handleContextInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setContextLength(Math.max(2048, Math.min(value, maxContext)));
    }
  };

  const handleGpuInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setGpuLayers(Math.max(0, Math.min(value, totalLayers)));
    }
  };

  const formatGiB = (gib: number) => {
    if (gib < 0.01) return "0 GB";
    if (gib < 10) return `${gib.toFixed(2)} GB`;
    return `${gib.toFixed(1)} GB`;
  };

  return (
    <ModalComponent
      title={
        <>
          <ProviderLogo provider="lm-studio" size={20} />
          {model.display_name || modelKey}
          {architecture && (
            <span className={`model-load-config-panel-component ${styles['arch-badge']}`}>{architecture}</span>
          )}
        </>
      }
      onClose={onClose}
      size="md"
      footer={
        <>
          <button
            className={styles['cancel-button']}
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className={styles['load-button']}
            onClick={handleLoad}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2
                  size={14}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                Loading…
              </>
            ) : (
              <>
                Load Model
                <span className={styles['load-button-element-shortcut']}>Ctrl + Enter</span>
              </>
            )}
          </button>
        </>
      }
    >
      {/* Model info badges */}
      <div className={styles['model-info']}>
        {sizeBytes > 0 && (
          <span className={styles['info-badge']}>
            <HardDrive size={11} />
            {formatFileSize(sizeBytes)}
          </span>
        )}
        {modelParameters && (
          <span className={styles['info-badge']}>
            <Cpu size={11} />
            {modelParameters}
          </span>
        )}
        {quantization && (
          <span className={styles['info-badge']}>{quantization}</span>
        )}
        {maxContext > 0 && (
          <span className={styles['info-badge']}>
            Max {formatContextTokens(maxContext)}
          </span>
        )}
      </div>

      {/* Estimated Memory Usage */}
      <div className={styles['memory-section']}>
        <div className={styles['memory-header']}>
          <span className={styles['memory-label']}>
            Estimated Memory Usage
            <span className={styles['beta-badge']}>Beta</span>
          </span>
          <div className={styles['memory-values']}>
            <span className={styles['memory-value']}>
              <span className={styles['memory-value-label']}>GPU</span>
              <span className={styles['memory-value-num']}>
                {formatGiB(memory.gpuGiB)}
              </span>
            </span>
            <span className={styles['memory-value']}>
              <span className={styles['memory-value-label']}>Total</span>
              <span className={styles['memory-value-num']}>
                {formatGiB(memory.totalGiB)}
              </span>
            </span>
          </div>
        </div>
        <div className={styles['memory-bar-wrap']}>
          <div
            className={styles['memory-bar-total']}
            style={{
              width: `${Math.min((memory.totalGiB / barMax) * 100, 100)}%`,
            }}
          />
          <div
            className={styles['memory-bar-gpu']}
            style={{
              width: `${Math.min((memory.gpuGiB / barMax) * 100, 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Context Length Slider */}
      <div className={styles['slider-section']}>
        <div className={styles['slider-header']}>
          <span className={styles['slider-label']}>
            <Database size={14} />
            Context Length
          </span>
          <InputComponent
            type="number"
            className={styles['slider-input']}
            value={contextLength}
            onChange={handleContextInput}
            min={2048}
            max={maxContext}
            step={1024}
          />
        </div>
        <span className={styles['slider-hint']}>
          Model supports up to {maxContext.toLocaleString()} tokens
        </span>
        <SliderComponent
          min={2048}
          max={maxContext}
          step={1024}
          value={contextLength}
          onChange={(value: number) => setContextLength(value)}
        />
      </div>

      {/* GPU Offload Slider */}
      <div className={styles['slider-section']}>
        <div className={styles['slider-header']}>
          <span className={styles['slider-label']}>
            <Cpu size={14} />
            GPU Offload
            <span className={styles['beta-badge']} style={{ marginLeft: 2 }}>
              Est.
            </span>
          </span>
          <InputComponent
            type="number"
            className={styles['slider-input']}
            value={gpuLayers}
            onChange={handleGpuInput}
            min={0}
            max={totalLayers}
          />
        </div>
        <span className={styles['slider-hint']}>
          {gpuLayers} of {archParams.isKnown ? "" : "~"}
          {totalLayers} layers on GPU
        </span>
        <SliderComponent
          min={0}
          max={totalLayers}
          step={1}
          value={gpuLayers}
          onChange={(value: number) => setGpuLayers(value)}
        />
      </div>

      <div className={styles['divider']} />

      {/* Toggle options */}
      <div className={styles['toggle-layout-row']}>
        <span className={styles['toggle-label']}>
          <Zap size={14} />
          Flash Attention
          <span className={styles['toggle-hint']}>
            — saves memory, improves speed
          </span>
        </span>
        <ToggleSwitch
          checked={flashAttention}
          onChange={setFlashAttention}
          size="mini"
        />
      </div>

      <div className={styles['toggle-layout-row']}>
        <span className={styles['toggle-label']}>
          <Database size={14} />
          KV Cache → GPU
          <span className={styles['toggle-hint']}>— faster but uses more VRAM</span>
        </span>
        <ToggleSwitch
          checked={offloadKvCache}
          onChange={setOffloadKvCache}
          size="mini"
        />
      </div>

      <div className={styles['divider']} />

      {/* Remember settings */}
      <div className={styles['remember-layout-row']}>
        <CheckboxComponent
          size="compact"
          checked={rememberSettings}
          onChange={setRememberSettings}
          label={
            <span className={styles['remember-label']}>
              Remember settings for <strong>{modelKey}</strong>
            </span>
          }
        />
      </div>
    </ModalComponent>
  );
}
