import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import StorageService from "../services/StorageService";
import { LOCAL_PROVIDERS, type ProviderType } from "../constants";
import type { PrismConfig, ModelOption } from "../types/types";

/**
 * useModelMemory — Persist and restore the last-used model per page context.
 *
 * Stores { provider, model, isLocal } in StorageService under the given key.
 * Only one model can be default — the last one picked wins (local or cloud).
 *
 * When config loads, call `restoreModel(config, setSettings)` to apply the
 * remembered model if it still exists in the config. Call it twice when
 * progressive loading is used (once for cloud, once for merged local) —
 * the hook automatically defers local model restoration until local models
 * are available.
 */
export default function useModelMemory(storageKey: string) {
  // Track whether we've already restored so progressive config loads
  // don't keep overwriting user's live selection.
  const restoredRef = useRef<boolean>(false);

  /**
   * Save the current model selection to localStorage.
   * Call this whenever the user picks a model.
   */
  const saveModel = useCallback(
    (provider: string, model: string) => {
      if (!provider || !model) return;
      StorageService.set(storageKey, {
        provider,
        model,
        isLocal: LOCAL_PROVIDERS.has(provider as ProviderType),
      });
    },
    [storageKey],
  );

  /**
   * Attempt to restore the remembered model from localStorage.
   * Safe to call multiple times (idempotent after first successful restore).
   */
  const restoreModel = useCallback(
    <T>(
      config: PrismConfig,
      setSettings: Dispatch<SetStateAction<T>>,
      {
        fcOnly = false,
        fallback,
      }: { fcOnly?: boolean; fallback?: (config: PrismConfig) => void } = {},
    ) => {
      if (!config) return;
      if (restoredRef.current) return;

      const saved = StorageService.get<{
        provider: string;
        model: string;
        isLocal: boolean;
      }>(storageKey);
      if (!saved?.provider || !saved?.model) {
        // No saved preference — let the caller apply its own default.
        if (fallback) fallback(config);
        restoredRef.current = true;
        return;
      }

      // If the saved model is local but local models aren't merged yet, wait.
      const textToText = config.textToText;
      const models = textToText?.models ?? {};

      if (saved.isLocal) {
        const localModels = models[saved.provider] || [];
        if (localModels.length === 0) {
          // Local models haven't arrived yet — don't mark as restored,
          // so the next call (after onLocalMerge) can try again.
          return;
        }
      }

      // Check the model exists in current config
      const providerModels = models[saved.provider] || [];
      const modelDef = providerModels.find((memory) => memory.name === saved.model);

      if (!modelDef) {
        // Model no longer available — fall back to default
        if (fallback) fallback(config);
        restoredRef.current = true;
        return;
      }

      // FC-only gate
      if (
        fcOnly &&
        !(modelDef.tools as string[] | undefined)?.includes("Tool Calling")
      ) {
        if (fallback) fallback(config);
        restoredRef.current = true;
        return;
      }

      const temp = modelDef.defaultTemperature ?? 1.0;
      setSettings(
        (state) =>
          ({
            ...state,
            provider: saved.provider,
            model: saved.model,
            temperature: temp,
          }) as T,
      );
      restoredRef.current = true;
    },
    [storageKey],
  );

  /**
   * Reset the restored flag — call when the user explicitly starts a new chat
   * so subsequent config loads can re-apply the memory.
   */
  const resetRestoreFlag = useCallback(() => {
    restoredRef.current = false;
  }, []);

  return { saveModel, restoreModel, resetRestoreFlag };
}
