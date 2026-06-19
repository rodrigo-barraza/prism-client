"use client";

/**
 * StorageService — localStorage wrapper with namespacing,
 * JSON serialization, and fallback for SSR environments.
 */
const NAMESPACE = "prism";

function makeKey(key: string): string {
  return `${NAMESPACE}:${key}`;
}

function isAvailable(): boolean {
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

const StorageService = {
  /**
   * Get a value from localStorage (returns parsed JSON or the fallback).
   */
  get<T = unknown>(key: string, fallback: T | null = null): T | null {
    if (!isAvailable()) return fallback;
    try {
      const raw = localStorage.getItem(makeKey(key));
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  /**
   * Set a value in localStorage (JSON-serialized).
   */
  set(key: string, value: unknown): void {
    if (!isAvailable()) return;
    try {
      localStorage.setItem(makeKey(key), JSON.stringify(value));
    } catch {
      // quota exceeded or other error — silently fail
    }
  },

  /**
   * Remove a key from localStorage.
   */
  remove(key: string): void {
    if (!isAvailable()) return;
    localStorage.removeItem(makeKey(key));
  },

  /**
   * Clear all namespaced keys.
   */
  clear(): void {
    if (!isAvailable()) return;
    const prefix = `${NAMESPACE}:`;
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const storageKey = localStorage.key(index);
      if (storageKey?.startsWith(prefix)) keysToRemove.push(storageKey);
    }
    keysToRemove.forEach((storageKey) => localStorage.removeItem(storageKey));
  },
};

export default StorageService;
