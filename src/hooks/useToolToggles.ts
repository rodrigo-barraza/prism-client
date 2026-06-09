import { useState, useCallback } from "react";
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

  return { disabledTools, handleToggleBuiltIn, handleToggleAllBuiltIn };
}
