"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Cpu, Loader2, Power, PowerOff, RefreshCw, Server } from "lucide-react";
import { POLL_MODERATE } from "@rodrigo-barraza/utilities-library";
import IrisService from "../services/IrisService";
import PrismService from "../services/PrismService";
import ModelsTableComponent, { RawModel } from "./ModelsTableComponent";
import ModelLoadConfigPanel from "./ModelLoadConfigPanelComponent";
import ModelDetailPanelComponent from "./ModelDetailPanelComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";

import { ErrorMessage } from "./StateMessageComponent";
import {
  ToastComponent,
  useToast,
} from "@rodrigo-barraza/components-library";
import { getErrorMessage } from "../utils/errorMessage";
import styles from "./ModelsPageComponent.module.css";

/**
 * Flatten all model groups from the config into a single array,
 * tagging each model with its provider.
 */
import type { PrismConfig, ModelOption, ModalityConfig } from "../types/types";

interface ModelActionState {
  id: string;
  type: "load" | "unload";
}

interface LmStudioApiModel {
  key: string;
  type: string;
  loaded_instances?: Array<{ id: string; [key: string]: unknown }>;
  max_context_length?: number;
  size_bytes?: number;
  params_string?: string;
  architecture?: string;
  archParams?: Record<string, unknown>;
  display_name?: string;
}

function flattenConfigModels(config: PrismConfig | null) {
  if (!config) return [];

  const modelsMap = new Map();

  const MODEL_SECTIONS = [
    "textToText",
    "textToImage",
    "textToSpeech",
    "imageToText",
    "audioToText",
    "embedding",
  ];

  for (const section of MODEL_SECTIONS) {
    const configSection = (config as unknown as Record<string, ModalityConfig | undefined>)[section];
    const providers = configSection?.models || {};
    for (const [provider, models] of Object.entries(providers)) {
      for (const modelOption of models as ModelOption[]) {
        const key = `${provider}:${modelOption.name}`;
        if (!modelsMap.has(key)) {
          modelsMap.set(key, { ...modelOption, provider });
        } else {
          const existing = modelsMap.get(key);
          modelsMap.set(key, {
            ...existing,
            arena: { ...(existing.arena || {}), ...((modelOption as unknown as Record<string, unknown>).arena as Record<string, unknown> || {}) },
          });
        }
      }
    }
  }

  return [...modelsMap.values()];
}

interface ModelsPageComponentProps {
  mode?: string;
  project?: string | null;
  onCountChange?: (value: string | number | null) => void;
}

