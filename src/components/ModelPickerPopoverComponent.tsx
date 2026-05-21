"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X, Loader2 } from "lucide-react";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import PrismService from "../services/PrismService";
import ModelsTableComponent from "./ModelsTableComponent";
import ModalityIconComponent from "./ModalityIconComponent";
import { ModelToolsRow } from "./ToolBadgeComponent";

import SoundService from "@/services/SoundService";
import { LOCAL_PROVIDERS } from "../constants";
import styles from "./ModelPickerPopoverComponent.module.css";
import { CloseButtonComponent, TooltipComponent } from "@rodrigo-barraza/components-library";

// -- Shared model-search store ------------------------------------------
// Module-scoped so every ModelPickerPopoverComponent instance shares the
// same search term. Uses useSyncExternalStore for tear-free reads.
let _sharedSearch = "";
const _listeners = new Set<() => void>();
function _notify() {
  for (const fn of _listeners) fn();
}
function subscribeSearch(callback: () => void) {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
}
function getSearchSnapshot() {
  return _sharedSearch;
}
function setSharedSearch(value: string) {
  _sharedSearch = value;
  _notify();
}
function useSharedModelSearch() {
  const value = useSyncExternalStore(
    subscribeSearch,
    getSearchSnapshot,
    getSearchSnapshot,
  );
  return [value, setSharedSearch] as const;
}

/**
 * ModelPickerPopoverComponent
 *
 * A single trigger pill that opens a rich, LM-Studio-style model picker
 * popover with a hoisted search field and a full ModelsTableComponent
 * (search, modality/tool/provider filter chips, sortable table).
 *
 * Supports two modes:
 *
 * **Single-select** (default) — clicking a model row calls
 * `onSelectModel(provider, name)` and closes the popover. The trigger
 * pill shows the currently-selected model name.
 *
 * **Multi-select** (`multiSelect={true}`) — clicking a row toggles
 * selection via `onSelectModel(rawModel)` and the popover stays open.
 * The trigger pill shows a count label ("Select Models" / "3 Models
 * Selected").  Provide `selectedKeys` (a Set of "provider:model" strings)
 * and optionally `renderActions` to render custom per-row controls.
 *
 * Props:
 *   config          — Prism config object with textToText, textToImage, etc.
 *   settings        — { provider, model, ... } (single-select mode)
 *   onSelectModel   — (provider, name) => void           (single-select)
 *                    — (rawModel)      => void           (multi-select)
 *   onLmStudioSelect — (rawModel) => void (lm-studio intercept)
 *   loadingProgress — number | null (0–1 progress bar on trigger)
 *   favorites       — string[] of "provider:model" keys
 *   onToggleFavorite — (key) => void
 *   disabled        — boolean — disables trigger interaction
 *   multiSelect     — boolean — enables multi-select mode
 *   selectedKeys    — Set<string> of "provider:model" keys (multi-select)
 *   renderActions   — (rawModel) => ReactNode — per-row actions
 *   triggerLabel    — string — override the trigger label text
 *   triggerIcon     — ReactNode — override the trigger icon
 *   modelTypeFilter — string — if set, only models whose modelType matches are shown
 *                     (e.g. "conversation" or "embed")
 *   allowDeselect   — boolean — if true, clicking the selected model clears it
 *   placeholderLabel — string — overrides "Select Model" when no model is selected
 */
import type { PrismConfig, ModelOption } from "../types/types";

export interface ExtendedModelOption extends ModelOption {
  provider: string;
  label: string;
  organization?: string;
  usageCount?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  key?: string;
  modelType?: string;
  inputTypes?: string[];
  outputTypes?: string[];
  tools?: string[];
  [key: string]: any;
}


export interface ModelPickerPopoverProps {
  config: PrismConfig | null;
  settings?: {
    provider?: string;
    model?: string;
    [key: string]: any;
  } | null;
  onSelectModel?: ((provider: string, model: string) => void) | ((model: any) => void);
  onLmStudioSelect?: (model: any) => void;
  loadingProgress?: number | null;
  favorites?: string[];
  onToggleFavorite?: (key: string) => void;
  disabled?: boolean;
  multiSelect?: boolean;
  selectedKeys?: Set<string>;
  renderActions?: (model: any) => React.ReactNode;
  triggerLabel?: string;
  triggerIcon?: React.ReactNode;
  modelTypeFilter?: string;
  allowDeselect?: boolean;
  placeholderLabel?: string;
}

