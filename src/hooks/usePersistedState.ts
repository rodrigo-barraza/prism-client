"use client";

import { useState, useEffect, useCallback } from "react";
import { profileScopedKey } from "../utils/profileScopedKey";

/**
 * Drop-in replacement for useState that persists the value to localStorage
 * under a page-scoped key. Restores the saved value on mount, falling back
 * to the provided defaultValue if nothing is stored.
 *
 * Keys are scoped to the active profile (see profileScopedKey) so each
 * profile keeps its own persisted UI state.
 *
 * @param storageKey - The localStorage key (should be unique per page/context)
 * @param defaultValue - The initial value if nothing is found in localStorage
 */
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
): [T, (_value: T | ((_previous: T) => T)) => void] {
  const scopedStorageKey = profileScopedKey(storageKey);
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const storedValue = localStorage.getItem(scopedStorageKey);
      if (storedValue !== null) {
        return JSON.parse(storedValue) as T;
      }
    } catch {
      // Corrupted or missing — fall through to default
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(scopedStorageKey, JSON.stringify(state));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, [scopedStorageKey, state]);

  const setPersistedState = useCallback(
    (value: T | ((_previous: T) => T)) => {
      setState(value);
    },
    [],
  );

  return [state, setPersistedState];
}
