"use client";

import { useEffect, useState } from "react";
import PermissionRulesService from "../services/PermissionRulesService";
import { getErrorMessage } from "../utils/errorMessage";
import { isPermissionMode, type PermissionMode, type PermissionModeInfo } from "../types/permissions";
import styles from "./PermissionRulesPanelComponent.module.css";

/**
 * Settings → Permissions: the mode a conversation starts in when it has not
 * picked one (`settings.permissions.defaultMode`). Bypass is not offered —
 * it is chosen per conversation, never inherited. Unattended runs (scheduled
 * tasks, timers) ignore this and start in don't-ask.
 */
export default function DefaultPermissionModeComponent() {
  const [modes, setModes] = useState<PermissionModeInfo[]>([]);
  const [defaultMode, setDefaultMode] = useState<PermissionMode>("default");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    PermissionRulesService.getMode()
      .then((state) => {
        if (cancelled) return;
        setModes((state.modes ?? []).filter((mode) => mode.id !== "bypass"));
        if (isPermissionMode(state.defaultMode)) setDefaultMode(state.defaultMode);
      })
      .catch(() => {
        if (!cancelled) setModes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (modes.length === 0) return null;
  const current = modes.find((mode) => mode.id === defaultMode);

  const change = async (next: PermissionMode) => {
    const previous = defaultMode;
    setDefaultMode(next);
    setSaving(true);
    setError(null);
    try {
      await PermissionRulesService.setDefaultMode(next);
    } catch (changeError: unknown) {
      setDefaultMode(previous);
      setError(getErrorMessage(changeError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles["default-mode"]} data-testid="default-permission-mode">
      <label className={styles["default-mode-label"]}>
        New conversations start in
        <select
          aria-label="Default permission mode"
          value={defaultMode}
          disabled={saving}
          onChange={(event) => void change(event.target.value as PermissionMode)}
        >
          {modes.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <span className={styles["default-mode-description"]}>{current?.note ?? current?.description}</span>
      {error && (
        <div className={styles["field-error"]} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
