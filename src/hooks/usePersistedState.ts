"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Drop-in replacement for useState that persists the value to localStorage
 * under a page-scoped key. Restores the saved value on mount, falling back
 * to the provided defaultValue if nothing is stored.
 *
 * @param storageKey - The localStorage key (should be unique per page/context)
 * @param defaultValue - The initial value if nothing is found in localStorage
 */
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const storedValue = localStorage.getItem(storageKey);
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
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, [storageKey, state]);

  const setPersistedState = useCallback(
    (value: T | ((previous: T) => T)) => {
      setState(value);
    },
    [],
  );

  return [state, setPersistedState];
}
