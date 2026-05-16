import { useMemo } from "react";
import {
  getUniqueModels,
  getUniqueProviders,
  getSessionCost,
  getSessionTokenStats,
  getUsedTools,
  getModalities,
  getSessionElapsedTime,
} from "../utils/utilities";

/**
 * useSessionStats — memoised session statistics from a messages array.
 *
 * Replaces the 5–6 line `useMemo` block that was copy-pasted across
 * AgentComponent, AdminAgentViewerComponent, and
 * admin/conversations/page.
 *
 * @param {Array} messages — the messages array to derive stats from
 * @returns {{ uniqueModels, totalCost, totalTokens, requestCount, usedTools, modalities, elapsedTime }}
 */
export default function useSessionStats(messages: any) {
  const uniqueModels = useMemo<any>(() => getUniqueModels(messages), [messages]);
  const uniqueProviders = useMemo<any>(() => getUniqueProviders(messages), [messages]);
  const totalCost = useMemo<any>(() => getSessionCost(messages), [messages]);
  const { totalTokens, requestCount, liveStreamingTokens, liveStreamingStartTime, liveStreamingLastChunkTime, liveStreamingBurstTokens, liveStreamingBurstElapsed, workerGenerationProgress, lastTimeToGeneration, liveProcessingStartTime, liveProcessingPhase, liveTtftSamples, liveGenProgress } = useMemo<any>(
    () => getSessionTokenStats(messages),
    [messages],
  );
  const usedTools = useMemo<any>(() => getUsedTools(messages), [messages]);
  const modalities = useMemo<any>(() => getModalities(messages), [messages]);
  const elapsedTime = useMemo<any>(
    () => getSessionElapsedTime(messages),
    [messages],
  );

  return {
    uniqueModels,
    uniqueProviders,
    totalCost,
    totalTokens,
    requestCount,
    usedTools,
    modalities,
    elapsedTime,
    liveStreamingTokens,
    liveStreamingStartTime,
    liveStreamingLastChunkTime,
    liveStreamingBurstTokens,
    liveStreamingBurstElapsed,
    workerGenerationProgress,
    lastTimeToGeneration,
    liveProcessingStartTime,
    liveProcessingPhase,
    liveTtftSamples,
    liveGenProgress,
  };
}
