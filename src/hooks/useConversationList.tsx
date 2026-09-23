"use client";

/**
 * The agent chat's conversation list (the history panel): loading it and
 * its next pages, which conversations are generating, the listed entry of
 * the conversation on screen kept current while it streams, and deleting a
 * conversation with a ten-second undo.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import PrismService from "../services/PrismService";
import type { AgentConversation, Conversation, ConversationStats } from "../types/types";
import type { AgentConversationState, ClientMessage } from "../utils/agentConversationReducer";

type ListedConversation = AgentConversation | Conversation;

/** Fields the chat writes onto a listed entry while its conversation streams. */
interface LiveEnrichment {
  _liveModelNames?: unknown;
  _liveModalities?: unknown;
}

/**
 * The listing `items` merged over what the list shows: the model and
 * modality badges the live patch wrote survive until the backend has its
 * own, and sub-agents spawned in the last minute (not in the database yet)
 * stay listed.
 */
function mergeListing(previousConversations: ListedConversation[], items: ListedConversation[]): ListedConversation[] {
  // Preserve client-side live enrichments (_liveModelNames,
  // _liveModalities, providers) that the live-patch effect wrote
  // during active generation. The backend listing response may
  // not yet reflect these fields — without this merge, model
  // badges vanish from history items after a conversation switch
  // triggers a change-stream list refresh.
  const liveEnrichmentsByConversationId = new Map<string, LiveEnrichment>();
  for (const previousConversation of previousConversations) {
    const enrichedConversation = previousConversation as unknown as Record<string, unknown>;
    if (enrichedConversation._liveModelNames || enrichedConversation._liveModalities) {
      liveEnrichmentsByConversationId.set(previousConversation.id || String(previousConversation._id), {
        _liveModelNames: enrichedConversation._liveModelNames,
        _liveModalities: enrichedConversation._liveModalities,
      });
    }
  }

  // Preserve optimistically injected sub-agent entries that don't
  // exist in MongoDB yet. The hasSubAgents write on the parent
  // triggers a change-stream → loadConversations() runs before
  // the sub-agent's first appendAndFinalize creates its document.
  // Without this, the sub-agent vanishes from the sidebar until
  // its MongoDB document is created and a subsequent reload picks it up.
  //
  // IMPORTANT: Only preserve entries that are genuinely optimistic
  // (recently created, still generating). Old sub-agent entries that
  // fell off the API pagination window must NOT be preserved — doing
  // so causes stale conversations to appear at the top of the list
  // since they get prepended without sorting.
  const apiResponseIds = new Set(items.map((entry) => entry.id || String(entry._id)));
  const OPTIMISTIC_ENTRY_AGE_THRESHOLD_MS = 60_000;
  const optimisticCutoffTimestamp = Date.now() - OPTIMISTIC_ENTRY_AGE_THRESHOLD_MS;
  const optimisticSubAgentEntries = previousConversations.filter((previousConversation) => {
    const conversationId = previousConversation.id || String(previousConversation._id);
    const hasParent = !!(previousConversation as AgentConversation).parentConversationId;
    if (!hasParent || apiResponseIds.has(conversationId)) return false;
    // Only preserve entries injected very recently (within the last
    // 60 seconds) or still actively generating. Older entries that
    // dropped off the pagination window are stale and must not be
    // re-injected at the top of the list.
    const createdTimestamp = new Date(previousConversation.createdAt || previousConversation.updatedAt || 0).getTime();
    const isRecentlyCreated = createdTimestamp > optimisticCutoffTimestamp;
    const isActivelyGenerating = !!(previousConversation as unknown as Record<string, unknown>).isGenerating;
    return isRecentlyCreated || isActivelyGenerating;
  });

  let mergedConversations: ListedConversation[];
  if (liveEnrichmentsByConversationId.size === 0) {
    mergedConversations = items;
  } else {
    mergedConversations = items.map((entry) => {
      const entryId = entry.id || String(entry._id);
      const enrichment = liveEnrichmentsByConversationId.get(entryId);
      if (!enrichment) return entry;

      const backendEntry = entry as unknown as Record<string, unknown>;
      const backendHasModelNames =
        Array.isArray(backendEntry.modelNames) && (backendEntry.modelNames as string[]).length > 0;

      // If the backend already has authoritative modelNames,
      // the client-side enrichment is no longer needed.
      if (backendHasModelNames) return entry;

      return { ...entry, ...enrichment } as typeof entry;
    });
  }

  if (optimisticSubAgentEntries.length > 0) {
    // Merge and re-sort to maintain correct updatedAt descending order
    const combinedConversations = [...optimisticSubAgentEntries, ...mergedConversations];
    combinedConversations.sort((conversationA, conversationB) => {
      const timestampA = new Date(conversationA.updatedAt || conversationA.createdAt || 0).getTime();
      const timestampB = new Date(conversationB.updatedAt || conversationB.createdAt || 0).getTime();
      return timestampB - timestampA;
    });
    return combinedConversations;
  }
  return mergedConversations;
}

