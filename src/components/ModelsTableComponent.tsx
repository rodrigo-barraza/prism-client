"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Star,
  ArrowRight,
  CheckSquare2,
  Square,
  Brain,
  Parentheses,
  Globe,
  Terminal,
  Monitor,
  FileSearch,
  Link,
  ImagePlus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  Wrench,
} from "lucide-react";
import ProviderLogo, {
  resolveProviderLabel,
} from "./ProviderLogosComponent";
import { PROVIDER_LABELS } from "../constants";
import {
  MODALITY_ICONS,
  MODALITY_COLORS,
  TOOL_COLORS,
} from "./WorkflowNodeConstantsComponent";
import {
  TableComponent,
  TooltipComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";

import ToolIconComponent from "./ToolIconComponent";
import FilterDropdownComponent from "./FilterDropdownComponent";

import ProportionBarComponent from "./ProportionBarComponent";
import BadgeComponent from "./BadgeComponent";
import { formatFileSize, formatContextTokens, formatNumber, formatTokenCount, formatLatency, formatTokensPerSec } from "@rodrigo-barraza/utilities-library";
import {
  requestsColumn,
  usageColumn,
  modalitiesColumn as statsModalitiesColumn,
  toolsColumn as statsToolsColumn,
  tokenColumns,
  costColumns,
  latencyColumn,
  countLinkColumns,
  emptyDash,
} from "../utils/tableColumns";
import styles from "./ModelsTableComponent.module.css";

export interface RawModel {
  key?: string;
  name?: string;
  display_name?: string;
  label?: string;
  provider?: string;
  modelType?: string;
  size?: string;
  size_bytes?: number;
  params?: string;
  params_string?: string;
  contextLength?: number;
  max_context_length?: number;
  quantization?: string | { name: string };
  bitsPerWeight?: number;
  architecture?: string;
  publisher?: string;
  loaded?: boolean;
  loaded_instances?: Record<string, string | number | boolean>[];
  pricing?: {
    inputPerMillion?: number;
    outputPerMillion?: number;
  };
  arena?: Record<string, number>;
  year?: number;
  tools?: string[];
  usageCount?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  _benchThinkingEnabled?: boolean;
  _benchToolsEnabled?: boolean;
  _benchAgent?: string | null;
  inputTypes?: string[];
  outputTypes?: string[];
  _benchStat?: unknown;
  _benchTotal?: number;
  _benchPassed?: number;
  _benchFailed?: number;
  _benchErrored?: number;
  _benchPassRate?: number;
  _benchAvgLatency?: number;
  _benchTotalCost?: number;
  totalRequests?: number;
  totalCost?: number;
  avgLatency?: number;
  avgTokensPerSec?: number;
  model?: string;
  lastUsed?: string | Date;
}

export interface NormalizedModel {
  key: string;
  name: string;
  provider: string;
  modelType: string | null;
  size: string | null;
  params: string | null;
  contextLength: number | null;
  quantization: string | null;
  bitsPerWeight: number | null;
  architecture: string | null;
  publisher: string | null;
  isLoaded: boolean;
  pricing: RawModel["pricing"] | null;
  arena: RawModel["arena"] | null;
  year: number | null;
}

export interface RowData {
  _raw: RawModel;
  _model: NormalizedModel;
  _favKey: string;
  model: string;
  name: string;
  provider: string;
  year: number;
  context: number;
  size: number;
  params: number;
  modelType: string;
  quant: string;
  bitsPerWeight: number;
  arch: string;
  publisher: string;
  input: number;
  output: number;
  favorite: number;
  tools: number;
  requests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUsed?: string | Date;
  _benchThinking: boolean;
  _benchTools: boolean;
  _benchAgent: unknown;
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | RawModel
    | NormalizedModel
    | unknown;
}

/**
 * Format a per-million-token pricing rate with clean precision.
 * e.g. 2.5 → "$2.50", 0.15 → "$0.15", 10 → "$10.00"
 */
function formatPricingRate(rateValue: number | null | undefined): string {
  if (rateValue == null) return "—";
  // Use up to 4 decimals but strip unnecessary trailing zeros, min 2 decimals
  const formatted = rateValue.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const [int, dec = ""] = formatted.split(".");
  const padded = dec.padEnd(2, "0");
  return `$${int}.${padded}`;
}

/**
 * Parse a size display string like "7.5 GB", "500 MB", "120 KB" back to bytes.
 */
function parseSize(sizeString: string | null | undefined): number {
  if (!sizeString) return 0;
  const match = sizeString.match(/([\d.]+)\s*(GB|MB|KB)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "GB") return value * 1_073_741_824;
  if (unit === "MB") return value * 1_048_576;
  if (unit === "KB") return value * 1024;
  return 0;
}

const ARENA_COLUMNS = [
  { key: "arena_text", dataKey: "text", label: "Text" },
  { key: "arena_code", dataKey: "code", label: "Code" },
  { key: "arena_vision", dataKey: "vision", label: "Vision" },
  { key: "arena_document", dataKey: "document", label: "Document" },
  { key: "arena_image", dataKey: "image", label: "Image" },
  { key: "arena_imageEdit", dataKey: "imageEdit", label: "Image Edit" },
  { key: "arena_search", dataKey: "search", label: "Search" },
];

const TOOL_ICONS = {
  Thinking: Brain,
  "Tool Calling": Parentheses,
  "Web Search": Globe,
  "Google Search": Globe,
  "Code Execution": Terminal,
  "Computer Use": Monitor,
  "File Search": FileSearch,
  "URL Context": Link,
  "Image Generation": ImagePlus,
};

function ModalityCell({
  inputTypes,
  outputTypes,
}: {
  inputTypes?: string[];
  outputTypes?: string[];
}) {
  if (!inputTypes?.length && !outputTypes?.length) return "—";
  return (
    <span className={styles['modalities']}>
      {(inputTypes || []).map((inputType: string) => {
        const modalityEntry = (
          MODALITY_ICONS as Record<
            string,
            { icon: React.ElementType; label: string }
          >
        )[inputType];
        if (!modalityEntry) return null;
        const Icon = modalityEntry.icon;
        return (
          <TooltipComponent
            key={`in-${inputType}`}
            label={modalityEntry.label}
            position="top"
          >
            <Icon
              size={12}
              style={{ color: (MODALITY_COLORS as Record<string, string>)[inputType] }}
            />
          </TooltipComponent>
        );
      })}
      {inputTypes &&
        inputTypes.length > 0 &&
        outputTypes &&
        outputTypes.length > 0 && (
          <ArrowRight size={10} className={styles['modality-arrow']} />
        )}
      {(outputTypes || []).map((outputType: string) => {
        const modalityEntry = (
          MODALITY_ICONS as Record<
            string,
            { icon: React.ElementType; label: string }
          >
        )[outputType];
        if (!modalityEntry) return null;
        const Icon = modalityEntry.icon;
        return (
          <TooltipComponent
            key={`out-${outputType}`}
            label={modalityEntry.label}
            position="top"
          >
            <Icon
              size={12}
              style={{ color: (MODALITY_COLORS as Record<string, string>)[outputType] }}
            />
          </TooltipComponent>
        );
      })}
    </span>
  );
}

function normalizeModel(model: RawModel): NormalizedModel {
  const rawName =
    model.display_name || model.label || model.key || model.name || "";
  const explicitQuant =
    (model.quantization && typeof model.quantization === "object"
      ? model.quantization.name
      : model.quantization) || null;
  const quantization = explicitQuant || extractQuantization(rawName) || null;
  const name = quantization ? stripQuantSuffix(rawName) : rawName;
  return {
    key: model.key || model.name || "",
    name,
    provider: model.provider || "lm-studio",
    modelType: model.modelType || null,
    size:
      model.size ||
      (model.size_bytes ? formatFileSize(model.size_bytes) : null),
    params: model.params || model.params_string || null,
    contextLength: model.contextLength || model.max_context_length || null,
    quantization,
    bitsPerWeight: model.bitsPerWeight ?? null,
    architecture: model.architecture || null,
    publisher: model.publisher || null,
    isLoaded:
      model.loaded ||
      (model.loaded_instances && model.loaded_instances.length > 0) ||
      false,
    pricing: model.pricing || null,
    arena: model.arena || null,
    year: model.year || null,
  };
}

/**
 * Extract a quantization tag from the end of a label, e.g. "(Q8_0)", "(Q4_K_M)", "(IQ3_XXS)".
 */
function extractQuantization(quantizationString: string | null | undefined): string | null {
  if (!quantizationString) return null;
  const match = quantizationString.match(/\(([A-Za-z][\dA-Za-z_]+)\)\s*$/);
  if (!match) return null;
  // Must start with a known quant prefix
  if (/^[QqIiFf][\d_A-Za-z]+$/.test(match[1])) return match[1];
  return null;
}

/**
 * Strip a trailing quantization suffix from a label string.
 */
function stripQuantSuffix(quantizationString: string | null | undefined): string {
  if (!quantizationString) return "";
  return quantizationString.replace(/\s*\([A-Za-z][\dA-Za-z_]+\)\s*$/, "").trim();
}

/**
 * Parse a params string like "27B", "1.7B", "30B-A3B", "0.6B" into a number (in billions).
 */
function parseParams(paramsString: string | null | undefined): number {
  if (!paramsString) return 0;
  const match = paramsString.match(/([\d.]+)\s*[Bb]/);
  return match ? parseFloat(match[1]) : parseFloat(paramsString) || 0;
}

/**
 * Build a flat row object from a raw model, with sortable values as direct properties.
 * TableComponent can sort on these keys natively.
 */
function buildRow(rawModel: RawModel, favorites: string[] = []): RowData {
  const model = normalizeModel(rawModel);
  const favKey = `${model.provider}:${model.key}`;
  const row: RowData = {
    _raw: rawModel,
    _model: model,
    _favKey: favKey,
    model: model.key.toLowerCase(),
    name: model.name.toLowerCase(),
    provider: (resolveProviderLabel(model.provider) || "").toLowerCase(),
    year: rawModel.year || 0,
    context:
      rawModel.max_context_length ||
      rawModel.contextLength ||
      model.contextLength ||
      0,
    size: rawModel.size_bytes || parseSize(rawModel.size || model.size) || 0,
    params: parseParams(model.params),
    modelType: (model.modelType || "").toLowerCase(),
    quant: (model.quantization || "").toLowerCase(),
    bitsPerWeight: model.bitsPerWeight ?? 0,
    arch: (model.architecture || "").toLowerCase(),
    publisher: (model.publisher || "").toLowerCase(),
    input: rawModel.pricing?.inputPerMillion ?? Infinity,
    output: rawModel.pricing?.outputPerMillion ?? Infinity,
    favorite: favorites.includes(favKey) ? 1 : 0,
    tools: rawModel.tools?.length || 0,
    requests: rawModel.usageCount || 0,
    totalInputTokens: rawModel.totalInputTokens || 0,
    totalOutputTokens: rawModel.totalOutputTokens || 0,
    lastUsed: rawModel.lastUsed,
    // Benchmark config flags
    _benchThinking: rawModel._benchThinkingEnabled || false,
    _benchTools: rawModel._benchToolsEnabled || false,
    _benchAgent: rawModel._benchAgent || null,
  };
  // Arena columns
  for (const column of ARENA_COLUMNS) {
    row[column.key] = rawModel.arena?.[column.dataKey] ?? 0;
  }
  return row;
}

/* -- Stats mode helpers --------------------------------------- */

interface BuildStatsColumnsParams {
  configModels: Record<string, string[]>;
  totalRequests: number;
  totalCost: number;
  compact?: boolean;
}

export interface TableColumn<T = RowData> {
  key: string;
  label: React.ReactNode;
  description?: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  hideable?: boolean;
  defaultHidden?: boolean;
  width?: string;
  sortValue?: (row: T) => number | string;
  render?: (row: T) => React.ReactNode;
}

/**
 * Build stats-mode columns from tableColumns.js factories.
 * Used when mode="stats" — the same columns the old ModelsTableComponent used.
 */
function buildStatsColumns({
  configModels,
  totalRequests,
  totalCost,
  compact,
}: BuildStatsColumnsParams): TableColumn[] {
  const allColumns: TableColumn[] = [
    {
      key: "model",
      label: "Model",
      description: "The AI model identifier used for the request",
      render: (row: RowData) => (
        <BadgeComponent type="model" models={row.model ? [row.model] : []} />
      ),
    },
    requestsColumn() as TableColumn,
    usageColumn(totalRequests, "") as TableColumn,
    {
      key: "provider",
      label: "Provider",
      description: "The API provider hosting this model",
      render: (row: RowData) => (
        <BadgeComponent
          type="providers"
          providers={row.provider ? [row.provider] : []}
        />
      ),
    },
    statsModalitiesColumn() as TableColumn,
    statsToolsColumn({ configModels }) as TableColumn,
    ...(tokenColumns() as TableColumn[]),
    ...(costColumns(totalCost) as TableColumn[]),
    latencyColumn() as TableColumn,
    ...(countLinkColumns(
      "model",
      (row: { model?: string }) => row.model || "",
    ) as TableColumn[]),
  ];

  if (compact) {
    const COMPACT_KEYS = [
      "model",
      "totalRequests",
      "provider",
      "totalCost",
      "avgLatency",
    ];
    return allColumns.filter((column) => COMPACT_KEYS.includes(column.key));
  }
  return allColumns;
}

/**
 * ModelsTableComponent — unified model table supporting four display modes:
 *
 *   mode="model"     — Model specs: name, provider, modalities, tools, context, size,
 *                       params, quant, BPW, arch, publisher, pricing, arena scores.
 *                       Includes search, filters, favorites. (default)
 *
 *   mode="stats"     — Usage statistics: requests, usage, tokens, costs, latency,
 *                       sessions, conversations, workflows. Used on the admin dashboard.
 *
 *   mode="full"      — Combined: model columns + stats columns in a single table.
 *
 *   mode="benchmark" — Benchmark dashboard: model identity columns (Favorite, Name,
 *                       Model, Provider, Type, Modalities) + benchmark-specific
 *                       columns (Tests, Passed, Failed, Pass Rate, Avg Latency, Cost).
 *                       Other model columns are hidden by default but toggleable.
 */
export interface ModelsTableComponentProps {
  models?: RawModel[];
  mode?: "model" | "stats" | "full" | "benchmark";
  onSelect?: (model: RawModel) => void;
  renderActions?: (model: RawModel) => React.ReactNode;
  showSearch?: boolean;
  showProviderFilter?: boolean;
  favorites?: string[];
  onToggleFavorite?: (key: string) => void;
  activeRowKey?: string | null;
  highlightedRowKey?: string | null;
  highlightedRowRef?:
    | React.RefObject<HTMLTableRowElement | null>
    | ((element: HTMLTableRowElement | null) => void);
  loadingModelKey?: string | null;
  configModels?: Record<string, string[]>;
  totalRequests?: number;
  totalCost?: number;
  emptyText?: string;
  compact?: boolean;
  title?: string;
  maxHeight?: number;
  selectedKeys?: Set<string>;
  onToggleSelect?: (model: RawModel) => void;
  getRowClassName?: (row: RowData) => string;
}

export default function ModelsTableComponent({
  models = [],
  mode = "model",
  onSelect,
  renderActions,
  showSearch = true,
  showProviderFilter = true,
  favorites = [],
  onToggleFavorite,
  activeRowKey,
  highlightedRowKey,
  highlightedRowRef,
  loadingModelKey,
  configModels = {} as Record<string, string[]>,
  totalRequests: totalRequestsProp,
  totalCost: totalCostProp,
  emptyText,
  compact = false,
  title,
  maxHeight,
  selectedKeys,
  onToggleSelect,
  getRowClassName,
}: ModelsTableComponentProps) {
  /* -- Stats-only mode (simple passthrough) -- */
  if (mode === "stats") {
    const totalRequests =
      (totalRequestsProp ??
        models.reduce(
          (sum: number, model: RawModel) => sum + (model.totalRequests || 0),
          0,
        )) ||
      1;
    const totalCost =
      (totalCostProp ??
        models.reduce((sum: number, model: RawModel) => sum + (model.totalCost || 0), 0)) ||
      1;

    const columns = buildStatsColumns({
      configModels,
      totalRequests,
      totalCost,
      compact,
    });

    return (
      <TableComponent
        title={title || "Models"}
        maxHeight={maxHeight ?? 420}
        columns={columns as unknown as { key: string; label: string }[]}
        data={models}
        getRowKey={(model: RawModel, index: number) => `${model.provider}-${model.model}-${index}`}
        emptyText={emptyText || "No data yet"}
        storageKey="models-stats"
      />
    );
  }

  /* -- Model / Full / Benchmark modes (rich table with filters) -- */
  return (
    <ModelsTableInner
      models={models}
      mode={mode}
      onSelect={onSelect}
      renderActions={renderActions}
      showSearch={showSearch}
      showProviderFilter={showProviderFilter}
      favorites={favorites}
      onToggleFavorite={onToggleFavorite}
      activeRowKey={activeRowKey}
      highlightedRowKey={highlightedRowKey}
      highlightedRowRef={highlightedRowRef}
      loadingModelKey={loadingModelKey}
      configModels={configModels}
      totalRequests={totalRequestsProp}
      totalCost={totalCostProp}
      emptyText={emptyText}
      title={title}
      maxHeight={maxHeight}
      selectedKeys={selectedKeys}
      onToggleSelect={onToggleSelect}
      getRowClassName={getRowClassName}
    />
  );
}

/**
 * Inner component for model/full/benchmark modes — uses hooks so it must be a
 * proper component (can't conditionally call hooks in the parent).
 */
interface ModelsTableInnerProps {
  models: RawModel[];
  mode: "model" | "full" | "benchmark";
  onSelect?: (model: RawModel) => void;
  renderActions?: (model: RawModel) => React.ReactNode;
  showSearch?: boolean;
  showProviderFilter?: boolean;
  favorites: string[];
  onToggleFavorite?: (key: string) => void;
  activeRowKey?: string | null;
  highlightedRowKey?: string | null;
  highlightedRowRef?:
    | React.RefObject<HTMLTableRowElement | null>
    | ((element: HTMLTableRowElement | null) => void);
  loadingModelKey?: string | null;
  configModels?: Record<string, string[]>;
  totalRequests?: number;
  totalCost?: number;
  emptyText?: string;
  title?: string;
  maxHeight?: number;
  selectedKeys?: Set<string>;
  onToggleSelect?: (model: RawModel) => void;
  getRowClassName?: (row: RowData) => string;
}

function ModelsTableInner({
  models,
  mode,
  onSelect,
  renderActions,
  showSearch,
  showProviderFilter,
  favorites,
  onToggleFavorite,
  activeRowKey,
  highlightedRowKey,
  highlightedRowRef,
  loadingModelKey,
  emptyText,
  title,
  maxHeight,
  selectedKeys,
  onToggleSelect,
  getRowClassName: getRowClassNameProp,
}: ModelsTableInnerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set());
  const [activeModalities, setActiveModalities] = useState<Set<string>>(new Set());
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Discover all providers from models (ordered by PROVIDER_LABELS definition)
  const allProviders = useMemo(() => {
    const set = new Set<string>();
    for (const model of models) {
      const providerKey = normalizeModel(model).provider;
      if (providerKey) set.add(providerKey);
    }
    const labelOrder = Object.keys(PROVIDER_LABELS);
    return [...set].sort((itemA: string, itemB: string) => {
      const ai = labelOrder.indexOf(itemA);
      const bi = labelOrder.indexOf(itemB);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  }, [models]);

  // Discover all unique modalities from models (ordered by MODALITY_ICONS definition)
  const allModalities = useMemo(() => {
    const set = new Set<string>();
    for (const model of models) {
      for (const inputType of model.inputTypes || []) set.add(inputType);
      for (const outputType of model.outputTypes || []) set.add(outputType);
    }
    const iconOrder = Object.keys(MODALITY_ICONS);
    return [...set].sort((itemA: string, itemB: string) => {
      const ai = iconOrder.indexOf(itemA);
      const bi = iconOrder.indexOf(itemB);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  }, [models]);

  // Discover all unique tools from models (ordered by TOOL_ICONS definition)
  const allTools = useMemo(() => {
    const set = new Set<string>();
    for (const model of models) {
      for (const toolName of model.tools || []) set.add(toolName);
    }
    const iconOrder = Object.keys(TOOL_ICONS);
    return [...set].sort((itemA: string, itemB: string) => {
      const ai = iconOrder.indexOf(itemA);
      const bi = iconOrder.indexOf(itemB);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  }, [models]);

  // Apply favorites filter → modality filter → tool filter → provider filter → search
  const favFiltered = showFavoritesOnly
    ? models.filter((model: RawModel) => {
        const key = `${normalizeModel(model).provider}:${normalizeModel(model).key}`;
        return favorites.includes(key);
      })
    : models;

  const modalityFiltered = activeModalities.size > 0
    ? favFiltered.filter(
        (model: RawModel) =>
          (model.inputTypes || []).some((type) => activeModalities.has(type)) ||
          (model.outputTypes || []).some((type) => activeModalities.has(type)),
      )
    : favFiltered;

  const toolFiltered = activeTools.size > 0
    ? modalityFiltered.filter((model: RawModel) =>
        (model.tools || []).some((tool) => activeTools.has(tool)),
      )
    : modalityFiltered;

  const providerFiltered = activeProviders.size > 0
    ? toolFiltered.filter((model: RawModel) =>
        activeProviders.has(normalizeModel(model).provider),
      )
    : toolFiltered;

  const filtered = searchQuery.trim()
    ? providerFiltered.filter((model: RawModel) => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        const norm = normalizeModel(model);
        return (
          norm.key.toLowerCase().includes(normalizedSearch) ||
          norm.name.toLowerCase().includes(normalizedSearch) ||
          (norm.params || "").toLowerCase().includes(normalizedSearch) ||
          (resolveProviderLabel(norm.provider) || "")
            .toLowerCase()
            .includes(normalizedSearch)
        );
      })
    : providerFiltered;

  // Build flat row objects for TableComponent
  const tableData = useMemo(
    () => filtered.map((model: RawModel) => buildRow(model, favorites)),
    [filtered, favorites],
  );

  // Detect which optional columns have data
  const hasYear = filtered.some((model: RawModel) => model.year);
  const hasSize = filtered.some((model: RawModel) => normalizeModel(model).size);
  const hasParams = filtered.some((model: RawModel) => normalizeModel(model).params);
  const hasContext = filtered.some(
    (model: RawModel) => normalizeModel(model).contextLength,
  );
  const hasQuant = filtered.some(
    (model: RawModel) => normalizeModel(model).quantization,
  );
  const hasBitsPerWeight = filtered.some(
    (model: RawModel) => normalizeModel(model).bitsPerWeight != null,
  );
  const hasArch = filtered.some(
    (model: RawModel) => normalizeModel(model).architecture,
  );
  const hasPublisher = filtered.some(
    (model: RawModel) => normalizeModel(model).publisher,
  );
  const hasInputPrice = filtered.some(
    (model: RawModel) => model.pricing?.inputPerMillion != null,
  );
  const hasOutputPrice = filtered.some(
    (model: RawModel) => model.pricing?.outputPerMillion != null,
  );
  const hasModalities = filtered.some(
    (model: RawModel) =>
      (model.inputTypes?.length ?? 0) > 0 || (model.outputTypes?.length ?? 0) > 0,
  );
  const hasTools = filtered.some((model: RawModel) => (model.tools?.length ?? 0) > 0);
  const hasModelType = filtered.some(
    (model: RawModel) => normalizeModel(model).modelType,
  );
  const hasUsage = filtered.some((model: RawModel) => (model.usageCount ?? 0) > 0);
  const hasTokens = filtered.some(
    (model: RawModel) => (model.totalInputTokens || 0) + (model.totalOutputTokens || 0) > 0,
  );
  const hasLastUsed = filtered.some((model: RawModel) => model.lastUsed != null);
  const hasActions = !!renderActions;
  const hasSelection = !!selectedKeys && !!onToggleSelect;
  const isFull = mode === "full";
  const isBenchmark = mode === "benchmark";

  const arenaColumns = ARENA_COLUMNS.filter((column) =>
    filtered.some((model: RawModel) => model.arena && model.arena[column.dataKey] != null),
  );

  // Build dynamic columns array for TableComponent
  // Memoize select-all handler
  const handleSelectAll = useCallback(() => {
    if (!onToggleSelect || !selectedKeys) return;
    // Check if all currently visible/filtered models are selected
    const allSelected =
      filtered.length > 0 &&
      filtered.every((model: RawModel) => {
        const key = `${normalizeModel(model).provider}:${normalizeModel(model).key}`;
        return selectedKeys.has(key);
      });
    // Toggle: if all selected, deselect all visible; otherwise select all visible
    for (const model of filtered) {
      const key = `${normalizeModel(model).provider}:${normalizeModel(model).key}`;
      if (allSelected) {
        // Only deselect if currently selected
        if (selectedKeys.has(key)) onToggleSelect(model);
      } else {
        // Only select if not already selected
        if (!selectedKeys.has(key)) onToggleSelect(model);
      }
    }
  }, [filtered, selectedKeys, onToggleSelect]);

  const columns = useMemo(() => {
    const cols: TableColumn[] = [];
    // In benchmark mode, non-core model-spec columns default to hidden
    const benchmarkHide = isBenchmark ? { defaultHidden: true } : {};

    // 0. SELECTION — checkbox column (non-hideable, non-sortable)
    if (hasSelection && selectedKeys) {
      const allSelected =
        filtered.length > 0 &&
        filtered.every((model: RawModel) => {
          const key = `${normalizeModel(model).provider}:${normalizeModel(model).key}`;
          return selectedKeys.has(key);
        });
      const someSelected =
        !allSelected &&
        filtered.some((model: RawModel) => {
          const key = `${normalizeModel(model).provider}:${normalizeModel(model).key}`;
          return selectedKeys.has(key);
        });

      cols.push({
        key: "_select",
        label: (
          <span
            className={`${styles['select-wrap']} ${allSelected ? styles['select-wrap-is-active-state'] : ""}`}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleSelectAll();
            }}
          >
            {allSelected ? (
              <CheckSquare2 size={14} className={styles['select-check']} />
            ) : someSelected ? (
              <CheckSquare2 size={14} className={styles['select-partial']} />
            ) : (
              <Square size={14} className={styles['select-box']} />
            )}
          </span>
        ),
        description: allSelected
          ? "Deselect all visible models"
          : "Select all visible models",
        align: "center",
        sortable: false,
        hideable: false,
        render: (row: RowData) => {
          const key = `${row._model.provider}:${row._model.key}`;
          const isSelected = selectedKeys.has(key);
          return (
            <span
              className={`${styles['select-wrap']} ${isSelected ? styles['select-wrap-is-active-state'] : ""}`}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onToggleSelect(row._raw);
              }}
            >
              {isSelected ? (
                <CheckSquare2 size={14} className={styles['select-check']} />
              ) : (
                <Square size={14} className={styles['select-box']} />
              )}
            </span>
          );
        },
      });
    }

    // -- Benchmark priority columns (Pass Rate, Passed, Failed) --
    if (isBenchmark) {
      cols.push({
        key: "benchPassRate",
        label: "Pass Rate",
        description: "Percentage of benchmark tests this model passed",
        sortable: true,
        width: "100px",
        sortValue: (row: RowData) => row._raw._benchPassRate || 0,
        render: (row: RowData) => {
          const percentage = Math.round((row._raw._benchPassRate || 0) * 100);
          const color =
            percentage >= 80
              ? "var(--color-success)"
              : percentage >= 50
                ? "var(--color-warning)"
                : "var(--color-danger)";
          return (
            <span className={styles['bench-rate-cell']}>
              <span className={styles['bench-rate-bar']}>
                <span
                  className={styles['bench-rate-bar-fill']}
                  style={{ width: `${percentage}%`, background: color }}
                />
              </span>
              <span className={styles['bench-rate-value']} style={{ color }}>
                {percentage}%
              </span>
            </span>
          );
        },
      });
      cols.push({
        key: "benchPassed",
        label: "Pass",
        description: "Number of benchmark tests this model passed",
        sortable: true,
        align: "right",
        sortValue: (row: RowData) => row._raw._benchPassed || 0,
        render: (row: RowData) => (
          <span className={styles['bench-passed-cell']}>
            <CheckCircle2 size={12} />
            {row._raw._benchPassed || 0}
          </span>
        ),
      });
      cols.push({
        key: "benchFailed",
        label: "Fail",
        description: "Number of benchmark tests this model failed or errored",
        sortable: true,
        align: "right",
        sortValue: (row: RowData) =>
          (row._raw._benchFailed || 0) + (row._raw._benchErrored || 0),
        render: (row: RowData) => (
          <span className={styles['bench-failed-cell']}>
            <XCircle size={12} />
            {(row._raw._benchFailed || 0) + (row._raw._benchErrored || 0)}
          </span>
        ),
      });
    }

    // 1. FAVORITE — sortable star toggle
    cols.push({
      key: "favorite",
      label: "★",
      description: "Star models to pin them to the top of your list",
      align: "center",
      sortable: true,
      render: (row: RowData) => {
        const isFav = favorites.includes(row._favKey);
        if (!onToggleFavorite) return "—";
        return (
          <span
            className={styles['favorite-wrapper']}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onToggleFavorite(row._favKey);
            }}
          >
            <Star
              size={14}
              className={`${styles['favorite-star']} ${isFav ? styles['favorite-star-is-active-state'] : ""}`}
              fill={isFav ? "currentColor" : "none"}
            />
          </span>
        );
      },
    });

    // 2. TYPE — Agent vs Model badge (benchmark mode only)
    if (isBenchmark) {
      cols.push({
        key: "benchType",
        label: "Type",
        description:
          "Whether this entry is a direct model call or an agentic run",
        sortable: true,
        align: "center",
        sortValue: (row: RowData) => (row._benchAgent ? 1 : 0),
        render: (row: RowData) => {
          if (row._benchAgent) {
            return (
              <span className={styles['bench-agent-badge']}>
                <Bot size={12} />
                Agent
              </span>
            );
          }
          return <span className={styles['bench-model-badge']}>Model</span>;
        },
      });
    }

    // 3. NAME — provider icon + display name + loaded badge + actions
    cols.push({
      key: "name",
      label: "Name",
      description: "Display name of the model",
      align: "left",
      sortValue: (row: RowData) => row._model.name.toLowerCase(),
      render: (row: RowData) => {
        const model = row._model;
        const rawModel = row._raw;
        return (
          <span className={styles['name-layout-row']}>
            <ProviderLogo provider={model.provider} size={16} />
            <span className={styles['model-name']}>{model.name}</span>
            {model.provider === "lm-studio" && model.isLoaded && (
              <span className={styles['loaded-badge']}>
                <span
                  className={`${styles['status-dot']} ${styles['is-active-state']}`}
                />
                Loaded
              </span>
            )}
            {model.provider === "lm-studio" &&
              !model.isLoaded &&
              loadingModelKey === model.key && (
                <span className={styles['is-loading-state-badge']}>
                  <Loader2 size={9} className={styles['is-loading-state-spin']} />
                  Loading
                </span>
              )}
            {hasActions && (
              <span
                className={styles['inline-actions']}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                {renderActions(rawModel)}
              </span>
            )}
          </span>
        );
      },
    });

    // 5. MODEL — model key (monospace identifier)
    cols.push({
      key: "model",
      label: "Model",
      description: "Unique model identifier used in API calls",
      align: "left",
      render: (row: RowData) => (
        <BadgeComponent type="model" models={[row._model.key]} />
      ),
    });

    // 6. PROVIDER — provider badge
    cols.push({
      key: "provider",
      label: "Provider",
      description: "The API provider hosting this model",
      align: "left",
      sortValue: (row: RowData) =>
        (resolveProviderLabel(row._model.provider) || "").toLowerCase(),
      render: (row: RowData) => (
        <BadgeComponent type="providers" providers={[row._model.provider]} />
      ),
    });

    // 7. TYPE — model type badge (conversation / audio / embed)
    if (hasModelType) {
      cols.push({
        key: "modelType",
        label: "Type",
        description:
          "Endpoint-based model category: conversation, audio, or embed",
        align: "left",
        render: (row: RowData) => (
          <BadgeComponent
            type="model-type"
            modelType={row._model.modelType || undefined}
          />
        ),
      });
    }

    if (hasYear) {
      cols.push({
        key: "year",
        label: "Year",
        description: "Release year of this model",
        align: "right",
        render: (row: RowData) => row._raw.year || "—",
        ...benchmarkHide,
      });
    }

    // -- Benchmark config columns (Thinking, Tools) --
    if (isBenchmark) {
      cols.push({
        key: "benchThinking",
        label: "Thinking",
        description: "Whether thinking/reasoning mode was enabled for this run",
        sortable: true,
        align: "center",
        sortValue: (row: RowData) => (row._benchThinking ? 1 : 0),
        render: (row: RowData) =>
          row._benchThinking ? (
            <span className={styles['bench-thinking-on']}>
              <Brain size={12} /> On
            </span>
          ) : (
            <span className={styles['bench-flag-off']}>—</span>
          ),
      });
      cols.push({
        key: "benchToolsEnabled",
        label: "Tools",
        description: "Whether tool calling was enabled for this run",
        sortable: true,
        align: "center",
        sortValue: (row: RowData) => (row._benchTools ? 1 : 0),
        render: (row: RowData) =>
          row._benchTools ? (
            <span className={styles['bench-tools-on']}>
              <Wrench size={12} /> On
            </span>
          ) : (
            <span className={styles['bench-flag-off']}>—</span>
          ),
      });
    }

    // -- Benchmark remaining columns (Tests, Avg Latency, Cost) --
    if (isBenchmark) {
      cols.push({
        key: "benchTests",
        label: "Tests",
        description: "Total number of benchmark tests run for this model",
        sortable: true,
        align: "right",
        sortValue: (row: RowData) => row._raw._benchTotal || 0,
        render: (row: RowData) => {
          const sortValue = row._raw._benchTotal || 0;
          return sortValue > 0 ? formatNumber(sortValue) : "—";
        },
      });
      cols.push({
        key: "benchAvgLatency",
        label: "Avg Latency",
        description: "Average response latency across all benchmark tests",
        sortable: true,
        align: "right",
        sortValue: (row: RowData) => row._raw._benchAvgLatency || 0,
        render: (row: RowData) => {
          const sortValue = row._raw._benchAvgLatency;
          if (!sortValue || sortValue <= 0) return emptyDash();
          return (
            <span className={styles['bench-latency-cell']}>
              <Clock size={12} />
              {sortValue.toFixed(1)}s
            </span>
          );
        },
      });
      cols.push({
        key: "benchCost",
        label: "Cost",
        description:
          "Total estimated cost across all benchmark tests for this model",
        sortable: true,
        align: "right",
        sortValue: (row: RowData) => row._raw._benchTotalCost || 0,
        render: (row: RowData) => {
          const sortValue = row._raw._benchTotalCost;
          return sortValue != null && sortValue > 0 ? (
            <BadgeComponent type="cost" cost={sortValue} />
          ) : (
            emptyDash()
          );
        },
      });
    }

    // -- Stats columns (full mode only) --
    if (isFull && hasUsage) {
      const usageTotal =
        filtered.reduce(
          (sum: number, model: RawModel) => sum + (model.usageCount || 0),
          0,
        ) || 1;
      cols.push({
        key: "requests",
        label: "Requests",
        description: "Total API requests made with this model",
        align: "right",
        sortValue: (row: RowData) => row._raw.usageCount || 0,
        render: (row: RowData) => {
          const count = row._raw.usageCount || 0;
          return count > 0 ? formatNumber(count) : "—";
        },
      });
      cols.push({
        key: "usagePct",
        label: "Usage %",
        description: "Proportional share of total requests",
        sortValue: (row: RowData) => row._raw.usageCount || 0,
        render: (row: RowData) => (
          <ProportionBarComponent
            value={row._raw.usageCount || 0}
            total={usageTotal}
          />
        ),
      });
    }

    if (hasUsage && !isFull) {
      const usageTotal =
        filtered.reduce(
          (sum: number, model: RawModel) => sum + (model.usageCount || 0),
          0,
        ) || 1;
      cols.push({
        key: "requests",
        label: "Requests",
        description: "Total API requests made with this model",
        align: "right",
        sortValue: (row: RowData) => row._raw.usageCount || 0,
        render: (row: RowData) => {
          const count = row._raw.usageCount || 0;
          return count > 0 ? formatNumber(count) : "—";
        },
      });
      cols.push({
        key: "usagePct",
        label: "Usage %",
        description: "Proportional share of total requests",
        sortValue: (row: RowData) => row._raw.usageCount || 0,
        render: (row: RowData) => (
          <ProportionBarComponent
            value={row._raw.usageCount || 0}
            total={usageTotal}
          />
        ),
      });
    }

    if (hasLastUsed) {
      cols.push({
        key: "lastUsed",
        label: "Last Used",
        description: "The last time this model was used by the current user",
        align: "left",
        sortable: true,
        sortValue: (row: RowData) => {
          const timestamp = row._raw.lastUsed;
          if (!timestamp) return 0;
          return new Date(timestamp).getTime();
        },
        render: (row: RowData) => {
          const timestamp = row._raw.lastUsed;
          if (!timestamp) return "—";
          return (
            <BadgeComponent
              type="dateTime"
              date={timestamp}
              relative
              highlightNew
            />
          );
        },
      });
    }

    if (hasTokens) {
      cols.push({
        key: "totalInputTokens",
        label: "Tokens In",
        description: "Total input (prompt) tokens consumed",
        align: "right",
        render: (row: RowData) => {
          const sortValue = row._raw.totalInputTokens || 0;
          return sortValue > 0 ? (
            <BadgeComponent type="tokens" value={sortValue} label="in" mini />
          ) : (
            "—"
          );
        },
      });
      cols.push({
        key: "totalOutputTokens",
        label: "Tokens Out",
        description: "Total output (completion) tokens generated",
        align: "right",
        render: (row: RowData) => {
          const sortValue = row._raw.totalOutputTokens || 0;
          return sortValue > 0 ? (
            <BadgeComponent type="tokens" value={sortValue} label="out" mini />
          ) : (
            "—"
          );
        },
      });
      cols.push({
        key: "totalTokens",
        label: "Tokens",
        description: "Combined input + output token count",
        align: "right",
        sortValue: (row: RowData) =>
          (row._raw.totalInputTokens || 0) + (row._raw.totalOutputTokens || 0),
        render: (row: RowData) => {
          const total =
            (row._raw.totalInputTokens || 0) +
            (row._raw.totalOutputTokens || 0);
          return total > 0 ? formatTokenCount(total) : "—";
        },
      });
    }

    if (hasModalities) {
      cols.push({
        key: "modalities",
        label: "Modalities",
        description: "Input/output types supported (text, image, audio, video)",
        sortable: false,
        render: (row: RowData) => (
          <ModalityCell
            inputTypes={row._raw.inputTypes}
            outputTypes={row._raw.outputTypes}
          />
        ),
      });
    }

    if (hasTools) {
      cols.push({
        key: "tools",
        label: "Tools",
        description: "Capabilities like thinking, web search, code execution",
        align: "left",
        ...benchmarkHide,
        render: (row: RowData) => {
          const tools = row._raw.tools;
          if (!tools?.length) return "—";
          return <ToolIconComponent toolDisplayNames={tools} />;
        },
      });
    }

    if (hasContext) {
      cols.push({
        key: "context",
        label: "Context",
        description: "Maximum context window size in tokens",
        align: "right",
        ...benchmarkHide,
        render: (row: RowData) =>
          row._model.contextLength
            ? formatContextTokens(row._model.contextLength)
            : "—",
      });
    }

    if (hasSize) {
      cols.push({
        key: "size",
        label: "Size",
        description: "Model file size on disk",
        align: "right",
        ...benchmarkHide,
        render: (row: RowData) => row._model.size || "—",
      });
    }

    if (hasParams) {
      cols.push({
        key: "params",
        label: "Params",
        description: "Total parameter count (e.g. 7B, 70B)",
        align: "right",
        ...benchmarkHide,
        render: (row: RowData) => row._model.params || "—",
      });
    }

    if (hasQuant) {
      cols.push({
        key: "quant",
        label: "Quant",
        description: "Quantization method (e.g. Q4_K_M, Q8_0)",
        align: "right",
        ...benchmarkHide,
        render: (row: RowData) => row._model.quantization || "—",
      });
    }

    if (hasBitsPerWeight) {
      cols.push({
        key: "bitsPerWeight",
        label: "BPW",
        description: "Bits per weight — lower means more compression",
        align: "right",
        ...benchmarkHide,
        render: (row: RowData) =>
          row._model.bitsPerWeight != null ? row._model.bitsPerWeight : "—",
      });
    }

    if (hasArch) {
      cols.push({
        key: "arch",
        label: "Arch",
        description: "Model architecture (e.g. LLaMA, Mistral, Qwen)",
        ...benchmarkHide,
        render: (row: RowData) => row._model.architecture || "—",
      });
    }

    if (hasPublisher) {
      cols.push({
        key: "publisher",
        label: "Publisher",
        description: "Organization that published the model weights",
        align: "left",
        ...benchmarkHide,
        render: (row: RowData) => row._model.publisher || "—",
      });
    }

    if (hasInputPrice) {
      cols.push({
        key: "input",
        label: "Input",
        description: "Cost per million input tokens (USD)",
        align: "right",
        ...benchmarkHide,
        render: (row: RowData) =>
          row._raw.pricing?.inputPerMillion != null ? (
            <BadgeComponent
              type="cost"
              cost={row._raw.pricing.inputPerMillion}
              mini
              showIcon={false}
              formatFn={formatPricingRate}
            />
          ) : (
            "—"
          ),
      });
    }

    if (hasOutputPrice) {
      cols.push({
        key: "output",
        label: "Output",
        description: "Cost per million output tokens (USD)",
        align: "right",
        ...benchmarkHide,
        render: (row: RowData) =>
          row._raw.pricing?.outputPerMillion != null ? (
            <BadgeComponent
              type="cost"
              cost={row._raw.pricing.outputPerMillion}
              mini
              showIcon={false}
              formatFn={formatPricingRate}
            />
          ) : (
            "—"
          ),
      });
    }

    // -- Full mode: add cost & latency from stats --
    if (isFull) {
      cols.push({
        key: "totalCost",
        label: "Cost",
        description: "Total estimated cost in USD",
        align: "right",
        sortValue: (row: RowData) => row._raw.totalCost || 0,
        render: (row: RowData) => {
          const cost = row._raw.totalCost;
          return typeof cost === "number" && cost > 0 ? (
            <BadgeComponent type="cost" cost={cost} />
          ) : (
            emptyDash()
          );
        },
      });
      cols.push({
        key: "avgLatency",
        label: "Avg Latency",
        description: "Average round-trip response time",
        align: "right",
        sortValue: (row: RowData) => row._raw.avgLatency || 0,
        render: (row: RowData) => {
          const sortValue = row._raw.avgLatency;
          return typeof sortValue === "number" && sortValue > 0
            ? formatLatency(sortValue)
            : emptyDash();
        },
      });
      cols.push({
        key: "avgTokensPerSec",
        label: "Tok/s",
        description: "Average output throughput in tokens per second",
        align: "right",
        render: (row: RowData) => formatTokensPerSec(row._raw.avgTokensPerSec),
      });
    }

    if (!isBenchmark) {
      for (const arenaColumn of arenaColumns) {
        cols.push({
          key: arenaColumn.key,
          label: arenaColumn.label,
          description: `LMArena ${arenaColumn.label} benchmark ELO score`,
          align: "right",
          render: (row: RowData) => row._raw.arena?.[arenaColumn.dataKey] ?? "—",
        });
      }
    }

    return cols;
  }, [
    onToggleFavorite,
    favorites,
    filtered,
    hasYear,
    hasModelType,
    hasUsage,
    hasTokens,
    hasLastUsed,
    hasModalities,
    hasTools,
    hasContext,
    hasSize,
    hasParams,
    hasQuant,
    hasBitsPerWeight,
    hasArch,
    hasPublisher,
    hasInputPrice,
    hasOutputPrice,
    hasActions,
    hasSelection,
    selectedKeys,
    onToggleSelect,
    handleSelectAll,
    renderActions,
    arenaColumns,
    loadingModelKey,
    isFull,
    isBenchmark,
  ]);

  return (
    <div className={`models-table-component ${styles['container']}`}>
      {showSearch && (
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search models…"
          compact
          className={styles['search-wrapper']}
        />
      )}

      <FilterDropdownComponent
        groups={[
          ...(onToggleFavorite && favorites.length > 0
            ? [
                {
                  label: "Favorites",
                  items: [
                    {
                      key: "favorites",
                      icon: Star,
                      title: "Favorites Only",
                      color: "#f59e0b",
                    },
                  ],
                  activeKeys: showFavoritesOnly ? "favorites" : null,
                  isSingleSelect: true,
                  onToggle: () =>
                    setShowFavoritesOnly((previousFavoritesOnly: boolean) => !previousFavoritesOnly),
                },
              ]
            : []),
          ...(allModalities.length >= 2
            ? [
                {
                  label: "Modality",
                  items: allModalities
                    .map((modality: string) => {
                      const modalityEntry = (
                        MODALITY_ICONS as Record<
                          string,
                          { icon: React.ElementType; label: string }
                        >
                      )[modality];
                      return modalityEntry
                        ? {
                            key: modality,
                            icon: modalityEntry.icon as React.ComponentType<{ size?: number; className?: string }>,
                            color: (
                              MODALITY_COLORS as Record<string, string>
                            )[modality],
                            title: modalityEntry.label,
                          }
                        : null;
                    })
                    .filter(
                      (item): item is NonNullable<typeof item> =>
                        item !== null,
                    ),
                  activeKeys: activeModalities,
                  onToggle: (key: string | null) => {
                    if (!key) return;
                    setActiveModalities((previousModalities) => {
                      const nextModalities = new Set(previousModalities);
                      nextModalities.has(key) ? nextModalities.delete(key) : nextModalities.add(key);
                      return nextModalities;
                    });
                  },
                },
              ]
            : []),
          ...(allTools.length >= 2
            ? [
                {
                  label: "Tools",
                  items: allTools
                    .map((toolName: string) => {
                      const Icon = (
                        TOOL_ICONS as Record<string, React.ElementType>
                      )[toolName];
                      return Icon
                        ? {
                            key: toolName,
                            icon: Icon as React.ComponentType<{ size?: number; className?: string }>,
                            color: (TOOL_COLORS as Record<string, string>)[toolName],
                            title: toolName,
                          }
                        : null;
                    })
                    .filter(
                      (item): item is NonNullable<typeof item> =>
                        item !== null,
                    ),
                  activeKeys: activeTools,
                  onToggle: (key: string | null) => {
                    if (!key) return;
                    setActiveTools((previousTools) => {
                      const nextTools = new Set(previousTools);
                      nextTools.has(key) ? nextTools.delete(key) : nextTools.add(key);
                      return nextTools;
                    });
                  },
                },
              ]
            : []),
          ...(showProviderFilter && allProviders.length >= 2
            ? [
                {
                  label: "Providers",
                  items: allProviders.map((provider: string) => ({
                    key: provider,
                    icon: () => <ProviderLogo provider={provider} size={13} />,
                    title: resolveProviderLabel(provider),
                  })),
                  activeKeys: activeProviders,
                  onToggle: (key: string | null) => {
                    if (!key) return;
                    setActiveProviders((previousProviders) => {
                      const nextProviders = new Set(previousProviders);
                      nextProviders.has(key) ? nextProviders.delete(key) : nextProviders.add(key);
                      return nextProviders;
                    });
                  },
                },
              ]
            : []),
        ]}
      />

      <TableComponent
        title={title}
        maxHeight={maxHeight}
        columns={columns as unknown as { key: string; label: string }[]}
        data={tableData}
        getRowKey={(row: RowData) => {
          if (isBenchmark) {
            // Composite key: same model with different thinking/tools/agent configs must be separate rows
            const thinkingTag = row._benchThinking ? "T" : "";
            const toolsTag = row._benchTools ? "F" : "";
            const agentTag = row._benchAgent || "";
            return `${row._model.provider}-${row._model.key}-${thinkingTag}${toolsTag}${agentTag}`;
          }
          return `${row._model.provider}-${row._model.key}`;
        }}
        onRowClick={
          onSelect
            ? (row: RowData) =>
                onSelect(
                  (isBenchmark ? (row._raw._benchStat as RawModel) : row._raw),
                )
            : undefined
        }
        emptyText={
          emptyText ||
          (searchQuery.trim() ? "No matching models" : "No models found")
        }
        activeRowKey={activeRowKey}
        highlightedRowKey={highlightedRowKey}
        highlightedRowRef={highlightedRowRef as React.RefObject<HTMLTableRowElement | null>}
        storageKey={isBenchmark ? "models-benchmark" : "models"}
        getRowClassName={
          getRowClassNameProp
            ? (row: RowData) =>
                getRowClassNameProp(
                  isBenchmark ? (row._raw._benchStat as RowData) : row,
                )
            : hasSelection && selectedKeys
              ? (row: RowData) => {
                  const key = `${row._model.provider}:${row._model.key}`;
                  return selectedKeys.has(key) ? styles['selected-layout-row'] : "";
                }
              : undefined
        }
      />
    </div>
  );
}
