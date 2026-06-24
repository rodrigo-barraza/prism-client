"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import {
  Brain,
  RefreshCw,
  User,
  MessageSquare,
  FolderKanban,
  ExternalLink,
  Sparkles,
  History,
  GitMerge,
  Settings,
} from "lucide-react";
import Link from "next/link";
import {
  TOAST_DURATION_MILLISECONDS,
  HIGHLIGHT_DURATION_MILLISECONDS,
} from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import type {
  AgentMemory,
  ConsolidationHistoryEntry,
  ConsolidateResult,
  MemoryType,
} from "../types/types";
import {
  ButtonComponent,
  SearchInputComponent,
  parseDateValue,
} from "@rodrigo-barraza/components-library";
import { timeAgo as formatTimeAgo, formatLatencyMilliseconds } from "@rodrigo-barraza/utilities-library";
import FilterDropdownComponent, {
  type FilterGroup,
} from "./FilterDropdownComponent";
import MemoryCardComponent from "./MemoryCardComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./MemoriesPanelComponent.module.css";

const TYPE_FILTER_COLORS: Record<MemoryType, string> = {
  user: "#818cf8",
  feedback: "#34d399",
  project: "#fbbf24",
  reference: "#22d3ee",
};

const MEMORY_TYPE_FILTER_ITEMS = [
  { key: "user", icon: User, title: "User", color: TYPE_FILTER_COLORS.user },
  {
    key: "feedback",
    icon: MessageSquare,
    title: "Feedback",
    color: TYPE_FILTER_COLORS.feedback,
  },
  {
    key: "project",
    icon: FolderKanban,
    title: "Project",
    color: TYPE_FILTER_COLORS.project,
  },
  {
    key: "reference",
    icon: ExternalLink,
    title: "Reference",
    color: TYPE_FILTER_COLORS.reference,
  },
];

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  scheduled: "Auto-Dream",
  session_threshold: "Conversation",
};

/**
 * MemoriesPanel — view and manage agent memories.
 *
 * Displays memories extracted from past coding conversations, organized by type
 * (user, feedback, project, reference). These are extracted automatically
 * by the ConversationSummarizer and stored via AgentMemoryService.
 */
interface ToastState {
  type: "success" | "error" | "info";
  text: string;
}

interface ConsolidationEvent {
  project?: string;
  summary?: string;
  actionsApplied: number;
}

interface MemoriesPanelProps {
  project?: string;
  agent?: string;
  refreshKey?: number;
  consolidationEvent?: ConsolidationEvent | null;
  onCountChange?: (count: number) => void;
  onActionsChange?: (actions: ReactNode) => void;
  memoryConfigured?: boolean;
}

