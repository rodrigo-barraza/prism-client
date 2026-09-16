"use client";

/**
 * Which way the composer sends while a turn is running:
 *  - "update" (default): `POST /agent/input` — steer the running turn,
 *  - "queue": hold the message and send it when the turn ends.
 * The choice is remembered per browser; it only matters while generating.
 */
import { useCallback } from "react";
import { usePersistedState } from "./usePersistedState";
import {
  DEFAULT_COMPOSER_SEND_MODE,
  type ComposerSendMode,
} from "../utils/turnInputRouting";

const STORAGE_KEY = "prism:composer-send-mode";

export default function useComposerSendMode(): [
  ComposerSendMode,
  (_mode: ComposerSendMode) => void,
] {
  const [mode, setMode] = usePersistedState<ComposerSendMode>(
    STORAGE_KEY,
    DEFAULT_COMPOSER_SEND_MODE,
  );
  const safeMode: ComposerSendMode = mode === "queue" ? "queue" : "update";
  const set = useCallback((next: ComposerSendMode) => setMode(next), [setMode]);
  return [safeMode, set];
}
