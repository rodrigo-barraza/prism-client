"use client";

/**
 * What the system prompt of the next agent turn will be, before it is sent.
 *
 * - The Raw view of a conversation that has not had a turn shows the
 *   prompt the service would assemble now (its preview endpoint).
 * - An empty conversation's context budget shows how much of the window the
 *   system prompt, tool schemas and locale already take.
 *
 * Both are debounced 300 ms behind the settings they depend on.
 */

import { useEffect, useState } from "react";
import PrismService from "../services/PrismService";
import type { AgentConversationSetters } from "./useAgentConversation";
import type { ChatSettings } from "./useChatModelSettings";

interface UseSystemPromptPreviewOptions {
  showRaw: boolean;
  isNoAgent: boolean;
  agentId: string;
  messageCount: number;
  disabledTools: ReadonlySet<string>;
  lockedOffTools: ReadonlyMap<string, string>;
  settings: ChatSettings;
  setContextBudget: AgentConversationSetters["setContextBudget"];
}

export default function useSystemPromptPreview({
  showRaw,
  isNoAgent,
  agentId,
  messageCount,
  disabledTools,
  lockedOffTools,
  settings,
  setContextBudget,
}: UseSystemPromptPreviewOptions): string | null {
  const [previewSystemPrompt, setPreviewSystemPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!showRaw || isNoAgent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setPreviewSystemPrompt(null);
      return;
    }

    // For existing agent conversations (messages already sent), the DB's
    // systemPrompt is the authoritative prompt that was sent to providers.
    // Calling the preview endpoint would re-assemble from scratch AND inject
    // the stored prompt as "User System Instruction", causing duplication.
    // Only call the preview for NEW conversations where no agent turn has
    // happened yet and we need to show what the prompt WILL look like.
    if (messageCount > 0 && settings.systemPrompt) {
      setPreviewSystemPrompt(null);
      return;
    }

    const debounceTimer = setTimeout(() => {
      const allDisabledTools = [...disabledTools, ...lockedOffTools.keys()];
      PrismService.previewSystemPrompt({
        agent: agentId || undefined,
        disabledTools: allDisabledTools,
        workspaceEnabled: settings.agents?.workspaceEnabled !== false,
        locale: settings.agents?.locale || undefined,
        model: settings.model || undefined,
      })
        .then((result) => {
          setPreviewSystemPrompt(result.prompt);
          if (result.baselineBudget) {
            setContextBudget(result.baselineBudget);
          }
        })
        .catch((error: unknown) => {
          console.error("[SystemPromptPreview] Failed to fetch preview:", error);
          setPreviewSystemPrompt(null);
        });
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [
    showRaw,
    isNoAgent,
    agentId,
    messageCount,
    disabledTools,
    lockedOffTools,
    settings.agents?.workspaceEnabled,
    settings.agents?.locale,
    settings.systemPrompt,
    settings.model,
    setContextBudget,
  ]);

  // -- Baseline context budget for new conversations -----------------
  // When no messages exist yet, fetch the baseline budget so the user
  // can see how much of the context window is consumed by the system
  // prompt, tool schemas, and locale before sending a message.
  // This runs independently of showRaw (the prompt preview effect above
  // handles its own baseline call when Raw view is active).
  useEffect(() => {
    if (messageCount > 0 || isNoAgent || showRaw) return;
    if (!settings.provider || !settings.model) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
      setContextBudget(null);
      return;
    }

    const debounceTimer = setTimeout(() => {
      const allDisabledTools = [...disabledTools, ...lockedOffTools.keys()];
      PrismService.previewSystemPrompt({
        agent: agentId || undefined,
        disabledTools: allDisabledTools,
        workspaceEnabled: settings.agents?.workspaceEnabled !== false,
        locale: settings.agents?.locale || undefined,
        model: settings.model || undefined,
      })
        .then((result) => {
          if (result.baselineBudget) {
            setContextBudget(result.baselineBudget);
          }
        })
        .catch((error: unknown) => {
          console.error("[BaselineBudget] Failed to fetch estimate:", error);
        });
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [
    messageCount,
    isNoAgent,
    showRaw,
    agentId,
    disabledTools,
    lockedOffTools,
    settings.agents?.workspaceEnabled,
    settings.agents?.locale,
    settings.systemPrompt,
    settings.model,
    settings.provider,
    setContextBudget,
  ]);

  return previewSystemPrompt;
}
