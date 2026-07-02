import { useMemo } from "react";
import {
  toolCountsToUsedTools,
  extractLiveStreamingMetrics,
} from "../utils/utilities";

import type { Message, Conversation } from "../types/types";

/**
 * useConversationStats — memoised session statistics from a messages array.
 *
 * Refactored to leverage authoritative server-persisted fields from the
 * conversation document, falling back to lightweight streaming metrics
 * only when necessary.
 */
export default function useConversationStats(
  messages: Message[],
  conversation?: Conversation | null,
) {
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

  const elapsedTime = useMemo(
    () => (conversation as any)?.totalElapsedTime ?? 0,
    [conversation],
  );

  return {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens: authoritativeTotalTokens,
    requestCount: (conversation as any)?.requestCount ?? 0,
    usedTools,
    modalities,
    elapsedTime,
    ...streamingMetrics,
  };
}
