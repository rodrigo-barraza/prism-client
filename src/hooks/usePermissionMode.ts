"use client";

/**
 * The conversation's permission mode (`/permissions/mode`).
 *
 * Loaded per conversation (a conversation the server has never stored reads
 * as the settings default), switched by the selector, and kept current by
 * `permission_mode` stream events — the mode a turn actually started in (a
 * refused bypass comes back as `default`), a switch from another tab, and
 * plan mode ending when a plan is approved.
 *
 * A switch is stored on the conversation and reaches its running turn at
 * the next tool call. A conversation that has no server document yet (a new
 * chat before its first send) answers 404; the mode then rides the first
 * request (`permissionMode` in the `/agent` body), which stores it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import PermissionRulesService from "../services/PermissionRulesService";
import { getErrorMessage } from "../utils/errorMessage";
import {
  isPermissionMode,
  type PermissionMode,
  type PermissionModeInfo,
} from "../types/permissions";
import type { PermissionModeEvent } from "../types/types";

export interface PermissionModeApi {
  mode: PermissionMode;
  /** The modes on offer, for this user. Empty until loaded (or on a server without modes). */
  modes: PermissionModeInfo[];
  defaultMode: PermissionMode;
  isBusy: boolean;
  error: string | null;
  /** Something the server reported about the mode (a refused bypass). */
  notice: string | null;
  /** The user picked a mode on the selector. */
  change: (_mode: PermissionMode) => Promise<void>;
  /** Apply a `permission_mode` stream event. */
  applyEvent: (_event: PermissionModeEvent) => void;
}

export default function usePermissionMode(
  conversationId: string | null | undefined,
): PermissionModeApi {
  const [mode, setMode] = useState<PermissionMode>("default");
  const [modes, setModes] = useState<PermissionModeInfo[]>([]);
  const [defaultMode, setDefaultMode] = useState<PermissionMode>("default");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Actions read the CURRENT conversation at call time — kept in a ref.
  const conversationIdRef = useRef(conversationId);
  const modeRef = useRef(mode);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    PermissionRulesService.getMode(conversationId)
      .then((state) => {
        if (cancelled) return;
        setModes(state.modes ?? []);
        if (isPermissionMode(state.defaultMode)) setDefaultMode(state.defaultMode);
        if (isPermissionMode(state.mode)) setMode(state.mode);
        setError(null);
        setNotice(null);
      })
      .catch(() => {
        // A server without modes: the selector stays hidden.
        if (!cancelled) setModes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const change = useCallback(async (next: PermissionMode) => {
    const id = conversationIdRef.current;
    const previous = modeRef.current;
    if (next === previous) return;
    setMode(next);
    setError(null);
    setNotice(null);
    if (!id) return;
    setIsBusy(true);
    try {
      await PermissionRulesService.setMode(id, next);
    } catch (changeError: unknown) {
      // Not stored yet — the first send carries (and stores) the mode.
      if ((changeError as { status?: number }).status === 404) return;
      if (conversationIdRef.current === id) {
        setMode(previous);
        setError(getErrorMessage(changeError));
      }
    } finally {
      setIsBusy(false);
    }
  }, []);

  const applyEvent = useCallback((event: PermissionModeEvent) => {
    const eventConversation = event.conversationId;
    if (eventConversation && eventConversation !== conversationIdRef.current) return;
    if (isPermissionMode(event.mode)) setMode(event.mode);
    if (event.refused === "bypass") {
      setNotice(typeof event.reason === "string" ? `Bypass refused: ${event.reason}` : "Bypass refused.");
    }
  }, []);

  return { mode, modes, defaultMode, isBusy, error, notice, change, applyEvent };
}
