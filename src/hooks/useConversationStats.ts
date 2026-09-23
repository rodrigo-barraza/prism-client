import { useMemo } from "react";
import {
  toolCountsToUsedTools,
  extractLiveStreamingMetrics,
} from "../utils/utilities";

import type { Message } from "../types/types";
import type { ClientConversationStats } from "../utils/displayConversationStats";

/** The backend's aggregate for the conversation on screen, as the chat holds it. */
export interface ConversationStatsSource {
  modelNames?: string[];
  providers?: string[];
  totalCost?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolCounts?: Record<string, number>;
  modalities?: Record<string, number>;
  totalElapsedTime?: number;
  requestCount?: number;
}

/**
 * useConversationStats — memoised session statistics from a messages array.
 *
 * Refactored to leverage authoritative server-persisted fields from the
 * conversation document, falling back to lightweight streaming metrics
 * only when necessary.
 */
export default function useConversationStats(
  messages: Message[],
  conversation?: ConversationStatsSource | null,
): ClientConversationStats {
  const uniqueModels = useMemo(
    () => conversation?.modelNames || [],
    [conversation?.modelNames],
  );

  const uniqueProviders = useMemo(
    () => conversation?.providers || [],
    [conversation?.providers],
  );

  const totalCost = useMemo(
    () => conversation?.totalCost ?? 0,
    [conversation?.totalCost],
  );

  const streamingMetrics = useMemo(
    () => extractLiveStreamingMetrics(messages),
    [messages],
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- manual memoization is authoritative; React Compiler not enabled
  const authoritativeTotalTokens = useMemo(() => {
    if (conversation?.inputTokens != null && conversation?.outputTokens != null) {
      return {
        input: conversation.inputTokens,
        output: conversation.outputTokens,
        total: conversation.inputTokens + conversation.outputTokens,
      };
    }
    return { input: 0, output: 0, total: 0 };
  }, [conversation?.inputTokens, conversation?.outputTokens]);

  const usedTools = useMemo(() => {
    return toolCountsToUsedTools(conversation?.toolCounts);
  }, [conversation?.toolCounts]);

  const modalities = useMemo(
    () => conversation?.modalities || {},
    [conversation?.modalities],
  );

  const elapsedTime = conversation?.totalElapsedTime ?? 0;

  return {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens: authoritativeTotalTokens,
    requestCount: conversation?.requestCount ?? 0,
    usedTools,
    modalities,
    elapsedTime,
    ...streamingMetrics,
  };
}