export default function MemoriesPanel({
  project,
  agent,
  refreshKey,
  consolidationEvent,
  onCountChange,
  onActionsChange,
  memoryConfigured = true,
}: MemoriesPanelProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [newMemoryIds, setNewMemoryIds] = useState(new Set<string>());
  const [consolidating, setConsolidating] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  // -- Search & filter state ----------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // -- Pagination & Infinite Scroll State ----------------------
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("all");

  // History state
  const [history, setHistory] = useState<ConsolidationHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyIsLoadingState, setHistoryLoading] = useState(false);

  // Keep a mutable ref of memories to avoid recreating loadMemories on page loads
  const memoriesRef = useRef<AgentMemory[]>([]);
  memoriesRef.current = memories;

  const PAGE_SIZE = 20;

  const loadMemories = useCallback(
    async (isAppend = false) => {
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const currentSkip = isAppend ? memoriesRef.current.length : 0;
        const typeParam = selectedType === "all" ? undefined : selectedType;
        const result = await PrismService.getAgentMemories(
          project,
          PAGE_SIZE,
          agent,
          currentSkip,
          typeParam,
        );
        const fetched = result.memories || [];

        // Detect newly arrived memories
        const freshIds = new Set<string>();
        for (const memory of fetched) {
          const id = memory.id || memory._id;
          if (knownIdsRef.current.size > 0 && !knownIdsRef.current.has(id)) {
            freshIds.add(id);
          }
          knownIdsRef.current.add(id);
        }

        if (freshIds.size > 0 && !isAppend) {
          setNewMemoryIds(freshIds);
          // Auto-clear highlight after 6s
          setTimeout(
            () => setNewMemoryIds(new Set<string>()),
            HIGHLIGHT_DURATION_MILLISECONDS,
          );
        }

        setMemories((prev) => {
          if (isAppend) {
            const prevIds = new Set(prev.map((memory) => memory.id || memory._id));
            const newItems = fetched.filter((memory) => !prevIds.has(memory.id || memory._id));
            return [...prev, ...newItems];
          }
          return fetched;
        });
        setTotal(result.total || 0);
        setHasMore(fetched.length === PAGE_SIZE);
      } catch (error: unknown) {
        console.error("Failed to load memories:", error);
        if (!isAppend) {
          setError(getErrorMessage(error));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [project, agent, selectedType],
  );

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const result = await PrismService.getConsolidationHistory(project, 5);
      setHistory((result.history || []) as ConsolidationHistoryEntry[]);
    } catch (error: unknown) {
      console.error("Failed to load consolidation history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }, [project]);

  // Propagate count changes to parent via effect (avoids setState-during-render)
  useEffect(() => {
    onCountChange?.(total);
  }, [total, onCountChange]);

  useEffect(() => {
    loadMemories(false);
  }, [loadMemories, refreshKey, selectedType]);

  // Load history when expanded
  useEffect(() => {
    if (historyOpen) loadHistory();
  }, [historyOpen, loadHistory]);

  // Infinite scroll intersection observer sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMemories(true);
        }
      },
      {
        root: null,
        rootMargin: "100px",
      },
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasMore, loading, loadingMore, loadMemories]);

  // React to real-time consolidation events from WebSocket
  useEffect(() => {
    if (!consolidationEvent) return;
    if (consolidationEvent.project && consolidationEvent.project !== project)
      return;

    const { summary, actionsApplied } = consolidationEvent;
    if (actionsApplied > 0) {
      setToast({
        type: "success",
        text: `✨ ${summary || "Memories consolidated"}`,
      });
      loadMemories(false);
      if (historyOpen) loadHistory();
    } else {
      setToast({ type: "info", text: summary || "No changes needed" });
    }
    setTimeout(() => setToast(null), TOAST_DURATION_MILLISECONDS);
  }, [consolidationEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback(async (memoryId: string) => {
    try {
      await PrismService.deleteAgentMemory(memoryId);
      // Optimistic removal from local state
      setMemories((prev) => prev.filter((memory) => (memory.id || memory._id) !== memoryId));
      setTotal((prev) => Math.max(0, prev - 1));
      setConfirmingDeleteId(null);
    } catch (error: unknown) {
      console.error("Failed to delete memory:", error);
    }
  }, []);

  const handleConsolidate = useCallback(async () => {
    setConsolidating(true);
    setToast(null);
    try {
      const result = (await PrismService.consolidateMemories(
        project!,
        agent,
      )) as ConsolidateResult;
      if (result.skipped) {
        const message =
          result.reason === "daily_limit_reached"
            ? "Daily consolidation limit reached"
            : result.reason === "insufficient memories"
              ? "Not enough memories to consolidate"
              : "No consolidation needed";
        setToast({ type: "info", text: message });
      } else if ((result.actionsApplied ?? 0) > 0) {
        setToast({
          type: "success",
          text: result.summary || `Consolidated ${result.merged || 0} memories`,
        });
        // Refresh after consolidation
        loadMemories(false);
        if (historyOpen) loadHistory();
      } else {
        setToast({ type: "info", text: result.summary || "No changes needed" });
      }
    } catch (error: unknown) {
      setToast({
        type: "error",
        text: `Consolidation failed: ${getErrorMessage(error)}`,
      });
    } finally {
      setConsolidating(false);
      setTimeout(() => setToast(null), TOAST_DURATION_MILLISECONDS);
    }
  }, [project, agent, loadMemories, loadHistory, historyOpen]);

  // -- Filtered memories (client-side) ------------------------
  const filteredMemories = useMemo(() => {
    let result = memories;

    // Text search — match against title or content (case-insensitive)
    if (searchQuery.trim()) {
      const normalizedSearch = searchQuery.trim().toLowerCase();
      result = result.filter((memory) => {
        const title = (memory.title || "").toLowerCase();
        const content = (memory.content || "").toLowerCase();
        return (
          title.includes(normalizedSearch) || content.includes(normalizedSearch)
        );
      });
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const from = parseDateValue(dateFrom);
      const to = parseDateValue(dateTo);
      // If "to" is a date-only (no time), extend to end of day
      const toEnd =
        to && !dateTo.includes("T")
          ? new Date(
              to.getFullYear(),
              to.getMonth(),
              to.getDate(),
              23,
              59,
              59,
              999,
            )
          : to;

      result = result.filter((memory) => {
        if (!memory.createdAt) return false;
        const memoryDate = new Date(memory.createdAt);
        if (from && memoryDate < from) return false;
        if (toEnd && memoryDate > toEnd) return false;
        return true;
      });
    }

    return result;
  }, [memories, searchQuery, dateFrom, dateTo]);

  const isFiltered = searchQuery.trim() || dateFrom || dateTo;

  // -- Push header action buttons to parent SidebarTabHeader ---
  // (Must live before early returns to satisfy Rules of Hooks)
  useEffect(() => {
    if (loading || error || memories.length === 0 || !memoryConfigured) {
      onActionsChange?.(null);
      return;
    }
    onActionsChange?.(
      <>
        <ButtonComponent
          variant="text"
          size="small"
          icon={Sparkles}
          iconSize={11}
          onClick={handleConsolidate}
          disabled={consolidating || total < 2}
          title="Consolidate memories — merge duplicates and clean stale entries"
        />
        <ButtonComponent
          variant={historyOpen ? "tonal" : "text"}
          size="small"
          icon={History}
          iconSize={11}
          onClick={() => setHistoryOpen((previous) => !previous)}
          title="Consolidation history"
        />
        <ButtonComponent
          variant="text"
          size="small"
          icon={RefreshCw}
          iconSize={11}
          onClick={() => loadMemories(false)}
          disabled={loading}
          title="Refresh memories"
        />
      </>,
    );
  }, [
    onActionsChange,
    handleConsolidate,
    consolidating,
    total,
    historyOpen,
    loading,
    loadMemories,
    error,
    memories.length,
    memoryConfigured,
  ]);

  // Clear actions on unmount
  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Not configured ------------------------------------------
  if (!memoryConfigured) {
    return (
      <div className={styles['container']}>
        <div className={styles['empty-state']}>
          <div className={`${styles['empty-icon']} ${styles['empty-icon-disabled']}`}>
            <Brain size={24} />
          </div>
          <div className={styles['empty-title']}>Memories Not Available</div>
          <div className={styles['empty-subtitle']}>
            Memory models need to be configured before memories can be extracted
            and stored. Set the extraction, consolidation, and embedding models
            in Settings.
          </div>
          <Link href="/settings" className={styles['settings-link']}>
            <Settings size={13} />
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  // -- Loading -------------------------------------------------
  if (loading) {
    return (
      <div className={styles['container']}>
        <PanelLoadingSpinner />
      </div>
    );
  }

  // -- Error ---------------------------------------------------
  if (error) {
    return (
      <div className={styles['container']}>
        <div className={styles['error']}>Failed to load memories: {error}</div>
      </div>
    );
  }

  // -- Empty ---------------------------------------------------
  if (memories.length === 0) {
    return (
      <div className={styles['container']}>
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']}>
            <Brain size={24} />
          </div>
          <div className={styles['empty-title']}>No memories yet</div>
          <div className={styles['empty-subtitle']}>
            Memories are automatically extracted from your conversations. They
            capture user preferences, feedback, project context, and external
            references.
          </div>
        </div>
      </div>
    );
  }

  // -- List ----------------------------------------------------
  return (
    <div className={`memories-panel-component ${styles['container']}`}>
      {toast && (
        <div
          className={`${styles['toast']} ${styles[`toast-${toast.type}`]}`}
        >
          {toast.text}
        </div>
      )}

      {/* -- Search & Filters ------------------------------------- */}
      <div className={styles['filter-bar']}>
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search memories…"
          compact
          className={styles['search-field']}
        />
        <FilterDropdownComponent
          fullWidth
          groups={
            [
              {
                label: "Type",
                items: MEMORY_TYPE_FILTER_ITEMS,
                activeKeys: selectedType === "all" ? null : selectedType,
                isSingleSelect: true,
                onToggle: (key: string | null) => setSelectedType(key ?? "all"),
              },
            ] as FilterGroup[]
          }
          dateRange={{ from: dateFrom, to: dateTo }}
          onDateChange={({ from, to }: { from: string; to: string }) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          dateStorageKey="memories-panel-date-range"
        />
      </div>

      {/* -- Consolidation History ------------------------------- */}
      {historyOpen && (
        <div className={styles['history-section']}>
          <div className={styles['history-section-header']}>
            <span className={styles['history-section-title']}>
              Consolidation History
            </span>
            {historyIsLoadingState && (
              <RefreshCw size={10} />
            )}
          </div>
          {history.length === 0 && !historyIsLoadingState && (
            <div className={styles['history-empty']}>No consolidation runs yet</div>
          )}
          {history.map((run, i) => (
            <div key={i} className={styles['history-entry']}>
              <div className={styles['history-entry-header']}>
                <span
                  className={`${styles['history-trigger']} ${styles[`trigger-${(run.trigger ?? '').replace(/_/g, '-')}`] || ""}`}
                >
                  {TRIGGER_LABELS[run.trigger ?? ""] ||
                    run.trigger ||
                    "unknown"}
                </span>
                <span className={styles['history-time']}>
                  {formatTimeAgo(run.runAt)}
                </span>
              </div>
              <div className={styles['history-summary']}>{run.summary}</div>
              <div className={styles['history-stats']}>
                <span>
                  <GitMerge size={9} /> {run.actionsApplied} action
                  {run.actionsApplied !== 1 ? "s" : ""}
                </span>
                <span>
                  {run.memoriesBefore} → {run.memoriesAfter} memories
                </span>
                {run.durationMs && (
                  <span>{formatLatencyMilliseconds(run.durationMs)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* -- Scrollable Content ----------------------------------- */}
      <div className={styles['scrollable-content-area']}>
        {/* -- No results after filtering -------------------------- */}
        {isFiltered && filteredMemories.length === 0 && (
          <div className={styles['empty-state']}>
            <div className={styles['empty-title']}>No matching memories</div>
            <div className={styles['empty-subtitle']}>
              Try adjusting your search query or time range.
            </div>
          </div>
        )}

        {filteredMemories.map((memory) => {
          const memoryId = memory.id || memory._id;
          return (
            <MemoryCardComponent
              key={memoryId}
              memory={memory}
              isNew={newMemoryIds.has(memoryId)}
              isConfirmingDelete={confirmingDeleteId === memoryId}
              onDeleteRequest={(id) => setConfirmingDeleteId(id || null)}
              onDeleteConfirm={handleDelete}
              onDeleteCancel={() => setConfirmingDeleteId(null)}
            />
          );
        })}

        {/* Infinite Scroll Sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className={styles['sentinel']}>
            {loadingMore && (
              <PanelLoadingSpinner size="small" inline />
            )}
          </div>
        )}

        {/* End of list indicator */}
        {!hasMore && memories.length > 0 && (
          <div className={styles['end-of-list']}>
            <Brain size={12} />
            <span>All memories loaded</span>
          </div>
        )}
      </div>
    </div>
  );
}
