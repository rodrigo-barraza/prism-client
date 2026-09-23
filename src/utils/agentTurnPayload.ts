/**
 * The request body of a turn the chat sends: Direct Chat posts to `/chat`
 * (no agentic loop), an agent to `/agent` (AgenticLoopService). Pure — the
 * chat hands it the settings and the controls the turn runs with.
 */

import { DEFAULT_TOPOLOGY } from "@rodrigo-barraza/utilities-library/taxonomy";
import { MESSAGE_ROLES } from "../constants";
import { buildDirectChatConversationMeta } from "./directChatMeta";
import type { ChatSettings } from "../hooks/useChatModelSettings";
import type { ClientMessage } from "./agentConversationReducer";

export interface TurnPayloadInputs {
  isNoAgent: boolean;
  settings: ChatSettings;
  messages: ClientMessage[];
  /** Turned off by the user, plus locked off (a settings model or the workspace missing). */
  disabledTools: string[];
  conversationId: string;
  traceId: string | null;
  agentId: string;
  agentProject: string | undefined;
  activeRuleNames: string[];
  permissionMode: string;
  planFirst: boolean;
  maxIterations: number;
  maxSubAgentIterations: number;
  maxRecursionDepth: number;
}

export function buildTurnPayload({
  isNoAgent,
  settings,
  messages,
  disabledTools,
  conversationId,
  traceId,
  agentId,
  agentProject,
  activeRuleNames,
  permissionMode,
  planFirst,
  maxIterations,
  maxSubAgentIterations,
  maxRecursionDepth,
}: TurnPayloadInputs): { path: "/chat" | "/agent"; payload: Record<string, unknown> } {
  const currentMessages = [...messages];
  if (isNoAgent) {
    return {
      path: "/chat",
      payload: {
        // Direct Chat: raw /chat endpoint — no agentic loop
        provider: settings.provider ?? "",
        model: settings.model ?? "",
        messages: [
          ...(settings.systemPrompt
            ? [
                {
                  role: MESSAGE_ROLES.SYSTEM,
                  content: settings.systemPrompt,
                },
              ]
            : []),
          ...currentMessages,
        ],
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
        ...(settings.thinkingEnabled !== undefined && {
          thinkingEnabled: settings.thinkingEnabled,
        }),
        ...(settings.reasoningEffort && {
          reasoningEffort: settings.reasoningEffort,
        }),
        ...(settings.thinkingBudget && {
          thinkingBudget: settings.thinkingBudget,
        }),
        ...(settings.thinkingLevel && {
          thinkingLevel: settings.thinkingLevel,
        }),
        // Native provider FC (Google code exec, LM Studio MCP, etc.)
        functionCallingEnabled: settings.functionCallingEnabled ?? false,
        ...(settings.functionCallingEnabled && {
          disabledTools,
        }),
        // Provider-native capabilities
        ...(settings.webSearchEnabled ? { webSearch: true } : {}),
        ...(settings.codeExecutionEnabled ? { codeExecution: true } : {}),
        ...(settings.urlContextEnabled ? { urlContext: true } : {}),
        conversationId,
        // Always present — its presence is the /chat turn-start marker
        // that makes the service persist the user's own prompt. See
        // buildDirectChatConversationMeta.
        conversationMeta: buildDirectChatConversationMeta(settings.systemPrompt),
        // Omit project — falls back to x-project header ("prism"),
        // routing to the conversations collection
        traceId,
      },
    };
  }
  return {
    path: "/agent",
    payload: {
      // Agent mode: full /agent endpoint with AgenticLoopService.
      // No system placeholder — the harness assembles the system
      // prompt server-side and feeds it to providers as a
      // first-class parameter, never via the messages array.
      provider: settings.provider ?? "",
      model: settings.model ?? "",
      messages: currentMessages,
      functionCallingEnabled: true,
      disabledTools,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
      ...(settings.thinkingEnabled !== undefined && {
        thinkingEnabled: settings.thinkingEnabled,
      }),
      ...(settings.reasoningEffort && {
        reasoningEffort: settings.reasoningEffort,
      }),
      ...(settings.thinkingBudget && {
        thinkingBudget: settings.thinkingBudget,
      }),
      ...(settings.thinkingLevel && {
        thinkingLevel: settings.thinkingLevel,
      }),
      project: agentProject,
      conversationId,
      traceId,
      agent: agentId,
      ...(activeRuleNames.length > 0 && { activeRuleNames }),
      // Send only explicit user overrides — the server owns the
      // defaults (harness "standard", minContextLength, agent).
      ...(settings?.agents?.harness && {
        harness: settings.agents.harness,
      }),
      topology: settings?.agents?.topology || DEFAULT_TOPOLOGY,
      thoughtStructure: (settings?.agents?.thoughtStructure as string) || undefined,
      // Phase 1: Agentic controls
      permissionMode,
      planFirst,
      maxIterations: Number.isFinite(maxIterations) ? maxIterations : 0,
      maxSubAgentIterations: Number.isFinite(maxSubAgentIterations) ? maxSubAgentIterations : 0,
      maxRecursionDepth,
      ...(settings.agents?.workspaceEnabled === false && {
        workspaceEnabled: false,
      }),
      ...(settings.agents?.locale && {
        locale: settings.agents.locale,
      }),
    },
  };
}
