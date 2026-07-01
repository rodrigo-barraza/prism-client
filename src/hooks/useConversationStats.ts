import { useMemo } from "react";
import {
  getUniqueModelNames,
  getUniqueProviders,
  getConversationCost,
  computeConversationTokenMetrics,
  getUsedTools,
  computeConversationModalities,
  getConversationElapsedTime,
} from "../utils/utilities";

import type { Message, Conversation } from "../types/types";

/**
 * useConversationStats — memoised session statistics from a messages array.
 *
 * Replaces the 5–6 line `useMemo` block that was copy-pasted across
 * ChatConversationComponent, AdminAgentViewerComponent, and
 * admin/conversations/page.
 */
export default function useConversationStats(
  messages: Message[],
  conversation?: Conversation | null,
) {
  const uniqueModels = useMemo(() => getUniqueModelNames(messages), [messages]);
  const uniqueProviders = useMemo(
    () => getUniqueProviders(messages),
    [messages],
  );
  const totalCost = useMemo(
    () => conversation?.totalCost ?? getConversationCost(messages),
    [messages, conversation?.totalCost],
  );
  const {
    totalTokens,
    requestCount,
    liveStreamingTokens,
    liveStreamingStartTime,
    liveStreamingLastChunkTime,
    liveStreamingBurstTokens,
    liveStreamingBurstElapsed,
    subAgentGenerationProgress,
    lastTimeToGeneration,
    liveProcessingStartTime,
    liveProcessingPhase,
    liveTtftSamples,
    liveGenProgress,
  } = useMemo(
    () => computeConversationTokenMetrics(messages),
    [messages],
  );

  // If we have authoritative token counts from the server, use them
  const authoritativeTotalTokens = useMemo(() => {
    if (conversation?.inputTokens != null && conversation?.outputTokens != null) {
      return {
        input: conversation.inputTokens,
        output: conversation.outputTokens,
        total: conversation.inputTokens + conversation.outputTokens,
      };
    }
    return totalTokens;
  }, [conversation?.inputTokens, conversation?.outputTokens, totalTokens]);

  const usedTools = useMemo(() => {
    // If we have authoritative tool counts from the server, we could use them,
    // but getUsedTools also includes "Thinking" and "Tool Calling" capabilities
    // which aren't currently stored in the toolCounts map.
    return getUsedTools(messages);
  }, [messages]);

  const modalities = useMemo(
    () => conversation?.modalities || computeConversationModalities(messages),
    [messages, conversation?.modalities],
  );
  const elapsedTime = useMemo(
    () => getConversationElapsedTime(messages),
    [messages],
  );

  return {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens: authoritativeTotalTokens,
    requestCount,
    usedTools,
    modalities,
    elapsedTime,
    liveStreamingTokens,
    liveStreamingStartTime,
    liveStreamingLastChunkTime,
    liveStreamingBurstTokens,
    liveStreamingBurstElapsed,
    subAgentGenerationProgress,
    lastTimeToGeneration,
    liveProcessingStartTime,
    liveProcessingPhase,
    liveTtftSamples,
    liveGenProgress,
  };
}
