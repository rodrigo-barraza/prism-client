"use client";

/**
 * The conversation's stats: what useConversationStats derives from the
 * messages and the backend's aggregate (the history entry's live badges
 * read it), and — while the Settings tab shows them — the stats the panel
 * displays (utils/displayConversationStats), whose token counts never go
 * down within one load.
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import useConversationStats from "./useConversationStats";
import {
  buildDisplayConversationStats,
  raiseTokenMark,
  ZERO_TOKEN_MARK,
  type TokenMark,
} from "../utils/displayConversationStats";
import type { ConversationStats } from "../types/types";
import type { ClientMessage, SubAgentActivityEntry } from "../utils/agentConversationReducer";

interface UseDisplayConversationStatsOptions {
  messages: ClientMessage[];
  backendConversationStats: ConversationStats | null;
  isBackendStatsStale: boolean;
  subAgentToolActivity: Record<string, SubAgentActivityEntry>;
  currentTurnStart: number | null;
  subAgentCount: number;
  maxSubAgentDepth: number;
  /** The Settings tab is on screen: build what it shows. */
  isShown: boolean;
}

export default function useDisplayConversationStats({
  messages,
  backendConversationStats,
  isBackendStatsStale,
  subAgentToolActivity,
  currentTurnStart,
  subAgentCount,
  maxSubAgentDepth,
  isShown,
}: UseDisplayConversationStatsOptions) {
  const clientStats = useConversationStats(messages, {
    modelNames: backendConversationStats?.models,
    providers: backendConversationStats?.providers,
    totalCost: backendConversationStats?.totalCost,
    inputTokens: backendConversationStats?.totalInputTokens,
    outputTokens: backendConversationStats?.totalOutputTokens,
    toolCounts: backendConversationStats?.toolCounts,
    modalities: backendConversationStats?.modalities,
    totalElapsedTime: backendConversationStats?.totalElapsedTime,
    requestCount: backendConversationStats?.requestCount,
  });

  // Frontend-side high-water marks for token display: the token badges
  // never show a lower number than a committed render showed, whichever
  // computation path produced the values. A render reads the mark and
  // reports what it displayed; the mark is raised after commit — never
  // written during render, and never a render of its own.
  const tokenMarkRef = useRef<TokenMark>(ZERO_TOKEN_MARK);
  const { stats, displayedTokens } = isShown
    ? buildDisplayConversationStats({
        messages,
        backendConversationStats,
        isBackendStatsStale,
        clientStats,
        subAgentToolActivity,
        currentTurnStart,
        subAgentCount,
        maxSubAgentDepth,
        // eslint-disable-next-line react-hooks/refs -- the mark committed renders showed; raised after commit below
        tokenMark: tokenMarkRef.current,
      })
    : { stats: null, displayedTokens: null };
  useLayoutEffect(() => {
    if (displayedTokens) tokenMarkRef.current = raiseTokenMark(tokenMarkRef.current, displayedTokens);
  });

  /** A conversation was opened or reset: its badges start from zero. */
  const resetTokenMark = useCallback(() => {
    tokenMarkRef.current = ZERO_TOKEN_MARK;
  }, []);

  return { clientStats, stats, resetTokenMark };
}
