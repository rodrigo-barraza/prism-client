"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCAL_STORAGE_KEY_CHAT_BACKGROUND } from "../constants";

/**
 * Ambient chat-background scene names. "none" disables the backdrop.
 * New scenes (weather, night sky, …) register in ChatBackgroundComponent
 * and add their name here.
 */
export const CHAT_BACKGROUND_NAMES = ["clouds", "none"] as const;
export type ChatBackgroundName = (typeof CHAT_BACKGROUND_NAMES)[number];

export const DEFAULT_CHAT_BACKGROUND: ChatBackgroundName = "clouds";

function readStoredBackground(): ChatBackgroundName {
  if (typeof window === "undefined") return DEFAULT_CHAT_BACKGROUND;
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_CHAT_BACKGROUND);
    if (stored && (CHAT_BACKGROUND_NAMES as readonly string[]).includes(stored)) {
      return stored as ChatBackgroundName;
    }
  } catch {
    // localStorage unavailable — fall through to default
  }
  return DEFAULT_CHAT_BACKGROUND;
}

// Module-level fan-out so every hook instance (chat area now, a settings
// panel later) sees a change immediately without a page reload.
const changeListeners = new Set<(_name: ChatBackgroundName) => void>();

/**
 * Persisted user preference for the empty-chat ambient background.
 * Defaults to "clouds" (on). All hook instances stay in sync within the
 * tab; other tabs pick the value up on their next mount.
 */
export function useChatBackgroundSetting(): [
  ChatBackgroundName,
  (_name: ChatBackgroundName) => void,
] {
  const [background, setBackground] = useState<ChatBackgroundName>(
    readStoredBackground,
  );

  useEffect(() => {
    const listener = (name: ChatBackgroundName) => setBackground(name);
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  }, []);

  const setChatBackground = useCallback((name: ChatBackgroundName) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_CHAT_BACKGROUND, name);
    } catch {
      // Persistence best-effort — still update the session
    }
    for (const listener of changeListeners) listener(name);
  }, []);

  return [background, setChatBackground];
}
