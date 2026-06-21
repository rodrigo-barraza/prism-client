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
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import PrismService from "../services/PrismService";
import ModelsTableComponent from "./ModelsTableComponent";
import type { RawModel, RowData } from "./ModelsTableComponent";
import ModalityIconComponent from "./ModalityIconComponent";
import { ModelToolsRow } from "./ToolBadgeComponent";

import SoundService from "@/services/SoundService";
import { LOCAL_PROVIDERS, EV_PANEL_DISMISS_SIDEBARS } from "../constants";
import styles from "./ModelPickerPopoverComponent.module.css";
import {
  CloseButtonComponent,
  SearchInputComponent,
  SelectComponent,
} from "@rodrigo-barraza/components-library";

// -- Shared model-search store ------------------------------------------
// Module-scoped so every ModelPickerPopoverComponent instance shares the
// same search term. Uses useSyncExternalStore for tear-free reads.
let _sharedSearch = "";
const _listeners = new Set<() => void>();
function _notify() {
  for (const listener of _listeners) listener();
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
  organization?: string | null;
  usageCount?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  lastUsed?: string | Date;
  key?: string;
  modelType?: string;
  inputTypes?: string[];
  outputTypes?: string[];
  tools?: string[];
  params?: string;
}

export interface ModelPickerPopoverProps {
  config: PrismConfig | null;
  settings?: {
    provider?: string;
    model?: string;
    [key: string]: string | number | boolean | undefined;
  } | null;
  onSelectModel?:
    | ((provider: string, model: string) => void)
    | ((model: ExtendedModelOption) => void);
  onLmStudioSelect?: (model: ExtendedModelOption) => void;
  loadingProgress?: number | null;
  favorites?: string[];
  onToggleFavorite?: (key: string) => void;
  disabled?: boolean;
  multiSelect?: boolean;
  selectedKeys?: Set<string>;
  renderActions?: (model: ExtendedModelOption) => React.ReactNode;
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
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
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
  const [usageMap, setUsageMap] = useState<Map<
    string,
    {
      totalRequests: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      lastUsed?: string | Date;
    }
  > | null>(null);
  const usageFetchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (usageFetchedRef.current) return;
    usageFetchedRef.current = true;
    PrismService.getModelStats()
      .then((stats) => {
        const usageStatisticsMap = new Map<
          string,
          {
            totalRequests: number;
            totalInputTokens: number;
            totalOutputTokens: number;
            lastUsed?: string | Date;
          }
        >();
        for (const stat of stats) {
          const modelKey = `${stat.provider}:${stat.model}`;
          const existingStat = usageStatisticsMap.get(modelKey);
          if (existingStat) {
            existingStat.totalRequests += stat.totalRequests;
            existingStat.totalInputTokens +=
              (stat as { totalInputTokens?: number }).totalInputTokens || 0;
            existingStat.totalOutputTokens +=
              (stat as { totalOutputTokens?: number }).totalOutputTokens || 0;
            if (stat.lastUsed) {
              const currentLastUsedTime = new Date(stat.lastUsed).getTime();
              const existingLastUsedTime = existingStat.lastUsed ? new Date(existingStat.lastUsed).getTime() : 0;
              if (currentLastUsedTime > existingLastUsedTime) {
                existingStat.lastUsed = stat.lastUsed;
              }
            }
          } else {
            usageStatisticsMap.set(modelKey, {
              totalRequests: stat.totalRequests,
              totalInputTokens:
                (stat as { totalInputTokens?: number }).totalInputTokens || 0,
              totalOutputTokens:
                (stat as { totalOutputTokens?: number }).totalOutputTokens || 0,
              lastUsed: stat.lastUsed,
            });
          }
        }
        setUsageMap(usageStatisticsMap);
      })
      .catch(() => {});
  }, []);

  const allModels = useMemo(() => {
    if (!usageMap) return baseModels;
    return baseModels.map((modelOption: ExtendedModelOption) => {
      const stats = usageMap.get(`${modelOption.provider}:${modelOption.name}`);
      if (!stats) return modelOption;
      return {
        ...modelOption,
        usageCount: stats.totalRequests,
        totalInputTokens: stats.totalInputTokens,
        totalOutputTokens: stats.totalOutputTokens,
        lastUsed: stats.lastUsed,
      };
    });
  }, [baseModels, usageMap]);

  // -- Filter by search -------------------------------------------------
  const filteredModels = search.trim()
    ? allModels.filter((model: ExtendedModelOption) => {
        const normalizedSearch = search.toLowerCase();
        return (
          (model.name || "").toLowerCase().includes(normalizedSearch) ||
          (model.label || "").toLowerCase().includes(normalizedSearch) ||
          (resolveProviderLabel(model.provider || "") || "")
            .toLowerCase()
            .includes(normalizedSearch) ||
          (model.organization || "").toLowerCase().includes(normalizedSearch) ||
          ((model.params as string) || "").toLowerCase().includes(normalizedSearch)
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
    const chatArea = document.querySelector("[data-chat-area-region]");
    let left;
    if (chatArea) {
      const areaRect = chatArea.getBoundingClientRect();
      left = areaRect.left + areaRect.width / 2 - popoverW / 2;
    } else {
      left = viewportW / 2 - popoverW / 2;
    }
    left = Math.max(pad, Math.min(left, viewportW - pad - popoverW));

    // -- Vertical: anchor to trigger, then clamp / center -----------
    const style: Record<string, number | string> = { left, width: popoverW };

    if (shouldFlip) {
      // Prefer anchoring bottom edge just above the trigger
      const bottom = viewportH - triggerRect.top + gap;
      // If this pushes the top edge above the viewport, clamp
      const impliedTop = viewportH - bottom - maxPopoverH;
      if (impliedTop < pad) {
        // Not enough room even when flipped — center vertically
        const centeredTop = Math.max(pad, (viewportH - maxPopoverH) / 2);
        style.top = centeredTop;
        style.bottom = "auto";
        style.maxHeight = viewportH - centeredTop - pad;
      } else {
        style.bottom = bottom;
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
          style.top = centeredTop;
          style.maxHeight = viewportH - centeredTop - pad;
        } else {
          style.top = top;
          style.maxHeight = availableH;
        }
      } else {
        style.top = top;
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
    const handler = (e: MouseEvent) => {
      if (
        !(e.target as HTMLElement)?.closest?.("[data-model-picker-popover]") &&
        !(e.target as HTMLElement)?.closest?.("[data-model-picker-trigger]") &&
        !(e.target as HTMLElement)?.closest?.("[data-column-filter]")
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // -- Handle model selection ---------------------------------------------
  const handleSelect = useCallback(
    (rawModel: ExtendedModelOption) => {
      if (multiSelect) {
        // Multi-select: toggle selection, keep popover open
        (onSelectModel as (model: ExtendedModelOption) => void)?.(rawModel);
        return;
      }

      // Single-select: select and close
      const provider = rawModel.provider || "lm-studio";
      const name = rawModel.name || rawModel.key || "";

      // Deselect: clicking the already-selected model clears the selection
      if (
        allowDeselect &&
        provider === settings?.provider &&
        name === settings?.model
      ) {
        (onSelectModel as (provider: string, model: string) => void)?.("", "");
        setOpen(false);
        setHighlightIndex(-1);
        document.dispatchEvent(new CustomEvent(EV_PANEL_DISMISS_SIDEBARS));
        return;
      }

      // Intercept lm-studio models → show config panel first
      if (provider === "lm-studio" && onLmStudioSelect) {
        onLmStudioSelect(rawModel);
        setOpen(false);
        setHighlightIndex(-1);
        document.dispatchEvent(new CustomEvent(EV_PANEL_DISMISS_SIDEBARS));
        return;
      }

      (onSelectModel as (provider: string, model: string) => void)?.(
        provider,
        name,
      );
      setOpen(false);
      setHighlightIndex(-1);
      document.dispatchEvent(new CustomEvent(EV_PANEL_DISMISS_SIDEBARS));
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
    const handler = (e: KeyboardEvent) => {
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
    const chatArea = document.querySelector("[data-chat-area-region]");
    let ro: ResizeObserver | undefined;
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
    (model) => model.provider === settings?.provider && model.name === settings?.model,
  );

  // Detect initial config loading — config is null until the API responds
  const isConfigLoading = !config && !settings?.model && loadingProgress == null;

  // Derive effective loading progress: explicit prop takes priority,
  // otherwise pulse an indeterminate bar while config is being fetched
  const effectiveLoadingProgress = loadingProgress ?? (isConfigLoading ? 0 : null);

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
    if (!settings?.model) {
      return placeholderLabel || "Select Model";
    }
    return currentModel?.label || settings.model;
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
    const modalityToggles: Record<string, boolean> = {};
    for (const tool of currentModel.inputTypes || []) {
      const mapped = (INPUT_MAP as Record<string, string>)[tool];
      if (mapped) modalityToggles[mapped] = true;
    }
    for (const tool of currentModel.outputTypes || []) {
      const mapped = (OUTPUT_MAP as Record<string, string>)[tool];
      if (mapped) modalityToggles[mapped] = true;
    }
    for (const tool of currentModel.tools || []) {
      const mapped = (TOOL_MAP as Record<string, string>)[tool];
      if (mapped) modalityToggles[mapped] = true;
    }
    return Object.keys(modalityToggles).length > 0 ? modalityToggles : null;
  }, [currentModel, multiSelect]);

  // Trigger icon (not needed during loading — SelectComponent handles spinner)
  const triggerIconElement = (() => {
    if (triggerIconProp) return triggerIconProp;
    if (multiSelect) return null;
    if (effectiveLoadingProgress != null) return null;
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

  // Build trigger class overrides for multi-select active state
  const hasNoModelSelected = !multiSelect && !settings?.model;

  const triggerClassName = [
    multiSelect && (selectedKeys?.size ?? 0) > 0 ? styles['trigger-is-active-state'] : "",
    hasNoModelSelected ? styles['trigger-no-model-warning'] : "",
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  // Build rich tooltip content showing modality + tool capabilities
  const tooltipContent =
    !disabled && triggerCapabilities && effectiveLoadingProgress == null ? (
      <div className={styles['tooltip-capabilities']}>
        <ModalityIconComponent modalities={triggerCapabilities} size={10} />
        <ModelToolsRow tools={triggerCapabilities} variant="condensed" />
      </div>
    ) : null;

  const triggerContent = (
    <div className={`model-picker-popover-component ${styles["model-picker-container"]}`}>
      {/* -- Trigger pill (SelectComponent in controlled mode) ---- */}
      <SelectComponent
        isOpen={open}
        onToggle={() => {
          SoundService.playClickButton({});
          togglePopover();
        }}
        icon={triggerIconElement}
        placeholder={displayLabel}
        disabled={disabled}
        triggerRef={triggerRef}
        triggerClassName={triggerClassName}
        triggerTooltipContent={tooltipContent}
        loadingProgress={effectiveLoadingProgress}
        onMouseEnter={
          disabled
            ? undefined
            : (event: React.MouseEvent) =>
                SoundService.playHoverButton({ event: event.nativeEvent })
        }
      />

      {/* -- Popover portal ------------------------------------------- */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`${styles['popover']} ${flipped ? styles['popover-flipped'] : ""}`}
            style={popoverStyle}
            data-model-picker-popover
          >
            {/* Header: search + close */}
            <div className={styles['popover-header']}>
              <SearchInputComponent
                ref={searchRef}
                id="input-model-picker-search"
                value={search}
                onChange={(value: string) => {
                  setSearch(value);
                  setHighlightIndex(-1);
                }}
                placeholder="Type to filter models…"
                compact
                className={styles["popover-search-input"]}
              />
              <CloseButtonComponent onClick={() => setOpen(false)} size={16} />
            </div>

            {/* Body: ModelsTableComponent with search disabled (hoisted above) */}
            <div ref={bodyRef} className={styles['popover-body']}>
              <ModelsTableComponent
                models={filteredModels as unknown as RawModel[]}
                onSelect={handleSelect as unknown as (model: RawModel) => void}
                showSearch={false}
                showProviderFilter
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                renderActions={
                  renderActions as unknown as
                    | ((model: RawModel) => React.ReactNode)
                    | undefined
                }
                activeRowKey={activeRowKey}
                highlightedRowKey={
                  highlightIndex >= 0 && filteredModels[highlightIndex]
                    ? `${filteredModels[highlightIndex].provider}-${filteredModels[highlightIndex].name}`
                    : undefined
                }
                highlightedRowRef={highlightedRowRef}
                selectedKeys={multiSelect ? selectedKeys : undefined}
                onToggleSelect={
                  multiSelect
                    ? (onSelectModel as unknown as (model: RawModel) => void)
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );

  if (disabled) {
    return (
      <div className={`model-picker-popover-component ${styles["model-picker-container"]}`}>
        <SelectComponent
          isOpen={false}
          onToggle={() => {}}
          icon={triggerIconElement}
          placeholder={displayLabel}
          disabled
          triggerTooltip="Start a new conversation to switch models"
        />
      </div>
    );
  }

  return triggerContent;
}

// -- Helpers ------------------------------------------------------------

function buildAllModels(
  config: PrismConfig | null,
  modelTypeFilter?: string,
): ExtendedModelOption[] {
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
      for (const model of models as ModelOption[]) {
        const id = `${provider}:${model.name}`;
        if (!seen.has(id)) {
          seen.set(id, {
            ...model,
            provider,
            label:
              (model.label || model.name) +
              (suffix && !(model.label || model.name).endsWith(suffix) ? suffix : ""),
            organization: inferOrganization(model.name, provider),
          });
        }
      }
    }
  }

  let result = [...seen.values()];

  // Apply modelType filter if specified
  if (modelTypeFilter) {
    result = result.filter((model) => {
      const lowerFilter = modelTypeFilter.toLowerCase();
      if (lowerFilter === "tts") {
        return (
          model.label.endsWith(" (TTS)") ||
          (model.name || "").toLowerCase().includes("tts")
        );
      }
      if (lowerFilter === "transcription" || lowerFilter === "transcribe") {
        return (
          model.label.endsWith(" (Transcribe)") ||
          (model.name || "").toLowerCase().includes("transcribe")
        );
      }
      return (
        model.modelType === modelTypeFilter ||
        (model.name || "").toLowerCase().includes(lowerFilter)
      );
    });
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

function inferOrganization(modelName: string, provider: string): string | null {
  if ((PROVIDER_ORG_MAP as Record<string, string | null>)[provider])
    return (PROVIDER_ORG_MAP as Record<string, string | null>)[provider];
  for (const [pattern, org] of ORG_MAP) {
    if ((pattern as RegExp).test(modelName)) return org as string;
  }
  return null;
}
