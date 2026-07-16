"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Copy,
  Coins,
  Loader2,
  Pencil,
  Square,
  Trash2,
  Hash,
  CircleCheck,
  CircleX,
  Columns3,
  Repeat,
  Wrench,
} from "lucide-react";
import PrismService from "../services/PrismService";
import ThreePanelLayout from "./ThreePanelLayoutComponent";
import RunHistorySidebarComponent from "./RunHistorySidebarComponent";
import {
  ButtonComponent,
  IconButtonComponent,
  EmptyStateComponent,
  ModalComponent,
  SelectComponent,
  TooltipComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";

import BenchmarkFormComponent, {
  INITIAL_BENCHMARK_FORM,
  benchmarkToFormState,
  type BenchmarkFormState,
} from "./BenchmarkFormComponent";
import SummaryBarComponent from "./SummaryBarComponent";
import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import AgentPickerComponent from "./AgentPickerComponent";
import BenchmarksTableComponent from "./BenchmarksTableComponent";
import ChatPreviewComponent from "./ChatPreviewComponent";
import BenchmarkAssertionReportComponent from "./BenchmarkAssertionReportComponent";
import BenchmarkCompareComponent from "./BenchmarkCompareComponent";
import {
  buildBenchmarkPayload,
  isBenchmarkFormValid,
} from "../utils/benchmarkForm";
import {
  describeAgentAssertion,
  describeTextAssertion,
} from "../utils/benchmarkAssertions";

import StorageService from "../services/StorageService";
import { STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, AGENT_IDS, EXECUTION_STATUS, MESSAGE_ROLES } from "../constants";
import { formatCost, generateUUID } from "@rodrigo-barraza/utilities-library";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./BenchmarkPageComponent.module.css";
import type { ReactNode } from "react";
import type {
  Benchmark,
  BenchmarkRun,
  BenchmarkRunResult,
  AgentPersona,
  PrismConfig,
  ModelOption,
  ToolCallEvent,
  SSECallbacks,
  SSEData,
  Message,
  ModelInstance,
  AgentInstance,
  ModelOptionWithProvider,
} from "../types/types";
import { type ClientAgent } from "./BadgeComponent";

/** Per-model accumulated live data during streaming */
interface LiveModelData {
  text: string;
  thinking: string;
  toolCalls: Array<{
    id?: string;
    name?: string;
    args?: unknown;
    status?: string;
    result?: unknown;
  }>;
}

/** Benchmark run target shape */
interface BenchmarkTarget {
  provider: string;
  model: string;
  display_name?: string;
  thinkingEnabled?: boolean;
  toolsEnabled?: boolean;
  agent?: string;
}

/** localStorage shape for benchmark storage */
interface BenchmarkStorage {
  selectedKeys?: string[];
  instances?: ModelInstance[];
  thinkingMap?: Record<string, boolean>;
  toolsMap?: Record<string, boolean>;
  agents?: AgentInstance[];
}

const TRIAL_OPTIONS = [1, 2, 3, 5, 10].map((count) => ({
  value: String(count),
  label: count === 1 ? "1 trial" : `${count} trials`,
}));

/**
 * Flatten config into a flat array for deriving selectedModels and modelConfigMap.
 */
function flattenAllModels(
  config: PrismConfig | null,
): ModelOptionWithProvider[] {
  if (!config) return [];
  const seen = new Map<string, ModelOptionWithProvider>();
  const sections = ["textToText", "textToImage", "audioToText", "textToSpeech"];
  for (const key of sections) {
    const modelsMap =
      (config[key as keyof PrismConfig] as Record<string, unknown>)?.models ||
      {};
    for (const [provider, models] of Object.entries(
      modelsMap as Record<string, ModelOption[]>,
    )) {
      for (const model of models) {
        const id = `${provider}:${model.name}`;
        if (!seen.has(id)) seen.set(id, { ...model, provider });
      }
    }
  }
  return [...seen.values()];
}

/**
 * Resolve the model key for incoming content events during concurrent execution.
 * If the event carries a `_sourceModel` tag (provider + model), use that directly.
 * Otherwise fall back to the last active key in the live data map.
 */
function resolveModelKeyForContent(
  liveDataMap: Map<string, LiveModelData>,
  sourceModel:
    | string
    | { provider?: string; model?: string }
    | null
    | undefined,
) {
  // Prefer explicit source tag (set by backend for concurrent benchmark runs)
  if (
    typeof sourceModel === "object" &&
    sourceModel?.provider &&
    sourceModel?.model
  ) {
    const key = `${sourceModel.provider}:${sourceModel.model}`;
    if (liveDataMap.has(key)) return key;
  } else if (typeof sourceModel === "string" && sourceModel.includes(":")) {
    // String format: "provider:model"
    if (liveDataMap.has(sourceModel)) return sourceModel;
  }
  // Fallback: last key in the map (most recently started model)
  let lastKey = null;
  for (const key of liveDataMap.keys()) lastKey = key;
  return lastKey;
}

interface BenchmarkDetailPageComponentProps {
  benchmarkId: string | string[] | undefined;
  onRunningChange?: (_running: boolean) => void;
  navSidebar?: ReactNode;
  rightSidebar?: ReactNode;
}

export default function BenchmarkDetailPageComponent({
  benchmarkId: benchmarkIdProp,
  onRunningChange,
  navSidebar,
  rightSidebar,
}: BenchmarkDetailPageComponentProps) {
  const benchmarkId = Array.isArray(benchmarkIdProp)
    ? benchmarkIdProp[0]
    : benchmarkIdProp || "";
  const router = useRouter();
  // -- State --------------------------------------------------
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestRun, setLatestRun] = useState<BenchmarkRun | null>(null);
  const [runHistory, setRunHistory] = useState<BenchmarkRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"clone" | "edit" | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<BenchmarkFormState>(INITIAL_BENCHMARK_FORM);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  // Trials per target for the next run (seeded from the benchmark's default)
  const [trials, setTrials] = useState(1);

  // Propagate running state to parent for sidebar animation
  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  // Model selection — instance-based: each entry has a unique instanceId
  // so the same model can be selected multiple times with different settings.
  const [prismConfig, setPrismConfig] = useState<PrismConfig | null>(null);
  const [selectedInstances, setSelectedInstances] = useState<ModelInstance[]>(
    () => {
      const saved = StorageService.get<BenchmarkStorage>(
        STORAGE_KEY_MODEL_MEMORY_BENCHMARKS,
      );
      if (saved?.instances && Array.isArray(saved.instances)) {
        return saved.instances;
      }
      return [];
    },
  );
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  // Available agent personas (fetched dynamically)
  const [availableAgents, setAvailableAgents] = useState<AgentPersona[]>([]);

  // Selected result (for chat preview)
  const [selectedResult, setSelectedResult] =
    useState<BenchmarkRunResult | null>(null);

  // Per-model thinking toggle: Map<instanceId, boolean>
  const [thinkingMap, setThinkingMap] = useState<Record<string, boolean>>(
    () => {
      const saved = StorageService.get<BenchmarkStorage>(
        STORAGE_KEY_MODEL_MEMORY_BENCHMARKS,
      );
      return saved?.thinkingMap && typeof saved.thinkingMap === "object"
        ? saved.thinkingMap
        : {};
    },
  );
  const [toolsMap, setToolsMap] = useState<Record<string, boolean>>(() => {
    const saved = StorageService.get<BenchmarkStorage>(
      STORAGE_KEY_MODEL_MEMORY_BENCHMARKS,
    );
    return saved?.toolsMap && typeof saved.toolsMap === "object"
      ? saved.toolsMap
      : {};
  });

  // Agent instances — same instance-based pattern as models
  const [agentInstances, setAgentInstances] = useState<AgentInstance[]>(() => {
    const saved = StorageService.get<BenchmarkStorage>(
      STORAGE_KEY_MODEL_MEMORY_BENCHMARKS,
    );
    if (saved?.agents && Array.isArray(saved.agents)) {
      return saved.agents;
    }
    return [];
  });

  // Compute the active row key for table highlight
  const getActiveKey = useCallback(
    (results: BenchmarkRunResult[]) => {
      if (!selectedResult) return undefined;
      const index = results.indexOf(selectedResult);
      if (index === -1) return undefined;
      return `${selectedResult.provider}:${selectedResult.label || selectedResult.model}:${index}`;
    },
    [selectedResult],
  );

  // Smart row click: running rows switch the live preview, completed rows set selectedResult
  const handleStreamingRowClick = useCallback(
    (row: BenchmarkRunResult & { _running?: boolean; _pending?: boolean; _progress?: number; _phase?: string }) => {
      if (row._running) {
        // Switch live preview to this model
        const key = `${row.provider}:${row.model}`;
        // eslint-disable-next-line react-hooks/immutability -- existing mutation pattern outside render tracking; restructuring risks behavior change
        setViewedModelKey(key);
        setSelectedResult(null);
        // Immediately flush this model's accumulated data so the preview updates instantly
        const benchmarkData = liveDataRef.current.get(key);
        if (benchmarkData) {
          // eslint-disable-next-line react-hooks/immutability -- existing mutation pattern outside render tracking; restructuring risks behavior change
          setLiveSnapshot({
            text: benchmarkData.text,
            thinking: benchmarkData.thinking,
            toolCalls: [...benchmarkData.toolCalls],
          });
        }
      } else if (row._pending) {
        // Ignore clicks on queued rows
        return;
      } else {
        // Completed result — show in chat preview
        setSelectedResult(row);
      }
    },
    [],
  );

  // Streaming progress — supports concurrent model execution across provider buckets
  const [streamingResults, setStreamingResults] = useState<
    BenchmarkRunResult[]
  >([]);
  const [streamingTotal, setStreamingTotal] = useState(0);
  // Map<modelKey, { model, progress, phase }> for all concurrently-running models
  const [activeModels, setActiveModels] = useState(new Map());
  const [pendingTargets, setPendingTargets] = useState<BenchmarkTarget[]>([]);
  const abortRef = useRef<(() => void) | null>(null);
  // Per-model progress intervals: Map<modelKey, intervalId>
  const progressIntervalsRef = useRef<
    Map<string, ReturnType<typeof setInterval>>
  >(new Map());

  // The model key the user is currently viewing in live preview (sticky — doesn't auto-switch)
  const [viewedModelKey, setViewedModelKey] = useState<string | null>(null);

  // Live streaming text for the currently-viewed model
  // Map<modelKey, { text, thinking, toolCalls }> — accumulates per model
  const liveDataRef = useRef<Map<string, LiveModelData>>(new Map());
  const liveFlushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveModelData>({
    text: "",
    thinking: "",
    toolCalls: [],
  });

  // Cleanup intervals on unmount
  useEffect(() => {
    const intervals = progressIntervalsRef.current;
    return () => {
      for (const id of intervals.values()) clearInterval(id);
      intervals.clear();
      if (liveFlushRef.current) clearInterval(liveFlushRef.current);
    };
  }, []);

  // Derive the "viewed" active model from the Map (for chat preview)
  const viewedActiveModel = useMemo(() => {
    if (activeModels.size === 0) return null;
    if (viewedModelKey && activeModels.has(viewedModelKey)) {
      return activeModels.get(viewedModelKey).model;
    }
    // Fallback: first active model
    return activeModels.values().next().value?.model || null;
  }, [activeModels, viewedModelKey]);

  // Convenience: expose the number of active models for the summary bar
  const activeModelCount = activeModels.size;

  // -- Load benchmark detail ----------------------------------
  const loadBenchmark = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await PrismService.getBenchmark(benchmarkId);
      setBenchmark(detail);
      setTrials(detail.trials || 1);
      if (detail.latestRun) {
        setLatestRun(detail.latestRun);
        setActiveRunId(detail.latestRun.id || null);
      }
    } catch (error: unknown) {
      console.error("Failed to load benchmark detail:", error);
    } finally {
      setLoading(false);
    }

    try {
      const { runs } = await PrismService.getBenchmarkRuns(benchmarkId);
      setRunHistory(runs || []);
    } catch (error: unknown) {
      console.error("Failed to load run history:", error);
    }
  }, [benchmarkId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    loadBenchmark();
  }, [loadBenchmark]);

  // -- Shared live-state helpers (single source of truth) -----

  /** Reset all live streaming refs and state. Called on run complete, error, and stop. */
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- manual memoization is authoritative; React Compiler not enabled
  const resetLiveState = useCallback(() => {
    for (const id of progressIntervalsRef.current.values()) clearInterval(id);
    progressIntervalsRef.current.clear();
    if (liveFlushRef.current) {
      clearInterval(liveFlushRef.current);
      liveFlushRef.current = null;
    }
    setActiveModels(new Map());
    setViewedModelKey(null);
    // eslint-disable-next-line react-hooks/immutability -- existing mutation pattern outside render tracking; restructuring risks behavior change
    liveDataRef.current = new Map();
    setLiveSnapshot({ text: "", thinking: "", toolCalls: [] });
  }, []);

  /** Reset live state for a single model on completion. */
  const resetModelLiveState = useCallback((modelKey: string) => {
    const intervalId = progressIntervalsRef.current.get(modelKey);
    if (intervalId) {
      clearInterval(intervalId);
      progressIntervalsRef.current.delete(modelKey);
    }
    liveDataRef.current.delete(modelKey);
  }, []);

  /**
   * Build the unified SSE callbacks object shared by both `streamBenchmarkRun`
   * and `followBenchmarkRun`. Identical event handling — no duplication.
   */
  const buildBenchmarkSSECallbacks = useCallback(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- manual memoization is authoritative; React Compiler not enabled
    (overrides: Partial<SSECallbacks> = {}) => ({
      onRunInfo: (data: SSEData) => {
        setStreamingTotal((data as { totalModels?: number }).totalModels || 0);
      },

      // -- Model lifecycle — supports concurrent models across providers --
      onModelStart: (data: SSEData) => {
        const { provider, model, isLocal } = data as unknown as {
          provider: string;
          model: string;
          isLocal?: boolean;
        };
        const modelKey = `${provider}:${model}`;

        // Initialize live data refs for this model
        liveDataRef.current.set(modelKey, {
          text: "",
          thinking: "",
          toolCalls: [],
        });

        // Set this as the viewed model only if nothing is currently being viewed
        setViewedModelKey((prev: string | null) => {
          if (prev) return prev; // Don't auto-switch
          return modelKey;
        });

        // Start periodic flush of the VIEWED model's refs → React state
        if (!liveFlushRef.current) {
          liveFlushRef.current = setInterval(() => {
            setViewedModelKey((currentKey: string | null) => {
              if (!currentKey) return currentKey;
              const benchmarkData = liveDataRef.current.get(currentKey);
              if (benchmarkData) {
                setLiveSnapshot({
                  text: benchmarkData.text,
                  thinking: benchmarkData.thinking,
                  toolCalls: [...benchmarkData.toolCalls],
                });
              }
              return currentKey;
            });
          }, 100);
        }

        // Add to active models map
        const initialPhase = isLocal ? "Loading model" : "Connecting";
        setActiveModels((prev) => {
          const next = new Map(prev);
          next.set(modelKey, {
            model: data as unknown as { provider: string; model: string; label?: string },
            progress: 0,
            phase: initialPhase,
          });
          return next;
        });

        // Asymptotic progress simulation — per model
        const oldInterval = progressIntervalsRef.current.get(modelKey);
        if (oldInterval) clearInterval(oldInterval);

        const startTime = Date.now();
        const phases = isLocal
          ? [
              { end: 0.3, duration: 5000, label: "Loading model" },
              { end: 0.6, duration: 2000, label: "Processing prompt" },
              { end: 0.95, duration: 8000, label: "Generating" },
            ]
          : [
              { end: 0.4, duration: 3000, label: "Processing" },
              { end: 0.95, duration: 5000, label: "Generating" },
            ];
        let phaseIndex = 0;
        let phaseStart = startTime;

        const intervalId = setInterval(() => {
          const now = Date.now();
          const phase = phases[phaseIndex];
          const prevEnd = phaseIndex > 0 ? phases[phaseIndex - 1].end : 0;
          const elapsed = now - phaseStart;
          const phaseProgress = elapsed / (elapsed + phase.duration);
          const totalProgress = prevEnd + (phase.end - prevEnd) * phaseProgress;
          setActiveModels((prev) => {
            const next = new Map(prev);
            const entry = next.get(modelKey);
            if (entry) {
              next.set(modelKey, {
                ...entry,
                progress: totalProgress,
                phase: phase.label,
              });
            }
            return next;
          });
          if (phaseProgress > 0.9 && phaseIndex < phases.length - 1) {
            phaseIndex++;
            phaseStart = now;
          }
        }, 60);
        progressIntervalsRef.current.set(modelKey, intervalId);
      },

      onModelComplete: (result: SSEData) => {
        const bmResult = result as unknown as BenchmarkRunResult;
        const modelKey = `${bmResult.provider}:${bmResult.model}`;
        resetModelLiveState(modelKey);

        // Remove from active models
        setActiveModels((prev) => {
          const next = new Map(prev);
          next.delete(modelKey);
          return next;
        });

        // If the completed model was the viewed one, move view to next active
        setViewedModelKey((prev: string | null) => {
          if (prev === modelKey) return null; // Will auto-pick next active via useMemo
          return prev;
        });

        setStreamingResults((prev) => [...prev, bmResult]);

        // Stop live flush if no active models remain
        setActiveModels((latest) => {
          if (latest.size === 0 && liveFlushRef.current) {
            clearInterval(liveFlushRef.current);
            liveFlushRef.current = null;
            setLiveSnapshot({ text: "", thinking: "", toolCalls: [] });
          }
          return latest;
        });
      },

      // -- Live content events — route to the correct model via _sourceModel tag --
      onChunk: (content: string, sourceModel?: string) => {
        const key = resolveModelKeyForContent(liveDataRef.current, sourceModel);
        if (key) {
          const benchmarkData = liveDataRef.current.get(key);
          if (benchmarkData) benchmarkData.text += content;
        }
      },
      onThinking: (content: string, sourceModel?: string) => {
        const key = resolveModelKeyForContent(liveDataRef.current, sourceModel);
        if (key) {
          const benchmarkData = liveDataRef.current.get(key);
          if (benchmarkData) benchmarkData.thinking += content;
        }
      },

      // -- Tool call events (same pattern as /coding-agent) ---
      onToolCall: (toolCall: ToolCallEvent) => {
        const key = resolveModelKeyForContent(
          liveDataRef.current,
          toolCall._sourceModel,
        );
        if (!key) return;
        const benchmarkData = liveDataRef.current.get(key);
        if (!benchmarkData) return;
        if (toolCall.status === "calling") {
          benchmarkData.toolCalls = [
            ...benchmarkData.toolCalls,
            {
              id: toolCall.id,
              name: toolCall.name,
              args: toolCall.args,
              status: EXECUTION_STATUS.CALLING,
            },
          ];
        } else {
          benchmarkData.toolCalls = benchmarkData.toolCalls.map((tool) =>
            tool.id === toolCall.id
              ? {
                  ...tool,
                  status: toolCall.status,
                  result: toolCall.result,
                  ...(toolCall.args && { args: toolCall.args }),
                }
              : tool,
          );
        }
      },
      onToolExecution: (data: SSEData) => {
        const key = resolveModelKeyForContent(
          liveDataRef.current,
          (data as { _sourceModel?: string })._sourceModel,
        );
        if (!key) return;
        const benchmarkData = liveDataRef.current.get(key);
        if (!benchmarkData) return;
        const tool =
          ((data as Record<string, unknown>).tool as {
            id?: string;
            name?: string;
            args?: unknown;
            result?: unknown;
          }) || {};
        if ((data as Record<string, unknown>).status === "calling") {
          benchmarkData.toolCalls = [
            ...benchmarkData.toolCalls,
            {
              id: tool.id,
              name: tool.name,
              args: tool.args,
              status: EXECUTION_STATUS.CALLING,
            },
          ];
        } else {
          benchmarkData.toolCalls = benchmarkData.toolCalls.map((tool) =>
            tool.id === tool.id
              ? {
                  ...tool,
                  status: (data as Record<string, unknown>).status as string,
                  result: tool.result,
                  ...(tool.args ? { args: tool.args } : {}),
                }
              : tool,
          );
        }
      },

      // Merge caller-specific overrides (onRunComplete, onError)
      ...overrides,
    }),
    [resetModelLiveState],
  );

  // -- Reconnect to an in-progress run on mount --------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const status = await PrismService.getBenchmarkActive(benchmarkId);
        if (cancelled || !status?.active) return;

        // Don't pre-populate streamingResults or activeModels here —
        // the follow SSE replays all completed results and sends the
        // active model_start events, keeping a single source of truth.
        setRunning(true);
        setLatestRun(null);

        // Connect to the follow SSE for live updates
        abortRef.current = PrismService.followBenchmarkRun(
          benchmarkId,
          buildBenchmarkSSECallbacks({
            onRunComplete: async (event: SSEData) => {
              const run = event as unknown as BenchmarkRun;
              resetLiveState();
              setLatestRun(run);
              setActiveRunId(run.id || null);
              setRunning(false);
              setStreamingResults([]);
              setActiveModels(new Map());
              setViewedModelKey(null);
              setStreamingTotal(0);
              abortRef.current = null;
              try {
                const { runs } =
                  await PrismService.getBenchmarkRuns(benchmarkId);
                setRunHistory(runs || []);
              } catch {
                /* noop */
              }
            },
            onError: (error: Error) => {
              if (
                error?.name === "AbortError" ||
                error?.message?.includes("abort")
              )
                return;
              resetLiveState();
              setRunning(false);
              setActiveModels(new Map());
              setViewedModelKey(null);
              abortRef.current = null;
            },
          }),
        );
      } catch {
        // No active run or server unreachable — ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [benchmarkId, buildBenchmarkSSECallbacks, resetLiveState]);

  // -- Load Prism config (drives model picker + size column) --
  useEffect(() => {
    (async () => {
      try {
        const config = await PrismService.getConfigWithLocalModels();
        setPrismConfig(config);
      } catch (error: unknown) {
        console.error("Failed to load config:", error);
      }
    })();

    // Load favorites
    PrismService.getFavorites("model")
      .then((favs: Array<{ key: string }>) =>
        setFavoriteKeys(favs.map((file) => file.key)),
      )
      .catch(() => {});

    // Load agent personas (all built-in + custom, excluding "Agentless")
    PrismService.getAgentPersonas()
      .then((list) => setAvailableAgents(list.filter((agent) => agent.id !== AGENT_IDS.NONE)))
      .catch(() => {});
  }, []);

  // -- Favorites ----------------------------------------------
  const handleToggleFavorite = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((prev) => prev.filter((k) => k !== key));
        PrismService.removeFavorite("model", key).catch(() => {});
      } else {
        setFavoriteKeys((prev) => [...prev, key]);
        const [provider, ...rest] = key.split(":");
        PrismService.addFavorite("model", key, {
          provider,
          name: rest.join(":"),
        }).catch(() => {});
      }
    },
    [favoriteKeys],
  );

  // All models flattened (for selected model derivation + size lookup)
  const allModels = useMemo(() => flattenAllModels(prismConfig), [prismConfig]);

  // -- Selected model objects (derived) -----------------------
  // Each instance is enriched with full model config data.
  const selectedModels = useMemo(() => {
    const configMap = new Map();
    for (const model of allModels) configMap.set(`${model.provider}:${model.name}`, model);
    return selectedInstances.map(
      (inst: { instanceId: string; provider: string; name: string }) => {
        const config = configMap.get(`${inst.provider}:${inst.name}`) || {};
        return { ...config, ...inst };
      },
    );
  }, [allModels, selectedInstances]);

  // Derive a selectedKeys Set for the model picker checkmarks
  const selectedModelKeys = useMemo(
    () =>
      new Set<string>(
        selectedInstances.map(
          (i: { provider: string; name: string }) => `${i.provider}:${i.name}`,
        ),
      ),
    [selectedInstances],
  );

  // Build provider:name → config lookup for size column
  const modelConfigMap = useMemo(() => {
    const map: Record<string, ModelOptionWithProvider> = {};
    for (const model of allModels) {
      map[`${model.provider}:${model.name}`] = model;
    }
    return map;
  }, [allModels]);

  // -- Clone / Edit -------------------------------------------
  const openClone = useCallback(() => {
    if (!benchmark) return;
    const state = benchmarkToFormState(benchmark);
    setForm({ ...state, name: `${state.name} (copy)` });
    setModalMode("clone");
  }, [benchmark]);

  const openEdit = useCallback(() => {
    if (!benchmark) return;
    setForm(benchmarkToFormState(benchmark));
    setModalMode("edit");
  }, [benchmark]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = buildBenchmarkPayload(form);
      if (modalMode === "edit") {
        await PrismService.updateBenchmark(benchmarkId, payload);
        setModalMode(null);
        await loadBenchmark();
      } else {
        const created = await PrismService.createBenchmark(payload);
        setModalMode(null);
        if (created?.id) {
          router.push(`/benchmarks/${created.id}`);
        }
      }
    } catch (error: unknown) {
      console.error(
        `Failed to ${modalMode === "edit" ? "update" : "clone"} benchmark:`,
        error,
      );
    } finally {
      setSaving(false);
    }
  }, [form, modalMode, benchmarkId, router, loadBenchmark]);

  // -- Delete a single run from history ------------------------
  const handleDeleteRun = useCallback(
    async (run: BenchmarkRun) => {
      if (!run.id) return;
      try {
        await PrismService.deleteBenchmarkRun(benchmarkId, run.id);
        setRunHistory((previous) =>
          previous.filter((historyRun) => historyRun.id !== run.id),
        );
        if (activeRunId === run.id) {
          setLatestRun(null);
          setActiveRunId(null);
          setSelectedResult(null);
        }
      } catch (error: unknown) {
        console.error("Failed to delete run:", error);
      }
    },
    [benchmarkId, activeRunId],
  );

  // -- Run benchmark ------------------------------------------
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- manual memoization is authoritative; React Compiler not enabled
  const handleRun = useCallback(async () => {
    if (!benchmark) return;
    setRunning(true);
    setStreamingResults([]);
    setActiveModels(new Map());
    setViewedModelKey(null);
    setLatestRun(null);

    if (selectedModels.length === 0 && agentInstances.length === 0) return;

    // Build model targets from selected model instances
    const modelTargets = selectedModels.map((model) => ({
      provider: model.provider,
      model: model.name,
      display_name: model.display_name || model.label || model.name,
      thinkingEnabled: !!thinkingMap[model.instanceId],
      toolsEnabled: !!toolsMap[model.instanceId],
    }));

    // Append agent instances — each agent uses its own backing model
    const agentTargets = agentInstances
      .filter((agent) => agent.provider && agent.modelName) // skip agents without a backing model
      .map((agent) => {
        const modelDef = allModels.find(
          (model) => model.provider === agent.provider && model.name === agent.modelName,
        );
        return {
          provider: agent.provider,
          model: agent.modelName,
          display_name: `🤖 ${agent.name} (${modelDef?.label || modelDef?.display_name || agent.modelName})`,
          thinkingEnabled: !!thinkingMap[agent.instanceId],
          toolsEnabled: true,
          agent: agent.agentId,
        };
      });

    const models = [...modelTargets, ...agentTargets];

    // Pre-populate pending targets so the table shows all rows immediately.
    // Trials repeat each target server-side in the same order.
    const expectedRows =
      trials > 1
        ? models.flatMap((model) => Array.from({ length: trials }, () => model))
        : models;
    setPendingTargets(expectedRows);

    // Notify sidebar to begin polling for active state
    window.dispatchEvent(new Event("benchmark-run-started"));

    abortRef.current = PrismService.streamBenchmarkRun(
      benchmarkId,
      models,
      buildBenchmarkSSECallbacks({
        onRunComplete: async (event: SSEData) => {
          const run = event as unknown as BenchmarkRun;
          resetLiveState();
          setLatestRun(run);
          setActiveRunId(run.id || null);
          setRunning(false);
          setStreamingResults([]);
          setActiveModels(new Map());
          setViewedModelKey(null);
          setStreamingTotal(0);
          setPendingTargets([]);
          abortRef.current = null;
          try {
            const { runs } = await PrismService.getBenchmarkRuns(benchmarkId);
            setRunHistory(runs || []);
          } catch {
            /* noop */
          }
        },
        onError: (error: Error) => {
          // AbortError means user clicked Stop — handleStop already handled cleanup
          if (error?.name === "AbortError" || error?.message?.includes("abort"))
            return;
          resetLiveState();
          console.error("Benchmark run error:", error);
          setRunning(false);
          setActiveModels(new Map());
          setViewedModelKey(null);
          setPendingTargets([]);
          abortRef.current = null;
        },
      }),
      { trials },
    );
  }, [
    benchmark,
    selectedModels,
    agentInstances,
    allModels,
    benchmarkId,
    thinkingMap,
    toolsMap,
    trials,
    buildBenchmarkSSECallbacks,
    resetLiveState,
  ]);

  // -- Stop benchmark -----------------------------------------
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- manual memoization is authoritative; React Compiler not enabled
  const handleStop = useCallback(async () => {
    // 1. Explicitly tell the server to abort (reliable — dedicated HTTP POST)
    try {
      await PrismService.abortBenchmarkRun(benchmarkId);
    } catch {
      /* server might already be done */
    }

    // 2. Also abort the client-side SSE fetch connection (secondary cleanup)
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }

    // Clean up progress state
    resetLiveState();
    setRunning(false);
    setActiveModels(new Map());
    setViewedModelKey(null);
    setPendingTargets([]);
    setStreamingTotal(0);

    // Synthesize a partial run from whatever streaming results we have
    if (streamingResults.length > 0) {
      const passed = streamingResults.filter((result) => result.passed).length;
      const failed = streamingResults.filter(
        (result) => !result.passed && !result.error,
      ).length;
      const errored = streamingResults.filter((result) => result.error).length;
      const totalCost = streamingResults.reduce(
        (state: number, accumulator: BenchmarkRunResult) => state + (accumulator.estimatedCost || 0),
        0,
      );
      setLatestRun({
        id: "partial-" + Date.now(),
        aborted: true,
        models: streamingResults,
        completedAt: new Date().toISOString(),
        summary: {
          total: streamingResults.length,
          passed,
          failed,
          errored,
          totalCost,
        },
      } as BenchmarkRun);
      setStreamingResults([]);
    }

    // Refresh run history (server persists partial runs)
    try {
      const { runs } = await PrismService.getBenchmarkRuns(benchmarkId);
      setRunHistory(runs || []);
    } catch {
      /* noop */
    }
  }, [streamingResults, benchmarkId, resetLiveState]);

  // -- View a past run ----------------------------------------
  const viewRun = useCallback(
    (run: BenchmarkRun) => {
      setLatestRun(run);
      setActiveRunId(run.id || null);
      setSelectedResult(null);

      // Hydrate model/agent selection from this run's results
      if ((run.models?.length ?? 0) > 0) {
        const configMap = new Map<string, ModelOptionWithProvider>();
        for (const model of allModels) configMap.set(`${model.provider}:${model.name}`, model);

        const nextInstances: ModelInstance[] = [];
        const nextAgents: AgentInstance[] = [];
        const nextThinking: Record<string, boolean> = {};
        const nextTools: Record<string, boolean> = {};

        for (const result of run.models!) {
          const key = `${result.provider}:${result.model}`;
          const available = configMap.has(key);
          if (!available) continue;

          if (result.agent) {
            // Agent entry — restore as agent instance
            const instanceData = {
              instanceId: generateUUID(),
              agentId: result.agent,
              name:
                result.label?.replace(/^🤖\s*/, "").replace(/\s*\(.*\)$/, "") ||
                result.agent,
              description: "",
              provider: result.provider,
              modelName: result.model,
            };
            nextAgents.push(instanceData);
            if (result.thinkingEnabled)
              nextThinking[instanceData.instanceId] = true;
          } else {
            // Regular model entry
            const instanceData = {
              instanceId: generateUUID(),
              provider: result.provider,
              name: result.model,
            };
            nextInstances.push(instanceData);
            if (result.thinkingEnabled)
              nextThinking[instanceData.instanceId] = true;
            if (result.toolsEnabled) nextTools[instanceData.instanceId] = true;
          }
        }

        setSelectedInstances(nextInstances);
        setAgentInstances(nextAgents);
        setThinkingMap(nextThinking);
        setToolsMap(nextTools);
        StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
          instances: nextInstances,
          agents: nextAgents,
          thinkingMap: nextThinking,
          toolsMap: nextTools,
        });
      }
    },
    [allModels],
  );

  const handleAddAgent = useCallback(
    (agentDef: ClientAgent) => {
      const instance: AgentInstance = {
        instanceId: generateUUID(),
        agentId: agentDef.id || "",
        name: agentDef.name || "",
        description: agentDef.description || "",
      };
      setAgentInstances((prev) => {
        const next = [...prev, instance];
        // Persist both model + agent instances together
        StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
          instances: selectedInstances,
          agents: next,
          thinkingMap,
          toolsMap,
        });
        return next;
      });
    },
    [selectedInstances, thinkingMap, toolsMap],
  );

  const removeAgent = useCallback(
    (instanceId: string) => {
      setAgentInstances((prev) => {
        const next = prev.filter((i) => i.instanceId !== instanceId);
        StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
          instances: selectedInstances,
          agents: next,
          thinkingMap,
          toolsMap,
        });
        return next;
      });
      setThinkingMap((prev) => {
        const updatedState = { ...prev };
        delete updatedState[instanceId];
        return updatedState;
      });
    },
    [selectedInstances, thinkingMap, toolsMap],
  );

  const handleChangeAgentModel = useCallback(
    (instanceId: string, provider: string, modelName: string) => {
      setAgentInstances((prev) => {
        const next = prev.map((agent) =>
          agent.instanceId === instanceId ? { ...agent, provider, modelName } : agent,
        );
        StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
          instances: selectedInstances,
          agents: next,
          thinkingMap,
          toolsMap,
        });
        return next;
      });
    },
    [selectedInstances, thinkingMap, toolsMap],
  );

  // -- Add model instance to selection (always adds, never toggles) ----
  const handleModelSelect = useCallback(
    (rawModel: ModelOptionWithProvider) => {
      const instance: ModelInstance = {
        instanceId: generateUUID(),
        provider: rawModel.provider,
        name: rawModel.name,
      };
      setSelectedInstances((prev) => {
        const next = [...prev, instance];
        StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
          instances: next,
          agents: agentInstances,
          thinkingMap,
          toolsMap,
        });
        return next;
      });
    },
    [agentInstances, thinkingMap, toolsMap],
  );

  const removeModel = useCallback(
    (instanceId: string) => {
      setSelectedInstances((prev) => {
        const next = prev.filter((i) => i.instanceId !== instanceId);
        StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
          instances: next,
          agents: agentInstances,
          thinkingMap,
          toolsMap,
        });
        return next;
      });
      // Clean up thinking/tools state for removed instance
      setThinkingMap((prev) => {
        const updatedState = { ...prev };
        delete updatedState[instanceId];
        return updatedState;
      });
      setToolsMap((prev) => {
        const updatedState = { ...prev };
        delete updatedState[instanceId];
        return updatedState;
      });
    },
    [agentInstances, thinkingMap, toolsMap],
  );

  const handleChangeModel = useCallback(
    (instanceId: string, provider: string, modelName: string) => {
      setSelectedInstances((prev) => {
        const next = prev.map((i) =>
          i.instanceId === instanceId ? { ...i, provider, name: modelName } : i,
        );
        StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
          instances: next,
          agents: agentInstances,
          thinkingMap,
          toolsMap,
        });
        return next;
      });
    },
    [agentInstances, thinkingMap, toolsMap],
  );

  const clearModelSelection = useCallback(() => {
    setSelectedInstances([]);
    setAgentInstances([]);
    setThinkingMap({});
    setToolsMap({});
    StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
      instances: [],
      agents: [],
      thinkingMap: {},
      toolsMap: {},
    });
  }, []);

  // -- Toggle thinking per instance --------------------------
  const handleToggleThinking = useCallback((instanceId: string) => {
    setThinkingMap((prev) => {
      const next = { ...prev, [instanceId]: !prev[instanceId] };
      // Persist updated toggle state
      const saved = StorageService.get(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS) || {};
      StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
        ...saved,
        thinkingMap: next,
      });
      return next;
    });
  }, []);

  // -- Toggle tools per instance -----------------------------
  const handleToggleTools = useCallback((instanceId: string) => {
    setToolsMap((prev) => {
      const next = { ...prev, [instanceId]: !prev[instanceId] };
      // Persist updated toggle state
      const saved = StorageService.get(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS) || {};
      StorageService.set(STORAGE_KEY_MODEL_MEMORY_BENCHMARKS, {
        ...saved,
        toolsMap: next,
      });
      return next;
    });
  }, []);

  // -- Delete benchmark --------------------------------------
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await PrismService.deleteBenchmark(benchmarkId);
      router.push("/benchmarks");
    } catch (error: unknown) {
      console.error("Failed to delete benchmark:", error);
      setDeleting(false);
    }
  }, [benchmarkId, router]);

  // -- Loading state ------------------------------------------
  if (loading) {
    return (
      <ThreePanelLayout
        navSidebar={navSidebar}
        leftPanel={null}
        rightPanel={rightSidebar}
        rightTitle="Benchmarks"
        title="Benchmarks"
      >
        <div className={styles['content-main']}>
          <div className={styles['run-progress']}>
            <PanelLoadingSpinner size="small" inline />
            <div className={styles['progress-text']}>Loading benchmark…</div>
          </div>
        </div>
      </ThreePanelLayout>
    );
  }

  if (!benchmark) {
    return (
      <ThreePanelLayout
        navSidebar={navSidebar}
        leftPanel={null}
        rightPanel={rightSidebar}
        rightTitle="Benchmarks"
        title="Benchmarks"
      >
        <div className={styles['content-main']}>
          <div className={styles['run-progress']}>
            <div className={styles['progress-text']}>Benchmark not found.</div>
          </div>
        </div>
      </ThreePanelLayout>
    );
  }

  // -- Render -------------------------------------------------
  return (
    <ThreePanelLayout
      className="benchmark-detail-page-component"
      navSidebar={navSidebar}
      leftTitle={undefined}
      leftPanel={
        <RunHistorySidebarComponent
          benchmark={benchmark}
          runHistory={runHistory}
          activeRunId={activeRunId}
          onViewRun={viewRun}
          onDeleteRun={handleDeleteRun}
          running={running}
          streamingCompleted={streamingResults.length}
          selectedModels={selectedModels}
          onRemoveModel={removeModel}
          onChangeModel={handleChangeModel}
          onClearSelection={clearModelSelection}
          thinkingMap={thinkingMap}
          onToggleThinking={handleToggleThinking}
          toolsMap={toolsMap}
          onToggleTools={handleToggleTools}
          agentInstances={agentInstances}
          onRemoveAgent={removeAgent}
          onChangeAgentModel={handleChangeAgentModel}
          allModels={allModels}
          config={prismConfig}
        />
      }
      rightPanel={rightSidebar}
      rightTitle="Benchmarks"
      title="Benchmarks"
    >
      <div className={styles['content-main']}>
        <div className={styles['detail-panel']}>
          {/* -- Benchmark Identity -- */}
          <div className={styles['detail-header']}>
            <div className={styles['detail-title-row']}>
              <div className={styles['detail-title']} title={benchmark.name}>
                {benchmark.name}
              </div>
              <div className={styles['detail-quiet-actions']}>
                <IconButtonComponent
                  icon={<Pencil size={15} />}
                  onClick={openEdit}
                  tooltip="Edit benchmark"
                />
                <IconButtonComponent
                  icon={<Copy size={15} />}
                  onClick={openClone}
                  tooltip="Clone benchmark"
                />
                <IconButtonComponent
                  icon={<Trash2 size={15} />}
                  onClick={() => setShowDeleteModal(true)}
                  variant="destructive"
                  tooltip="Delete benchmark"
                />
              </div>
            </div>
            <div className={styles['detail-meta']}>
              {(() => {
                const textAssertions = (
                  benchmark.assertions?.length
                    ? benchmark.assertions
                    : benchmark.expectedValue
                      ? [
                          {
                            expectedValue: benchmark.expectedValue,
                            matchMode: benchmark.matchMode || "contains",
                          },
                        ]
                      : []
                ).filter(
                  (assertion) =>
                    assertion.expectedValue?.trim() ||
                    assertion.matchMode === "jsonValid",
                );
                const behaviorAssertions = benchmark.agentAssertions || [];
                const textOperator = benchmark.assertionOperator || "AND";
                const behaviorOperator =
                  benchmark.agentAssertionOperator || "AND";
                return (
                  <>
                    {textAssertions.map((assertion, index) => (
                      <span key={`text-${index}`} style={{ display: "contents" }}>
                        {index > 0 && (
                          <BadgeComponent
                            variant={textOperator === "OR" ? "warning" : "info"}
                            mini
                          >
                            {textOperator}
                          </BadgeComponent>
                        )}
                        <BadgeComponent variant="accent">
                          {describeTextAssertion(assertion)}
                        </BadgeComponent>
                      </span>
                    ))}
                    {behaviorAssertions.map((assertion, index) => (
                      <span
                        key={`behavior-${index}`}
                        style={{ display: "contents" }}
                      >
                        {(index > 0 || textAssertions.length > 0) && (
                          <BadgeComponent
                            variant={
                              index === 0
                                ? "info"
                                : behaviorOperator === "OR"
                                  ? "warning"
                                  : "info"
                            }
                            mini
                          >
                            {index === 0 ? "AND" : behaviorOperator}
                          </BadgeComponent>
                        )}
                        <BadgeComponent variant="info">
                          {describeAgentAssertion(assertion)}
                        </BadgeComponent>
                      </span>
                    ))}
                    {(benchmark.enabledTools?.length ?? 0) > 0 && (
                      <TooltipComponent
                        label={benchmark.enabledTools!.join(", ")}
                      >
                        <BadgeComponent variant="warning">
                          <Wrench size={10} />{" "}
                          {benchmark.enabledTools!.length} tool
                          {benchmark.enabledTools!.length === 1 ? "" : "s"}
                        </BadgeComponent>
                      </TooltipComponent>
                    )}
                  </>
                );
              })()}
              {benchmark.tags?.map((tag) => (
                <span key={tag} className={styles['tag']}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* -- Run Bar: pick targets and launch, all in one place -- */}
          <div className={styles['run-bar']}>
            <ModelPickerPopoverComponent
              config={prismConfig}
              multiSelect
              selectedKeys={selectedModelKeys}
              onSelectModel={handleModelSelect}
              favorites={favoriteKeys}
              onToggleFavorite={handleToggleFavorite}
              triggerLabel={
                selectedInstances.length === 0
                  ? "Select Models"
                  : selectedInstances.length === 1
                    ? "1 Model Selected"
                    : `${selectedInstances.length} Models Selected`
              }
            />
            <AgentPickerComponent
              agents={availableAgents}
              addMode
              addCount={agentInstances.length}
              onAddAgent={handleAddAgent}
            />
            <span
              className={`${styles['run-bar-summary']} ${
                selectedModels.length + agentInstances.length > 0
                  ? styles['run-bar-summary-active']
                  : ""
              }`}
            >
              {selectedModels.length + agentInstances.length === 0
                ? "Pick models or agents to benchmark"
                : `${selectedModels.length + agentInstances.length} target${
                    selectedModels.length + agentInstances.length === 1
                      ? ""
                      : "s"
                  }${trials > 1 ? ` × ${trials} trials` : ""} — manage them in the left panel`}
            </span>
            <div className={styles['run-bar-spacer']} />
            <TooltipComponent label="Run every target this many times — measures consistency, not just a single sample">
              <div className={styles['trials-select']}>
                <SelectComponent
                  value={String(trials)}
                  options={TRIAL_OPTIONS}
                  onChange={(value: string) =>
                    setTrials(Number.parseInt(value, 10) || 1)
                  }
                  icon={<Repeat size={13} />}
                  compact
                  disabled={running}
                />
              </div>
            </TooltipComponent>
            <ButtonComponent
              variant={running ? "destructive" : "primary"}
              icon={running ? Square : Play}
              onClick={running ? handleStop : handleRun}
              loading={running}
              disabled={
                !running &&
                selectedModels.length === 0 &&
                agentInstances.length === 0
              }
            >
              {running ? "Stop" : "Run Benchmark"}
            </ButtonComponent>
          </div>

          {/* -- Running Progress -- */}
          {running &&
            (() => {
              const totalExpected = streamingTotal || selectedModels.length;
              const completed = streamingResults.length;
              const passed = streamingResults.filter((result) => result.passed).length;
              const failed = streamingResults.filter(
                (result) => !result.passed && !result.error,
              ).length;
              const errored = streamingResults.filter((result) => result.error).length;
              const runningCount = activeModelCount;
              const totalCost = streamingResults.reduce(
                (state: number, accumulator: BenchmarkRunResult) =>
                  state + (accumulator.estimatedCost || 0),
                0,
              );
              const passRate = completed > 0 ? (passed / completed) * 100 : 0;

              return (
                <div className={styles['run-progress']}>
                  <div className={styles['progress-header']}>
                    <PanelLoadingSpinner size="small" inline />
                    <div className={styles['progress-text']}>
                      Running benchmark against{" "}
                      {streamingTotal > 0 && streamingTotal !== allModels.length
                        ? `${streamingTotal} models`
                        : "all models"}
                      …
                      {completed > 0 && (
                        <span className={styles['progress-count']}>
                          {" "}
                          — {completed} completed
                        </span>
                      )}
                    </div>
                    <ButtonComponent
                      variant="destructive"
                      icon={Square}
                      onClick={handleStop}
                      className={styles['stop-button']}
                    >
                      Stop
                    </ButtonComponent>
                  </div>

                  {/* -- Live Summary Bar -- */}
                  <SummaryBarComponent
                    live
                    items={[
                      {
                        value: `${completed}/${totalExpected}`,
                        label: "Completed",
                        icon: <Hash size={14} />,
                      },
                      {
                        value: runningCount,
                        label: "Running",
                        color: "var(--accent-primary)",
                        icon: <Loader2 size={14} className={styles['spin-icon']} />,
                      },
                      {
                        value: passed,
                        label: "Passed",
                        color: "var(--color-success)",
                        icon: <CircleCheck size={14} />,
                      },
                      {
                        value: failed,
                        label: "Failed",
                        color: "var(--color-danger)",
                        icon: <CircleX size={14} />,
                      },
                      ...(errored > 0
                        ? [
                            {
                              value: errored,
                              label: "Errors",
                              color: "var(--color-warning)",
                            },
                          ]
                        : []),
                      {
                        bar: passRate,
                        barPassed: passed,
                        barTotal: completed,
                        label:
                          completed > 0 ? `${Math.round(passRate)}%` : "\u2014",
                      },
                      ...(totalCost > 0
                        ? [
                            {
                              value: formatCost(totalCost),
                              label: "Cost",
                              color: "var(--color-success)",
                              icon: (
                                <Coins size={14} className={styles['cost-icon']} />
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />

                  {/* Progressive results table (includes active model row) */}
                  <div>
                    <BenchmarksTableComponent
                      results={streamingResults}
                      expectedValue={benchmark.expectedValue}
                      modelConfigMap={modelConfigMap as unknown as Record<string, Record<string, unknown>>}
                      onRowClick={handleStreamingRowClick as unknown as (_row: BenchmarkRunResult | Partial<BenchmarkRunResult>) => void}
                      activeRowKey={getActiveKey(streamingResults)}
                      activeModels={activeModels}
                      pendingTargets={pendingTargets}
                    />
                  </div>
                </div>
              );
            })()}

          {/* -- Empty state: never run yet -- */}
          {!latestRun && !running && (
            <EmptyStateComponent
              icon={<Play size={36} />}
              title="No runs yet"
              subtitle={
                selectedModels.length + agentInstances.length > 0
                  ? "Your targets are ready — hit Run Benchmark above to get the first results."
                  : "Pick models or agents in the bar above, then run this benchmark to see pass/fail results, tool traces, and timings."
              }
            />
          )}

          {/* -- Results -- */}
          {latestRun && !running && (
            <div className={styles['results-section']}>
              <div className={styles['results-section-header']}>
                <div className={styles['results-section-title']}>
                  Results
                  {latestRun.aborted && (
                    <BadgeComponent variant="warning" style={{ marginLeft: 8 }}>
                      Stopped
                    </BadgeComponent>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(latestRun.trials ?? 1) > 1 && (
                    <BadgeComponent variant="accent">
                      <Repeat size={10} /> {latestRun.trials} trials
                    </BadgeComponent>
                  )}
                  {(() => {
                    const totalDuration = (latestRun.models || []).reduce(
                      (sum: number, accumulator: BenchmarkRunResult) =>
                        sum + (accumulator.latency || 0),
                      0,
                    );
                    return totalDuration > 0 ? (
                      <BadgeComponent
                        type="stopwatch"
                        seconds={totalDuration}
                      />
                    ) : null;
                  })()}
                  <BadgeComponent
                    type="dateTime"
                    date={latestRun.completedAt}
                  />
                  {(latestRun.models?.length ?? 0) > 1 && (
                    <ButtonComponent
                      variant="disabled"
                      icon={Columns3}
                      onClick={() => setShowCompareModal(true)}
                    >
                      Compare
                    </ButtonComponent>
                  )}
                </div>
              </div>

              {/* Summary Bar */}
              <SummaryBarComponent
                items={[
                  {
                    value: latestRun.summary?.total ?? 0,
                    label: "Total",
                    icon: <Hash size={14} />,
                  },
                  {
                    value: latestRun.summary?.passed ?? 0,
                    label: "Passed",
                    color: "var(--color-success)",
                    icon: <CircleCheck size={14} />,
                  },
                  {
                    value: latestRun.summary?.failed ?? 0,
                    label: "Failed",
                    color: "var(--color-danger)",
                    icon: <CircleX size={14} />,
                  },
                  ...((latestRun.summary?.errored ?? 0) > 0
                    ? [
                        {
                          value: latestRun.summary!.errored,
                          label: "Errors",
                          color: "var(--color-warning)",
                        },
                      ]
                    : []),
                  {
                    bar:
                      ((latestRun.summary?.passed ?? 0) /
                        (latestRun.summary?.total || 1)) *
                      100,
                    barPassed: latestRun.summary?.passed ?? 0,
                    barTotal: latestRun.summary?.total ?? 0,
                    label: `${Math.round(((latestRun.summary?.passed ?? 0) / (latestRun.summary?.total || 1)) * 100)}%`,
                  },
                  ...((latestRun.summary?.totalCost ?? 0) > 0 ||
                  latestRun.models?.some((result) => (result.estimatedCost ?? 0) > 0)
                    ? [
                        {
                          value: formatCost(
                            latestRun.summary?.totalCost ??
                              (latestRun.models || []).reduce(
                                (state: number, result: BenchmarkRunResult) =>
                                  state + (result.estimatedCost || 0),
                                0,
                              ),
                          ),
                          label: "Cost",
                          color: "var(--color-success)",
                          icon: <Coins size={14} className={styles['cost-icon']} />,
                        },
                      ]
                    : []),
                ]}
              />

              {/* Results Table */}
              <BenchmarksTableComponent
                results={latestRun.models}
                expectedValue={benchmark.expectedValue}
                modelConfigMap={modelConfigMap as unknown as Record<string, Record<string, unknown>>}
                onRowClick={setSelectedResult as unknown as (_row: BenchmarkRunResult | Partial<BenchmarkRunResult>) => void}
                activeRowKey={getActiveKey(latestRun.models || [])}
              />
            </div>
          )}

          {/* -- Assertion report for the selected result -- */}
          {selectedResult && !running ? (
            <BenchmarkAssertionReportComponent result={selectedResult} />
          ) : null}

          {/* -- Chat Preview: selected result or live streaming -- */}
          {selectedResult || viewedActiveModel ? (
            <ChatPreviewComponent
              systemPrompt={benchmark.systemPrompt}
              messages={
                [
                  { role: MESSAGE_ROLES.USER, content: benchmark.prompt || "" },
                  ...(selectedResult?.response
                    ? [
                        {
                          role: MESSAGE_ROLES.ASSISTANT,
                          content: selectedResult.response,
                          thinking: selectedResult.thinking || undefined,
                          toolCalls: selectedResult.toolCalls || undefined,
                          model: selectedResult.label || selectedResult.model,
                          provider: selectedResult.provider,
                        },
                      ]
                    : []),
                  ...(!selectedResult && viewedActiveModel
                    ? [
                        {
                          role: MESSAGE_ROLES.ASSISTANT,
                          content: liveSnapshot.text || "",
                          thinking: liveSnapshot.thinking || undefined,
                          toolCalls:
                            liveSnapshot.toolCalls?.length > 0
                              ? liveSnapshot.toolCalls
                              : undefined,
                          model:
                            viewedActiveModel.label || viewedActiveModel.model,
                          provider: viewedActiveModel.provider,
                          _liveStreaming: true,
                        },
                      ]
                    : []),
                ] as Message[]
              }
            />
          ) : null}
        </div>
      </div>

      {/* -- Clone / Edit Modal -- */}
      {modalMode && (
        <ModalComponent
          title={modalMode === "edit" ? "Edit Benchmark" : "Clone Benchmark"}
          size="xl"
          onClose={() => setModalMode(null)}
          footer={
            <>
              <ButtonComponent
                variant="secondary"
                onClick={() => setModalMode(null)}
              >
                Cancel
              </ButtonComponent>
              <ButtonComponent
                variant="primary"
                onClick={handleSave}
                loading={saving}
                disabled={!isBenchmarkFormValid(form)}
              >
                {modalMode === "edit" ? "Save Changes" : "Create Clone"}
              </ButtonComponent>
            </>
          }
        >
          <BenchmarkFormComponent
            form={form}
            onChange={setForm}
            hidePresets={modalMode === "edit"}
          />
        </ModalComponent>
      )}

      {/* -- Compare Modal -- */}
      {showCompareModal && latestRun?.models?.length ? (
        <ModalComponent
          title={`Compare Outputs — ${benchmark.name}`}
          size="xl"
          onClose={() => setShowCompareModal(false)}
        >
          <BenchmarkCompareComponent results={latestRun.models} />
        </ModalComponent>
      ) : null}

      {/* -- Delete Confirmation Modal -- */}
      {showDeleteModal && (
        <ModalComponent
          title="Delete Benchmark"
          size="sm"
          onClose={() => setShowDeleteModal(false)}
          footer={
            <>
              <ButtonComponent
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </ButtonComponent>
              <ButtonComponent
                variant="destructive"
                icon={Trash2}
                onClick={handleDelete}
                loading={deleting}
              >
                Delete Benchmark
              </ButtonComponent>
            </>
          }
        >
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 13,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Are you sure you want to delete{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {benchmark.name}
            </strong>
            ? This will permanently remove the benchmark and all{" "}
            {runHistory.length > 0 ? `${runHistory.length} ` : ""}associated
            test run{runHistory.length !== 1 ? "s" : ""}.
          </p>
        </ModalComponent>
      )}
    </ThreePanelLayout>
  );
}
