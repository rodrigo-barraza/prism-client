import { useState, useCallback, useEffect, useRef } from "react";
import StorageService from "../services/StorageService";
import type { ToolSchema } from "../types/types";

/**
 * useToolToggles — manages the disabled built-in tools state and toggle handlers.
 * Optionally persists the toggle state to localStorage under a page-scoped key.
 */
export default function useToolToggles(
  builtInTools: ToolSchema[],
  storageKey?: string,
) {
  // Load initial state from localStorage if a storage key is provided
  const [disabledTools, setDisabledTools] = useState<Set<string>>(() => {
    if (storageKey) {
      const saved = StorageService.get<{ disabledTools?: string[]; disabledBuiltIns?: string[] }>(
        storageKey,
      );
      const list = saved?.disabledTools || saved?.disabledBuiltIns;
      if (list && Array.isArray(list)) {
        return new Set(list);
      }
    }
    return new Set();
  });

  // Persist to localStorage when the set changes
  const isInitialMount = useRef<boolean>(true);
  useEffect(() => {
    // Skip initial mount to avoid writing back the just-loaded value
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!storageKey) return;
    const current =
      StorageService.get<Record<string, unknown>>(storageKey) || {};
    StorageService.set(storageKey, {
      ...current,
      disabledTools: [...disabledTools],
    });
  }, [disabledTools, storageKey]);

  const handleToggleBuiltIn = useCallback((toolName: string) => {
    setDisabledTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  }, []);

  const handleToggleAllBuiltIn = useCallback(
    (enableAll: boolean) => {
      setDisabledTools((prev) => {
        const next = new Set(prev);
        for (const tool of builtInTools) {
          if (enableAll) {
            next.delete(tool.name);
          } else {
            next.add(tool.name);
          }
        }
        return next;
      });
    },
    [builtInTools],
  );

  return { disabledTools, handleToggleBuiltIn, handleToggleAllBuiltIn };
}