export default function ModelPickerPopoverComponent({
  config,
  settings,
  onSelectModel,
  onLmStudioSelect,
  loadingProgress,
  favorites = [],
  onToggleFavorite,
  disabled = false,
  multiSelect = false,
  selectedKeys,
  renderActions,
  triggerLabel: triggerLabelProp,
  triggerIcon: triggerIconProp,
  modelTypeFilter,
  allowDeselect = false,
  placeholderLabel,
}: ModelPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useSharedModelSearch();
  const [popoverStyle, setPopoverStyle] = useState<Record<string, any>>({});
  const [flipped, setFlipped] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const highlightedRowRef = useCallback((element: HTMLElement | null) => {
    if (element) {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, []);

  // -- Build unified model list across all sections ---------------------
  const baseModels = buildAllModels(config, modelTypeFilter);

  // -- Fetch usage stats and enrich models ------------------------------
  const [usageMap, setUsageMap] = useState<Map<string, { totalRequests: number; totalInputTokens: number; totalOutputTokens: number; }> | null>(null);
  const usageFetchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (usageFetchedRef.current) return;
    usageFetchedRef.current = true;
    PrismService.getModelStats()
      .then((stats) => {
        const map = new Map<string, { totalRequests: number; totalInputTokens: number; totalOutputTokens: number; }>();
        for (const s of stats) {
          const key = `${s.provider}:${s.model}`;
          const existing = map.get(key);
          if (existing) {
            existing.totalRequests += s.totalRequests;
            existing.totalInputTokens += ((s as any).totalInputTokens as number) || 0;
            existing.totalOutputTokens += ((s as any).totalOutputTokens as number) || 0;
          } else {
            map.set(key, {
              totalRequests: s.totalRequests,
              totalInputTokens: ((s as any).totalInputTokens as number) || 0,
              totalOutputTokens: ((s as any).totalOutputTokens as number) || 0,
            });
          }
        }
        setUsageMap(map);
      })
      .catch(() => {});
  }, []);

  const allModels = useMemo(() => {
    if (!usageMap) return baseModels;
    return baseModels.map((m: any) => {
      const stats = usageMap.get(`${m.provider}:${m.name}`);
      if (!stats) return m;
      return {
        ...m,
        usageCount: stats.totalRequests,
        totalInputTokens: stats.totalInputTokens,
        totalOutputTokens: stats.totalOutputTokens,
      };
    });
  }, [baseModels, usageMap]);

  // -- Filter by search -------------------------------------------------
  const filteredModels = search.trim()
    ? allModels.filter((m: any) => {
        const q = search.toLowerCase();
        return (
          (m.name || "").toLowerCase().includes(q) ||
          (m.label || "").toLowerCase().includes(q) ||
          (resolveProviderLabel(m.provider || "") || "")
            .toLowerCase()
            .includes(q) ||
          (m.organization || "").toLowerCase().includes(q) ||
          ((m.params as string) || "").toLowerCase().includes(q)
        );
      })
    : allModels;

  // -- Collision-aware popover positioning ------------------------------
  // Keeps the popover fully within the viewport on all four edges.
  // Prefers anchoring below the trigger, flips above when there's more
  // room, and falls back to viewport-centering when neither direction
  // has enough space.
  const positionPopover = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current!.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const popoverW = Math.min(1600, viewportW - 32);
    const gap = 8;
    const pad = 16; // minimum distance from viewport edges

    // Estimate popover height as its max-height (75dvh)
    const maxPopoverH = viewportH * 0.75;
    const spaceBelow = viewportH - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;
    const shouldFlip = spaceBelow < maxPopoverH && spaceAbove > spaceBelow;
    setFlipped(shouldFlip);

    // -- Horizontal: center on ChatArea, clamp to viewport ----------
    const chatArea = document.querySelector("[data-chat-area]");
    let left;
    if (chatArea) {
      const areaRect = chatArea.getBoundingClientRect();
      left = areaRect.left + areaRect.width / 2 - popoverW / 2;
    } else {
      left = viewportW / 2 - popoverW / 2;
    }
    left = Math.max(pad, Math.min(left, viewportW - pad - popoverW));

    // -- Vertical: anchor to trigger, then clamp / center -----------
    const style = { left, width: popoverW };

    if (shouldFlip) {
      // Prefer anchoring bottom edge just above the trigger
      const bottom = viewportH - triggerRect.top + gap;
      // If this pushes the top edge above the viewport, clamp
      const impliedTop = viewportH - bottom - maxPopoverH;
      if (impliedTop < pad) {
        // Not enough room even when flipped — center vertically
        const centeredTop = Math.max(pad, (viewportH - maxPopoverH) / 2);
        (style as any).top = centeredTop;
        (style as any).bottom = "auto";
        (style as any).maxHeight = viewportH - centeredTop - pad;
      } else {
        (style as any).bottom = bottom;
      }
    } else {
      // Prefer anchoring top edge just below the trigger
      const top = triggerRect.bottom + gap;
      // If this pushes the bottom edge below the viewport, clamp
      if (top + maxPopoverH > viewportH - pad) {
        // Shrink or center
        const availableH = viewportH - pad - top;
        if (availableH < 200) {
          // Barely any room below — center vertically instead
          const centeredTop = Math.max(pad, (viewportH - maxPopoverH) / 2);
          (style as any).top = centeredTop;
          (style as any).maxHeight = viewportH - centeredTop - pad;
        } else {
          (style as any).top = top;
          (style as any).maxHeight = availableH;
        }
      } else {
        (style as any).top = top;
      }
    }

    setPopoverStyle(style);
  }, []);

  const openPopover = useCallback(() => {
    positionPopover();
    setOpen(true);
    // Preserve the shared search — don't clear it
  }, [positionPopover]);

  const togglePopover = useCallback(() => {
    open ? setOpen(false) : openPopover();
  }, [open, openPopover]);

  // Focus search when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: any) => {
      if (
        !e.target?.closest("[data-model-picker-popover]") &&
        !e.target?.closest("[data-model-picker-trigger]") &&
        !e.target?.closest("[data-column-filter]")
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler as any);
    return () => document.removeEventListener("mousedown", handler as any);
  }, [open]);

  // -- Handle model selection ---------------------------------------------
  const handleSelect = useCallback(
    (rawModel: any) => {
      if (multiSelect) {
        // Multi-select: toggle selection, keep popover open
        (onSelectModel as any)?.(rawModel);
        return;
      }

      // Single-select: select and close
      const provider = rawModel.provider || "lm-studio";
      const name = rawModel.name || rawModel.key;

      // Deselect: clicking the already-selected model clears the selection
      if (
        allowDeselect &&
        provider === settings?.provider &&
        name === settings?.model
      ) {
        (onSelectModel as any)?.("", "");
        setOpen(false);
        setHighlightIndex(-1);
        document.dispatchEvent(new CustomEvent("panel:dismiss-sidebars"));
        return;
      }

      // Intercept lm-studio models → show config panel first
      if (provider === "lm-studio" && onLmStudioSelect) {
        onLmStudioSelect(rawModel);
        setOpen(false);
        setHighlightIndex(-1);
        document.dispatchEvent(new CustomEvent("panel:dismiss-sidebars"));
        return;
      }

      (onSelectModel as any)?.(provider, name);
      setOpen(false);
      setHighlightIndex(-1);
      document.dispatchEvent(new CustomEvent("panel:dismiss-sidebars"));
    },
    [
      onSelectModel,
      onLmStudioSelect,
      multiSelect,
      allowDeselect,
      settings?.provider,
      settings?.model,
    ],
  );

  // Keyboard navigation (Escape / ArrowUp / ArrowDown / Enter)
  useEffect(() => {
    if (!open) return;
    const handler = (e: any) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }

      // Arrow navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => {
          const max = filteredModels.length - 1;
          if (max < 0) return -1;
          return prev < max ? prev + 1 : 0;
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => {
          const max = filteredModels.length - 1;
          if (max < 0) return -1;
          return prev > 0 ? prev - 1 : max;
        });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filteredModels.length) {
          handleSelect(filteredModels[highlightIndex]);
        }
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, highlightIndex, filteredModels, handleSelect]);

  // Re-position on scroll / resize / ChatArea resize (sidebar transitions)
  useEffect(() => {
    if (!open) return;
    const reposition = () => positionPopover();
    window.addEventListener("resize", reposition, { passive: true });
    window.addEventListener("scroll", reposition, {
      passive: true,
      capture: true,
    });

    // Watch the ChatArea for size changes (sidebar open/close transitions)
    const chatArea = document.querySelector("[data-chat-area]");
    let ro: any;
    if (chatArea) {
      ro = new ResizeObserver(reposition);
      ro.observe(chatArea);
    }

    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, { capture: true });
      ro?.disconnect();
    };
  }, [open, positionPopover]);

  // -- Trigger display ---------------------------------------------------
  const currentModel = allModels.find(
    (m) => m.provider === settings?.provider && m.name === settings?.model,
  );

  // Build display label
  const displayLabel = (() => {
    // Custom trigger label override
    if (triggerLabelProp) return triggerLabelProp;

    // Multi-select: show selection count
    if (multiSelect) {
      const count = selectedKeys?.size || 0;
      if (count === 0) return "Select Models";
      if (count === 1) return "1 Model Selected";
      return `${count} Models Selected`;
    }

    // Single-select: show current model name
    const rawLabel =
      currentModel?.label ||
      settings?.model ||
      placeholderLabel ||
      "Select Model";
    const provider = currentModel?.provider || settings?.provider;
    if (!provider || LOCAL_PROVIDERS.has(provider)) return rawLabel;
    const providerName = resolveProviderLabel(provider);
    return `${providerName}'s ${rawLabel}`;
  })();

  // Build modalities object for the currently selected model
  const triggerCapabilities = useMemo(() => {
    if (!currentModel || multiSelect) return null;
    const INPUT_MAP = {
      text: "textIn",
      image: "imageIn",
      audio: "audioIn",
      video: "videoIn",
      pdf: "docIn",
    };
    const OUTPUT_MAP = {
      text: "textOut",
      image: "imageOut",
      audio: "audioOut",
      embedding: "embeddingOut",
    };
    const TOOL_MAP = {
      Thinking: "thinking",
      "Tool Calling": "functionCalling",
      "Web Search": "webSearch",
      "Google Search": "webSearch",
      "Web Fetch": "webSearch",
      "Code Execution": "codeExecution",
      "Computer Use": "computerUse",
      "File Search": "fileSearch",
      "URL Context": "urlContext",
      "Image Generation": "imageGeneration",
    };
    const mod = {};
    for (const t of currentModel.inputTypes || []) {
      if ((INPUT_MAP as Record<string, any>)[t]) (mod as Record<string, any>)[(INPUT_MAP as Record<string, any>)[t]] = true;
    }
    for (const t of currentModel.outputTypes || []) {
      if ((OUTPUT_MAP as Record<string, any>)[t]) (mod as Record<string, any>)[(OUTPUT_MAP as Record<string, any>)[t]] = true;
    }
    for (const t of currentModel.tools || []) {
      if ((TOOL_MAP as Record<string, any>)[t]) (mod as Record<string, any>)[(TOOL_MAP as Record<string, any>)[t]] = true;
    }
    return Object.keys(mod).length > 0 ? mod : null;
  }, [currentModel, multiSelect]);

  // Trigger icon
  const triggerIconElement = (() => {
    if (triggerIconProp) return triggerIconProp;
    if (multiSelect) return null;
    if (loadingProgress != null) {
      return <Loader2 size={14} className={styles.triggerSpinner} />;
    }
    return settings?.provider ? (
      <ProviderLogo provider={settings.provider} size={16} />
    ) : null;
  })();

  // Active row key(s) for highlighting selected models in the table
  const activeRowKey = (() => {
    if (!multiSelect) {
      return currentModel
        ? `${currentModel.provider}-${currentModel.name}`
        : undefined;
    }
    // Multi-select: no single active row styling (handled by renderActions)
    return undefined;
  })();

  const triggerContent = (
    <>
      {/* -- Trigger pill + modalities row --------------------------- */}
      <div className={`${styles.triggerWrap} ${disabled ? styles.triggerDisabled : ""}`}>
        <button
          ref={triggerRef}
          className={`${styles.trigger} ${open ? styles.triggerOpen : ""} ${disabled ? styles.triggerReadOnly : ""} ${loadingProgress != null ? styles.triggerLoading : ""} ${multiSelect && (selectedKeys?.size ?? 0) > 0 ? styles.triggerActive : ""}`}
          onMouseEnter={
            disabled
              ? undefined
              : (e: any) => SoundService.playHoverButton({ event: e })
          }
          onClick={
            disabled
              ? undefined
              : (e: any) => {
                  SoundService.playClickButton({ event: e });
                  togglePopover();
                }
          }
          data-model-picker-trigger
          title={
            disabled
              ? displayLabel
              : multiSelect
                ? "Select models"
                : "Switch model"
          }
          style={disabled ? { cursor: "default" } : undefined}
        >
          <span className={styles.triggerContent}>
            {triggerIconElement}
            <span className={styles.triggerLabel}>
              {loadingProgress != null
                ? `Loading… ${Math.round((loadingProgress ?? 0) * 100)}%`
                : displayLabel}
            </span>
          </span>
          {!disabled && loadingProgress == null && (
            <ChevronDown
              size={14}
              className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
            />
          )}
          {/* Progress bar overlay */}
          {loadingProgress != null && (
            <span
              className={styles.triggerProgressBar}
              style={{ transform: `scaleX(${loadingProgress ?? 0})` }}
            />
          )}
        </button>
        {triggerCapabilities && loadingProgress == null && (
          <div className={styles.triggerCapabilities}>
            <ModalityIconComponent modalities={triggerCapabilities} size={10} />
            <ModelToolsRow tools={triggerCapabilities} variant="condensed" />
          </div>
        )}
      </div>

      {/* -- Popover portal ------------------------------------------- */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`${styles.popover} ${flipped ? styles.popoverFlipped : ""}`}
            style={popoverStyle}
            data-model-picker-popover
          >
            {/* Header: search + close */}
            <div className={styles.popoverHeader}>
              <Search size={16} className={styles.searchIcon} />
              <input
                ref={searchRef}
                className={styles.searchInput}
                placeholder="Type to filter models…"
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
                  setSearch(e.target.value);
                  setHighlightIndex(-1);
                }}
              />
              {search && (
                <button
                  className={styles.searchClear}
                  onClick={() => setSearch("")}
                  title="Clear"
                >
                  <X size={14} />
                </button>
              )}
              <CloseButtonComponent onClick={() => setOpen(false)} size={16} />
            </div>

            {/* Body: ModelsTableComponent with search disabled (hoisted above) */}
            <div ref={bodyRef} className={styles.popoverBody}>
              <ModelsTableComponent
                models={filteredModels}
                onSelect={handleSelect}
                showSearch={false}
                showProviderFilter
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                renderActions={renderActions}
                activeRowKey={activeRowKey}
                highlightedRowKey={
                  highlightIndex >= 0 && filteredModels[highlightIndex]
                    ? `${filteredModels[highlightIndex].provider}-${filteredModels[highlightIndex].name}`
                    : undefined
                }
                highlightedRowRef={highlightedRowRef}
                selectedKeys={multiSelect ? selectedKeys : undefined}
                onToggleSelect={multiSelect ? onSelectModel as any : undefined}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  if (disabled) {
    return (
      <TooltipComponent
        label="Start a new session to switch models"
        position="bottom"
        enterDelay={200}
      >
        {triggerContent}
      </TooltipComponent>
    );
  }

  return triggerContent;
}