interface UseConversationListOptions {
  isAdmin: boolean;
  isNoAgent: boolean;
  agentId: string;
  agentProject: string | undefined;
  activeId: string | null;
  conversationIdRef: React.RefObject<string>;
  getConversationState: () => AgentConversationState;
}

export default function useConversationList({
  isAdmin,
  isNoAgent,
  agentId,
  agentProject,
  activeId,
  conversationIdRef,
  getConversationState,
}: UseConversationListOptions) {
  const [conversations, setConversations] = useState<ListedConversation[]>([]);
  const conversationsCursorRef = useRef<string | null>(null);
  const [conversationsHasMore, setConversationsHasMore] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  // Track which conversations have active background generation (for history indicator)
  const [generatingConversationIds, setGeneratingConversationIds] = useState<Set<string>>(() => new Set());

  // Load conversation history — Direct Chat reads from conversations collection
  const loadConversations = useCallback(async () => {
    try {
      setConversationsLoading(true);
      const result = isNoAgent
        ? await PrismService.getConversations()
        : await PrismService.getAgentConversations(agentProject!, {
            agent: agentId,
          });
      setConversations((previousConversations) => mergeListing(previousConversations, result.items));

      // Reconcile generatingConversationIds with DB-persisted flags — both
      // directions. Adding covers page refresh mid-generation; removing covers
      // the race where a list fetch (started before a sub-agent's completion
      // write landed) re-added an id after the `complete` SSE event already
      // cleared it. Ids absent from this page of results are left untouched:
      // the fetch says nothing about them.
      const stillActiveConversationIds = new Set<string>();
      const settledConversationIds = new Set<string>();
      for (const entry of result.items) {
        const record = entry as unknown as Record<string, unknown>;
        const entryId = entry.id || String(entry._id);
        if (record.isActive === true || record.isGenerating === true) {
          stillActiveConversationIds.add(entryId);
        } else {
          settledConversationIds.add(entryId);
        }
      }
      if (stillActiveConversationIds.size > 0 || settledConversationIds.size > 0) {
        // Never remove the conversation this client is actively streaming —
        // the listing may predate the backend's markGenerating(true) write
        // (the handleSend → change-stream stale window).
        const streamingConversationId = getConversationState().isGenerating
          ? conversationIdRef.current
          : null;
        setGeneratingConversationIds((previousIds) => {
          const next = new Set(previousIds);
          for (const conversationId of stillActiveConversationIds) next.add(conversationId);
          for (const conversationId of settledConversationIds) {
            if (conversationId === streamingConversationId) continue;
            next.delete(conversationId);
          }
          return next;
        });
      }

      conversationsCursorRef.current = result.nextCursor;
      setConversationsHasMore(result.hasMore);
    } catch (error: unknown) {
      console.error("Failed to load conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  }, [agentProject, agentId, isNoAgent, getConversationState, conversationIdRef]);
  // For callbacks that must reach the current loader after this render.
  const loadConversationsRef = useRef(loadConversations);
  useLayoutEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

  const loadMoreConversations = useCallback(async () => {
    if (!conversationsCursorRef.current || conversationsLoading) return;
    try {
      setConversationsLoading(true);
      const fetchOptions = {
        cursor: conversationsCursorRef.current,
        agent: agentId,
      };
      const result = isNoAgent
        ? await PrismService.getConversations(fetchOptions)
        : await PrismService.getAgentConversations(agentProject!, fetchOptions);
      setConversations((previousConversations) => [
        ...previousConversations,
        ...result.items,
      ]);
      conversationsCursorRef.current = result.nextCursor;
      setConversationsHasMore(result.hasMore);
    } catch (error: unknown) {
      console.error("Failed to load more conversations:", error);
    } finally {
      setConversationsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- agentId is read at call time; reloads are triggered explicitly on agent switch
  }, [agentProject, isNoAgent, conversationsLoading]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    if (!isAdmin) loadConversations();
  }, [loadConversations, isAdmin]);

  const activeEntry = useMemo(
    () => (activeId ? conversations.find((entry) => entry.id === activeId) : undefined),
    [activeId, conversations],
  );
  // The counter of background work (sub-agents, long tools) that outlives the
  // stream: polled while it is above zero and nothing streams.
  const pendingBackgroundTaskCount =
    (activeEntry as { pendingBackgroundTasks?: number } | undefined)?.pendingBackgroundTasks ?? 0;
  const isActiveConversationSubAgent = !!(
    activeEntry as { parentAgentConversationId?: string | null } | undefined
  )?.parentAgentConversationId;
  // Whether the backend explicitly marks this conversation as still running
  // (isActive === true). Survives page refresh — unlike isGenerating which
  // is client-side SSE state that gets lost when the stream is interrupted.
  const isActiveConversationExplicitlyActive = activeEntry?.isActive === true;
  const isActiveConversationExplicitlyInactive =
    !isActiveConversationExplicitlyActive && activeId != null && activeEntry?.isActive === false;

  /** Patch the listed entry of `conversationId` (no-op when it is not listed). */
  const patchListedConversation = useCallback(
    (conversationId: string, patch: Record<string, unknown>) => {
      setConversations((previousConversations) =>
        previousConversations.map((entry) =>
          entry.id === conversationId ? ({ ...entry, ...patch } as typeof entry) : entry,
        ),
      );
    },
    [],
  );

  return {
    conversations,
    setConversations,
    conversationsHasMore,
    conversationsLoading,
    loadConversations,
    loadConversationsRef,
    loadMoreConversations,
    generatingConversationIds,
    setGeneratingConversationIds,
    pendingBackgroundTaskCount,
    isActiveConversationSubAgent,
    isActiveConversationExplicitlyActive,
    isActiveConversationExplicitlyInactive,
    patchListedConversation,
  };
}

export type ConversationList = ReturnType<typeof useConversationList>;

/**
 * Keep the listed entry of the conversation on screen in sync with the live
 * stats, so the history panel's badges (model, provider, modalities, cost)
 * update while it generates — no list reload needed.
 */
export function useLiveListedConversation({
  list,
  activeId,
  title,
  messages,
  isNoAgent,
  backendConversationStats,
  isBackendStatsStale,
  clientStats,
}: {
  list: ConversationList;
  activeId: string | null;
  title: string;
  messages: readonly ClientMessage[];
  isNoAgent: boolean;
  backendConversationStats: ConversationStats | null;
  isBackendStatsStale: boolean;
  clientStats: {
    uniqueModels: string[];
    uniqueProviders: string[];
    totalCost: number;
    modalities: Record<string, number>;
  };
}) {
  const { setConversations } = list;
  const { uniqueModels, uniqueProviders, totalCost, modalities } = clientStats;
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    setConversations((previousConversations) => {
      const index = previousConversations.findIndex((state) => state.id === activeId);
      if (index === -1) return previousConversations;
      const existing = previousConversations[index] as unknown as Record<
        string,
        unknown
      >;
      const lastMessage = messages[messages.length - 1];
      const bgUsage =
        lastMessage?.role === "assistant"
          ? lastMessage._backgroundUsage
          : null;
      const activeMessageCost =
        lastMessage?.role === "assistant" && isBackendStatsStale
          ? lastMessage.estimatedCost ||
            lastMessage._intermediateEstimatedCost ||
            0
          : 0;
      const resolvedCost = backendConversationStats
        ? (backendConversationStats.totalCost || 0) +
          (bgUsage?.cost || 0) +
          activeMessageCost
        : isNoAgent
          ? Math.max((existing.totalCost as number) || 0, totalCost)
          : totalCost;
      const resolvedModalities: Record<string, number> =
        (backendConversationStats?.modalities ?? modalities) as Record<
          string,
          number
        >;
      const resolvedToolCounts = backendConversationStats?.toolCounts ?? undefined;
      const resolvedProviders =
        uniqueProviders.length > 0 ? uniqueProviders : existing.providers;
      const resolvedModels =
        uniqueModels.length > 0 ? uniqueModels : existing._liveModelNames;
      // Shallow equality check — skip update if nothing visually changed
      const prevMod = existing._liveModalities as
        | Record<string, number>
        | undefined;
      const modSame =
        prevMod &&
        Object.keys(resolvedModalities).every(
          (k) => prevMod[k] === resolvedModalities[k],
        );
      if (
        modSame &&
        existing.totalCost === resolvedCost &&
        existing.title === title &&
        JSON.stringify(existing._liveModelNames) ===
          JSON.stringify(resolvedModels) &&
        JSON.stringify(existing.providers) === JSON.stringify(resolvedProviders)
      ) {
        return previousConversations;
      }
      const updated = [...previousConversations] as unknown as Record<
        string,
        unknown
      >[];
      updated[index] = {
        ...existing,
        title,
        totalCost: resolvedCost,
        modalities: resolvedModalities,
        toolCounts: resolvedToolCounts,
        providers: resolvedProviders as string[],
        _liveModelNames: resolvedModels as string[],
        _liveModalities: resolvedModalities,
        // Preserve the original server-side updatedAt — overwriting it with
        // Date.now() causes the DateTimeBadge to flash "just now" on click.
      };
      return updated as unknown as ListedConversation[];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- agent-status effect keyed to explicit triggers; messages/isNoAgent read as snapshots
  }, [
    activeId,
    title,
    modalities,
    uniqueModels,
    uniqueProviders,
    totalCost,
    backendConversationStats,
    messages.length,
    isBackendStatsStale,
  ]);
}

interface PendingDeletion {
  timeoutId: NodeJS.Timeout;
  conversationEntry: ListedConversation;
  wasActive: boolean;
}

/**
 * Delete a conversation: it leaves the list at once and the server deletes
 * it ten seconds later, unless the toast's Undo puts it back first.
 */
export function useConversationDeletion({
  list,
  activeId,
  isNoAgent,
  agentProject,
  addToast,
  removeToast,
  onActiveDeleted,
  onActiveRestored,
}: {
  list: ConversationList;
  activeId: string | null;
  isNoAgent: boolean;
  agentProject: string | undefined;
  addToast: (_message: ReactNode, _type?: string, _duration?: number) => number;
  removeToast: (_id: number) => void;
  /** The conversation on screen was deleted: a new one takes its place. */
  onActiveDeleted: () => void;
  /** The conversation on screen was put back: show it again. */
  onActiveRestored: (_entry: ListedConversation) => void;
}) {
  const { conversations, setConversations } = list;
  const pendingDeletionsRef = useRef<Map<string, PendingDeletion>>(new Map());

  // Clean up deletion timeouts on unmount
  useEffect(() => {
    const pendingDeletions = pendingDeletionsRef.current;
    return () => {
      pendingDeletions.forEach((pending) => {
        clearTimeout(pending.timeoutId);
      });
    };
  }, []);

  const handleUndoDelete = useCallback(
    (conversationId: string, toastId: number) => {
      const pending = pendingDeletionsRef.current.get(conversationId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pendingDeletionsRef.current.delete(conversationId);

        // Restore the conversation to conversations state
        setConversations((previousConversations) => {
          if (previousConversations.some((conversationItem) => conversationItem.id === conversationId))
            return previousConversations;
          const updated = [...previousConversations, pending.conversationEntry];
          // Sort by updatedAt or createdAt descending
          return updated.sort((conversationA, conversationB) => {
            const dateA = new Date(conversationA.updatedAt || conversationA.createdAt || 0).getTime();
            const dateB = new Date(conversationB.updatedAt || conversationB.createdAt || 0).getTime();
            return dateB - dateA;
          });
        });

        if (pending.wasActive) {
          onActiveRestored(pending.conversationEntry);
        }

        // Dismiss the toast
        removeToast(toastId);
      }
    },
    [removeToast, onActiveRestored, setConversations],
  );

  return useCallback(
    async (conversationId: string) => {
      try {
        const targetConversation = conversations.find((conversationItem) => conversationItem.id === conversationId);
        if (!targetConversation) return;

        const wasActive = activeId === conversationId;

        // Optimistically remove from state
        setConversations((previousConversations) =>
          previousConversations.filter((conversationItem) => conversationItem.id !== conversationId),
        );
        if (wasActive) {
          onActiveDeleted();
        }

        // Defer actual API deletion by 10 seconds (10000ms)
        const timeoutId = setTimeout(async () => {
          pendingDeletionsRef.current.delete(conversationId);
          try {
            if (isNoAgent) {
              await PrismService.deleteConversation(conversationId);
            } else {
              await PrismService.deleteAgentConversation(conversationId, agentProject!);
            }
          } catch (error) {
            console.error("Failed to delete conversation:", error);
          }
        }, 10000);

        // Store in pending deletions
        pendingDeletionsRef.current.set(conversationId, {
          timeoutId,
          conversationEntry: targetConversation,
          wasActive,
        });

        // Add toast notification
        const toastId = addToast(
          (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                width: "100%",
              }}
            >
              <span>Conversation deleted</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUndoDelete(conversationId, toastId);
                }}
                style={{
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  color: "oklch(0.65 0.2 277)",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  marginLeft: "auto",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
                }}
              >
                Undo
              </button>
            </div>
          ),
          "info",
          10000,
        );
      } catch (error: unknown) {
        console.error("Failed to delete conversation:", error);
      }
    },
    [activeId, onActiveDeleted, agentProject, isNoAgent, conversations, addToast, handleUndoDelete, setConversations],
  );
}
