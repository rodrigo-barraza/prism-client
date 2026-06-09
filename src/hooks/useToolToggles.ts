import { useState, useCallback, useEffect, useRef } from "react";
import type { ToolSchema } from "../types/types";

/**
 * useToolToggles — manages the disabled built-in tools state and toggle handlers.
 * State is ephemeral (per-session) — resets on page reload so stale corruption
 * from previous sessions cannot persist.
 */
export default function useToolToggles(
  builtInTools: ToolSchema[],
  coreToolsLocked: boolean = true,
) {
  const [disabledTools, setDisabledTools] = useState<Set<string>>(() => new Set());
  const hasInitializedRef = useRef(false);

  const handleToggleBuiltIn = useCallback(
    (toolName: string) => {
      if (coreToolsLocked) {
        const tool = builtInTools.find((t) => t.name === toolName);
        if (tool?.system) return;
      }
      setDisabledTools((previousDisabledTools) => {
        const nextDisabledTools = new Set(previousDisabledTools);
        if (nextDisabledTools.has(toolName)) nextDisabledTools.delete(toolName);
        else nextDisabledTools.add(toolName);
        return nextDisabledTools;
      });
    },
    [builtInTools, coreToolsLocked],
  );

  const handleToggleAllBuiltIn = useCallback(
    (enableAll: boolean) => {
      setDisabledTools((previousDisabledTools) => {
        const nextDisabledTools = new Set(previousDisabledTools);
        for (const tool of builtInTools) {
          if (enableAll) {
            nextDisabledTools.delete(tool.name);
          } else if (!(coreToolsLocked && tool.system)) {
            nextDisabledTools.add(tool.name);
          }
        }
        return nextDisabledTools;
      });
    },
    [builtInTools, coreToolsLocked],
  );

  const resetToAllDisabled = useCallback(() => {
    const allConfigurableDisabled = new Set<string>();
    for (const tool of builtInTools) {
      if (!(coreToolsLocked && tool.system)) {
        allConfigurableDisabled.add(tool.name);
      }
    }
    setDisabledTools(allConfigurableDisabled);
    hasInitializedRef.current = true;
  }, [builtInTools, coreToolsLocked]);

  const restoreDisabledTools = useCallback((toolNames: string[]) => {
    setDisabledTools(new Set(toolNames));
    hasInitializedRef.current = true;
  }, []);

  useEffect(() => {
    if (builtInTools.length > 0 && !hasInitializedRef.current) {
      resetToAllDisabled();
    }
  }, [builtInTools, resetToAllDisabled]);

  return {
    disabledTools,
    handleToggleBuiltIn,
    handleToggleAllBuiltIn,
    resetToAllDisabled,
    restoreDisabledTools,
  };
}