// -- Helpers ------------------------------------------------------------

function buildAllModels(config: PrismConfig | null, modelTypeFilter?: string): ExtendedModelOption[] {
  if (!config) return [];
  const seen = new Map<string, ExtendedModelOption>();

  const sections = [
    { key: "textToText" as const, suffix: "" },
    { key: "textToImage" as const, suffix: " (Image)" },
    { key: "audioToText" as const, suffix: " (Transcribe)" },
    { key: "textToSpeech" as const, suffix: " (TTS)" },
    { key: "embedding" as const, suffix: " (Embed)" },
  ];

  for (const { key, suffix } of sections) {
    const modelsMap = config[key]?.models || {};
    for (const [provider, models] of Object.entries(modelsMap)) {
      for (const m of models as ModelOption[]) {
        const id = `${provider}:${m.name}`;
        if (!seen.has(id)) {
          seen.set(id, {
            ...m,
            provider,
            label: (m.label || m.name) + (suffix && !(m.label || m.name).endsWith(suffix) ? suffix : ""),
            organization: inferOrganization(m.name, provider),
          });
        }
      }
    }
  }

  let result = [...seen.values()];

  // Apply modelType filter if specified
  if (modelTypeFilter) {
    result = result.filter(
      (m) =>
        m.modelType === modelTypeFilter ||
        (m.name || "").toLowerCase().includes(modelTypeFilter),
    );
  }

  return result;
}

