import { useState, useCallback } from "react";
import type { ToolSchema } from "../types/types";

/**
 * useToolToggles — manages the disabled built-in tools state and toggle handlers.
 * State is ephemeral (per-session) — resets on page reload so stale corruption
 * from previous sessions cannot persist.
 */
export default function useToolToggles(
  builtInTools: ToolSchema[],
) {
  const [disabledTools, setDisabledTools] = useState<Set<string>>(() => new Set());

  const handleToggleBuiltIn = useCallback((toolName: string) => {
    setDisabledTools((previousDisabledTools) => {
      const nextDisabledTools = new Set(previousDisabledTools);
      if (nextDisabledTools.has(toolName)) nextDisabledTools.delete(toolName);
      else nextDisabledTools.add(toolName);
      return nextDisabledTools;
    });
  }, []);

  const handleToggleAllBuiltIn = useCallback(
    (enableAll: boolean) => {
      setDisabledTools((previousDisabledTools) => {
        const nextDisabledTools = new Set(previousDisabledTools);
        for (const tool of builtInTools) {
          if (enableAll) {
            nextDisabledTools.delete(tool.name);
          } else if (!tool.system) {
            nextDisabledTools.add(tool.name);
          }
        }
        return nextDisabledTools;
      });
    },
    [builtInTools],
  );

  return { disabledTools, handleToggleBuiltIn, handleToggleAllBuiltIn };
}