export default function ModelsPageComponent({
  mode = "user",
  onCountChange,
}: ModelsPageComponentProps) {
  const isAdmin = mode === "admin";
  const [allModels, setAllModels] = useState<RawModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<ModelActionState | null>(null);
  const { toasts, addToast, removeToast } = useToast(4000);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [loadConfigModel, setLoadConfigModel] = useState<RawModel | null>(null);
  const [selectedModel, setSelectedModel] = useState<RawModel | null>(null);
  const hasLoadedRef = useRef<boolean>(false);

  // Helper: merge config + LM data + stats into the allModels array
  const buildMergedModels = useCallback(
    (config: PrismConfig | null, lmData: { models?: any[]; data?: any[] }, modelStats: any[]) => {
      const flat = flattenConfigModels(config);
      const rawModelsList = lmData?.models || lmData?.data || [];
      const lmApiModels = rawModelsList.filter(
        (modelEntry: LmStudioApiModel) => modelEntry.type === "llm",
      );
      const lmApiMap = new Map(lmApiModels.map((modelEntry: LmStudioApiModel) => [modelEntry.key, modelEntry]));

      // Build usage map: "provider:model" → stats object
      const usageMap = new Map();
      let grandTotal = 0;
      for (const s of modelStats) {
        const key = `${s.provider}:${s.model}`;
        const existing = usageMap.get(key);
        const totalRequests = typeof s.totalRequests === "number" ? s.totalRequests : 0;
        const totalInputTokens = typeof s.totalInputTokens === "number" ? s.totalInputTokens : 0;
        const totalOutputTokens = typeof s.totalOutputTokens === "number" ? s.totalOutputTokens : 0;
        const totalTokens = typeof s.totalTokens === "number" ? s.totalTokens : 0;
        const totalCost = typeof s.totalCost === "number" ? s.totalCost : 0;
        const successCount = typeof s.successCount === "number" ? s.successCount : 0;
        const errorCount = typeof s.errorCount === "number" ? s.errorCount : 0;
        const avgLatency = typeof s.avgLatency === "number" ? s.avgLatency : 0;
        const avgTokensPerSec = typeof s.avgTokensPerSec === "number" ? s.avgTokensPerSec : 0;
        const firstUsed = s.firstUsed;
        const lastUsed = s.lastUsed;

        if (existing) {
          existing.totalRequests += totalRequests;
          existing.totalInputTokens += totalInputTokens;
          existing.totalOutputTokens += totalOutputTokens;
          existing.totalTokens += totalTokens;
          existing.totalCost += totalCost;
          existing.successCount += successCount;
          existing.errorCount += errorCount;
          // Keep the extremes for first/last used
          if (
            firstUsed &&
            (!existing.firstUsed || firstUsed < existing.firstUsed)
          ) {
            existing.firstUsed = firstUsed;
          }
          if (
            lastUsed &&
            (!existing.lastUsed || lastUsed > existing.lastUsed)
          ) {
            existing.lastUsed = lastUsed;
          }
          // Re-average latency and tokens/sec
          const totalReq = existing.totalRequests;
          if (totalReq > 0) {
            existing.avgLatency =
              (existing.avgLatency * (totalReq - totalRequests) +
                avgLatency * totalRequests) /
              totalReq;
            existing.avgTokensPerSec =
              (existing.avgTokensPerSec * (totalReq - totalRequests) +
                avgTokensPerSec * totalRequests) /
              totalReq;
          }
        } else {
          usageMap.set(key, {
            totalRequests,
            totalInputTokens,
            totalOutputTokens,
            totalTokens,
            totalCost,
            avgLatency,
            avgTokensPerSec,
            firstUsed: firstUsed || null,
            lastUsed: lastUsed || null,
            successCount,
            errorCount,
          });
        }
        grandTotal += totalRequests;
      }

      return flat.map((m) => {
        const usageKey = `${m.provider}:${m.name}`;
        const stats = usageMap.get(usageKey) || {
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalCost: 0,
          avgLatency: 0,
          avgTokensPerSec: 0,
          firstUsed: null,
          lastUsed: null,
          successCount: 0,
          errorCount: 0,
        };
        const usageCount = stats.totalRequests;
        let result = {
          ...m,
          usageCount,
          usageTotal: grandTotal,
          totalInputTokens: stats.totalInputTokens,
          totalOutputTokens: stats.totalOutputTokens,
          totalTokens: stats.totalTokens,
          totalCost: stats.totalCost,
          avgLatency: stats.avgLatency,
          avgTokensPerSec: stats.avgTokensPerSec,
          firstUsed: stats.firstUsed,
          lastUsed: stats.lastUsed,
          successCount: stats.successCount,
          errorCount: stats.errorCount,
        };

        if (m.provider === "lm-studio") {
          const apiModel = lmApiMap.get(m.name);
          if (apiModel) {
            result = {
              ...result,
              loaded_instances: apiModel.loaded_instances,
              loaded: (apiModel.loaded_instances?.length ?? 0) > 0,
              key: apiModel.key,
              // Preserve raw API fields for ModelLoadConfigPanel
              max_context_length: apiModel.max_context_length,
              size_bytes: apiModel.size_bytes,
              params_string: apiModel.params_string,
              architecture: apiModel.architecture,
              archParams: apiModel.archParams,
              display_name: apiModel.display_name || result.display_name,
            };
          }
        }
        return result;
      });
    },
    [],
  );

  const fetchModels = useCallback(async () => {
    try {
      setError(null);
      const configService = isAdmin ? IrisService : PrismService;
      const statsService = isAdmin ? IrisService : PrismService;
      const lmService = isAdmin ? IrisService : PrismService;

      // Phase 1: cloud config + stats — resolves instantly
      const [baseConfig, modelStats] = await Promise.all([
        configService.getConfig().catch(() => null),
        statsService.getModelStats().catch(() => []),
      ]);

      // Show cloud models immediately — only on first load to avoid flash
      // on subsequent interval refreshes
      if (!hasLoadedRef.current) {
        const cloudModels = buildMergedModels(
          baseConfig,
          { models: [] },
          modelStats,
        );
        setAllModels(cloudModels);
        setLoading(false);
      }

      // Phase 2: progressive — merge local provider models + LM Studio API data
      const [mergedConfig, lmData] = await Promise.all([
        PrismService.getConfigWithLocalModels({ service: configService as typeof PrismService }).catch(() => baseConfig),
        lmService.getLmStudioModels().catch(() => ({ models: [] })),
      ]);

      // Rebuild with local models + LM Studio API data
      const fullModels = buildMergedModels(mergedConfig, lmData, modelStats);
      setAllModels(fullModels);
      hasLoadedRef.current = true;
    } catch (error: unknown) {
      setError(getErrorMessage(error));
      setAllModels([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, buildMergedModels]);

  useEffect(() => {
    fetchModels();
    PrismService.getFavorites("model")
      .then((favs: Array<{ key: string }>) =>
        setFavoriteKeys(favs.map((f) => f.key)),
      )
      .catch(() => {});
    const interval = setInterval(fetchModels, POLL_MODERATE);
    return () => clearInterval(interval);
  }, [fetchModels]);

  // Report count to parent
  useEffect(() => {
    onCountChange?.(allModels.length);
  }, [onCountChange, allModels.length]);

  const handleToggleFavorite = async (key: string) => {
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
  };

  // Open the config panel instead of loading immediately
  const handleLoad = (modelKey: string) => {
    // Find the raw LM Studio API model data for this key
    const rawModel = allModels.find(
      (m) =>
        m.provider === "lm-studio" &&
        (m.key === modelKey || m.name === modelKey),
    );
    if (rawModel) {
      setLoadConfigModel(rawModel);
    }
  };

  // Called from the config panel with load options
  const handleConfigLoad = async (modelKey: string, options: Record<string, unknown>) => {
    setActionInProgress({ id: modelKey, type: "load" });
    setLoadConfigModel(null);
    try {
      const lmService = isAdmin ? IrisService : PrismService;
      await lmService.loadLmStudioModel(modelKey, options);
      addToast(`Loaded ${modelKey}`, "success");
      await fetchModels();
    } catch (error: unknown) {
      addToast(`Failed to load: ${getErrorMessage(error)}`, "error");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleUnload = async (instanceId: string) => {
    setActionInProgress({ id: instanceId, type: "unload" });
    try {
      const lmService = isAdmin ? IrisService : PrismService;
      await lmService.unloadLmStudioModel(instanceId);
      addToast(`Unloaded ${instanceId}`, "success");
      await fetchModels();
    } catch (error: unknown) {
      addToast(`Failed to unload: ${getErrorMessage(error)}`, "error");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchModels();
  };

  const providerSet = new Set(allModels.map((m) => m.provider));

  const renderActions = isAdmin
    ? (model: RawModel) => {
        if (model.provider !== "lm-studio") return null;

        const isLoaded = (model.loaded_instances?.length ?? 0) > 0;
        const instance = model.loaded_instances?.[0];
        const modelKey = model.key || model.name || "";
        const isActioning =
          actionInProgress &&
          (actionInProgress.id === modelKey ||
            actionInProgress.id === instance?.id);
        const actionType = isActioning ? actionInProgress.type : null;

        if (isActioning) {
          return (
            <button
              className={`${styles['action-button']} ${actionType === "unload" ? styles['unload-button'] : styles['is-loading-state-button']}`}
              disabled
            >
              <Loader2 size={10} className={styles['spinning']} />
              {actionType === "load" ? "Loading\u2026" : "Unloading\u2026"}
            </button>
          );
        }

        if (isLoaded && instance) {
          return (
            <button
              className={`${styles['action-button']} ${styles['unload-button']}`}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleUnload(String(instance.id));
              }}
              title="Unload model"
              disabled={!!actionInProgress}
            >
              <PowerOff size={10} />
              Unload
            </button>
          );
        }

        return (
          <button
            className={`${styles['action-button']} ${styles['load-button']}`}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              if (modelKey) {
                handleLoad(modelKey);
              }
            }}
            title="Load model"
            disabled={!!actionInProgress}
          >
            <Power size={10} />
            Load
          </button>
        );
      }
    : undefined;

  return (
    <>
      {!isAdmin ? (
        <div className={`models-page-component ${styles['container']}`}>
          {/* Header */}
          <div className={styles['header']}>
            <div className={styles['header-left']}>
              <h1 className={styles['title']}>
                <Server className={styles['title-icon']} size={22} />
                Models
              </h1>
              <p className={styles['subtitle']}>
                All available models configured in the ecosystem across different providers.
              </p>
            </div>

            <div className={styles['header-right']}>
              {/* Stats */}
              <div className={styles['stats-badges']}>
                <div className={styles['stat-badge']}>
                  <span className={styles['stat-value']}>{allModels.length}</span> models
                </div>
                <div className={styles['stat-badge']}>
                  <span className={styles['stat-value']}>{providerSet.size}</span> providers
                </div>
              </div>

              <button
                className={`${styles['refresh-button']} ${loading ? styles['spinning'] : ""}`}
                onClick={handleRefresh}
                disabled={loading}
                title="Refresh models status"
              >
                <RefreshCw /> Refresh
              </button>
            </div>
          </div>

          <div className={styles['content']}>
            <ErrorMessage message={error} />

            <ToastComponent toasts={toasts} onRemove={removeToast} />

            {loading && allModels.length === 0 ? (
              <div className={styles['is-loading-state']}>
                <PanelLoadingSpinner size="large" />
              </div>
            ) : (
              <ModelsTableComponent
                models={allModels}
                onSelect={setSelectedModel}
                renderActions={renderActions}
                favorites={favoriteKeys}
                onToggleFavorite={handleToggleFavorite}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={styles['admin-actions']}>
            <button
              className={`${styles['refresh-button']} ${loading ? styles['spinning'] : ""}`}
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw /> Refresh
            </button>
          </div>
          <div className={styles['admin-content']}>
            <ErrorMessage message={error} />

            <ToastComponent toasts={toasts} onRemove={removeToast} />

            {loading && allModels.length === 0 ? (
              <div className={styles['is-loading-state']}>
                <PanelLoadingSpinner size="large" />
              </div>
            ) : (
              <ModelsTableComponent
                models={allModels}
                onSelect={setSelectedModel}
                renderActions={renderActions}
                favorites={favoriteKeys}
                onToggleFavorite={handleToggleFavorite}
              />
            )}
          </div>
        </>
      )}

      {loadConfigModel && (
        <ModelLoadConfigPanel
          model={loadConfigModel}
          onLoad={handleConfigLoad}
          onClose={() => setLoadConfigModel(null)}
          service={isAdmin ? IrisService : PrismService}
          loading={!!actionInProgress}
        />
      )}

      {selectedModel && (
        <ModelDetailPanelComponent
          model={selectedModel as any}
          onClose={() => setSelectedModel(null)}
        />
      )}
    </>
  );
}