const ORG_MAP = [
  [/^qwen/i, "Alibaba / Qwen"],
  [/^granite/i, "IBM"],
  [/^llama/i, "Meta"],
  [/^mistral|mixtral/i, "Mistral AI"],
  [/^phi[-\d]/i, "Microsoft"],
  [/^gemma/i, "Google"],
  [/^nemotron/i, "NVIDIA"],
  [/^falcon/i, "TII"],
  [/^deepseek/i, "DeepSeek"],
  [/^codellama/i, "Meta"],
  [/^vicuna|alpaca|openchat|hermes/i, "Community"],
  [/^smollm/i, "HuggingFace"],
  [/^bartowski/i, "Bartowski"],
];

const PROVIDER_ORG_MAP = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google DeepMind",
  cohere: "Cohere",
  groq: "Groq",
  mistral: "Mistral AI",
  xai: "xAI",
  "together-ai": "Together AI",
  "lm-studio": null,
  ollama: null,
  "llama-cpp": null,
};

function inferOrganization(modelName: any, provider: any) {
  if ((PROVIDER_ORG_MAP as Record<string, any>)[provider])
    return (PROVIDER_ORG_MAP as Record<string, any>)[provider];
  for (const [pattern, org] of ORG_MAP) {
    if ((pattern as any).test(modelName)) return org;
  }
  return null;
}
