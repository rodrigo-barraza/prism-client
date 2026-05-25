"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Brain,
  RefreshCw,
  User,
  MessageSquare,
  FolderKanban,
  ExternalLink,
  Trash2,
  Sparkles,
  History,
  GitMerge,
  Settings,
} from "lucide-react";
import Link from "next/link";
import {
  TOAST_DURATION_MS,
  HIGHLIGHT_DURATION_MS,
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
  DatePickerComponent,
  SearchInputComponent,
  DateTimeBadgeComponent,
  LoadingIndicatorComponent,
  parseDateValue,
} from "@rodrigo-barraza/components-library";
import { formatTimeAgo, formatLatencyMs } from "../utils/utilities";
import styles from "./MemoriesPanelComponent.module.css";

/**
 * Type → icon mapping for memory categories.
 */
const TYPE_ICONS: Record<MemoryType, typeof User> = {
  user: User,
  feedback: MessageSquare,
  project: FolderKanban,
  reference: ExternalLink,
};

const TYPE_ICON_CLASSES: Record<MemoryType, string> = {
  user: "memoryIconUser",
  feedback: "memoryIconFeedback",
  project: "memoryIconProject",
  reference: "memoryIconReference",
};

const TYPE_BADGE_CLASSES: Record<MemoryType, string> = {
  user: "badgeUser",
  feedback: "badgeFeedback",
  project: "badgeProject",
  reference: "badgeReference",
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  scheduled: "Auto-Dream",
  session_threshold: "Session",
};

/**
 * MemoriesPanel — view and manage agent memories.
 *
 * Displays memories extracted from past coding sessions, organized by type
 * (user, feedback, project, reference). These are extracted automatically
 * by the SessionSummarizer and stored via AgentMemoryService.
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
  memoryConfigured?: boolean;
}

export default function MemoriesPanel({
  project,
  agent,
  refreshKey,
  consolidationEvent,
  onCountChange,
  memoryConfigured = true,
}: MemoriesPanelProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
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
  const [historyLoading, setHistoryLoading] = useState(false);

  // Keep a mutable ref of memories to avoid recreating loadMemories on page loads
  const memoriesRef = useRef<AgentMemory[]>([]);
  memoriesRef.current = memories;

  const PAGE_SIZE = 20;

  const loadMemories = useCallback(async (isAppend = false) => {
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
        typeParam
      );
      const fetched = result.memories || [];

      // Detect newly arrived memories
      const freshIds = new Set<string>();
      for (const m of fetched) {
        const id = m.id || m._id;
        if (knownIdsRef.current.size > 0 && !knownIdsRef.current.has(id)) {
          freshIds.add(id);
        }
        knownIdsRef.current.add(id);
      }

      if (freshIds.size > 0 && !isAppend) {
        setNewMemoryIds(freshIds);
        // Auto-clear highlight after 6s
        setTimeout(() => setNewMemoryIds(new Set<string>()), HIGHLIGHT_DURATION_MS);
      }

      setMemories((prev) => {
        if (isAppend) {
          const prevIds = new Set(prev.map((m) => m.id || m._id));
          const newItems = fetched.filter((m) => !prevIds.has(m.id || m._id));
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
  }, [project, agent, selectedType]);

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
      }
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
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, [consolidationEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback(async (memoryId: string) => {
    try {
      await PrismService.deleteAgentMemory(memoryId);
      // Optimistic removal from local state
      setMemories((prev) =>
        prev.filter((m) => (m.id || m._id) !== memoryId),
      );
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
      const result = await PrismService.consolidateMemories(project!, agent) as ConsolidateResult;
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
      setTimeout(() => setToast(null), TOAST_DURATION_MS);
    }
  }, [project, agent, loadMemories, loadHistory, historyOpen]);

  // -- Filtered memories (client-side) ------------------------
  const filteredMemories = useMemo(() => {
    let result = memories;

    // Text search — match against title or content (case-insensitive)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((m) => {
        const title = (m.title || "").toLowerCase();
        const content = (m.content || "").toLowerCase();
        return title.includes(q) || content.includes(q);
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

      result = result.filter((m) => {
        if (!m.createdAt) return false;
        const d = new Date(m.createdAt);
        if (from && d < from) return false;
        if (toEnd && d > toEnd) return false;
        return true;
      });
    }

    return result;
  }, [memories, searchQuery, dateFrom, dateTo]);

  const isFiltered = searchQuery.trim() || dateFrom || dateTo;

  // -- Not configured ------------------------------------------
  if (!memoryConfigured) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={`${styles.emptyIcon} ${styles.emptyIconDisabled}`}>
            <Brain size={24} />
          </div>
          <div className={styles.emptyTitle}>Memories Not Available</div>
          <div className={styles.emptySubtitle}>
            Memory models need to be configured before memories can be extracted
            and stored. Set the extraction, consolidation, and embedding models
            in Settings.
          </div>
          <Link href="/settings" className={styles.settingsLink}>
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
      <div className={styles.container}>
        <div className={styles.loading}>
          <LoadingIndicatorComponent
            size="small"
            color="inherit"
            label="Loading memories…"
          />
        </div>
      </div>
    );
  }

  // -- Error ---------------------------------------------------
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Failed to load memories: {error}</div>
      </div>
    );
  }

  // -- Empty ---------------------------------------------------
  if (memories.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Brain size={24} />
          </div>
          <div className={styles.emptyTitle}>No memories yet</div>
          <div className={styles.emptySubtitle}>
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
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          Memories (
          {isFiltered ? `${filteredMemories.length} / ${total}` : total})
        </span>
        <button
          className={styles.refreshBtn}
          onClick={handleConsolidate}
          disabled={consolidating || total < 2}
          title="Consolidate memories — merge duplicates and clean stale entries"
        >
          <Sparkles
            size={11}
            className={consolidating ? styles.refreshSpin : ""}
          />
        </button>
        <button
          className={`${styles.refreshBtn} ${historyOpen ? styles.historyBtnActive : ""}`}
          onClick={() => setHistoryOpen((prev) => !prev)}
          title="Consolidation history"
        >
          <History size={11} />
        </button>
        <button
          className={styles.refreshBtn}
          onClick={() => loadMemories(false)}
          disabled={loading}
          title="Refresh memories"
        >
          <RefreshCw size={11} className={loading ? styles.refreshSpin : ""} />
        </button>
      </div>

      {toast && (
        <div
          className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}
        >
          {toast.text}
        </div>
      )}

      {/* -- Search & Time Filter -------------------------------- */}
      <div className={styles.filterBar}>
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search memories…"
          className={styles.searchField}
        />
        <DatePickerComponent
          from={dateFrom}
          to={dateTo}
          onChange={({ from, to }: { from: string; to: string }) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          placeholder="All time"
          storageKey="memories-panel-date-range"
        />
      </div>

      {/* -- Memory Type Filters -------------------------------- */}
      <div className={styles.typeFilters}>
        {(["all", "user", "feedback", "project", "reference"] as const).map((t) => {
          const isActive = selectedType === t;
          let activeClass = "";
          if (isActive) {
            if (t === "all") activeClass = styles.typePillActiveAll;
            else if (t === "user") activeClass = styles.typePillActiveUser;
            else if (t === "feedback") activeClass = styles.typePillActiveFeedback;
            else if (t === "project") activeClass = styles.typePillActiveProject;
            else if (t === "reference") activeClass = styles.typePillActiveReference;
          }
          
          let PillIcon = Brain;
          if (t === "user") PillIcon = User;
          else if (t === "feedback") PillIcon = MessageSquare;
          else if (t === "project") PillIcon = FolderKanban;
          else if (t === "reference") PillIcon = ExternalLink;

          return (
            <button
              key={t}
              className={`${styles.typePill} ${activeClass}`}
              onClick={() => setSelectedType(t)}
            >
              <PillIcon size={10} />
              {t}
            </button>
          );
        })}
      </div>

      {/* -- Consolidation History ------------------------------- */}
      {historyOpen && (
        <div className={styles.historySection}>
          <div className={styles.historySectionHeader}>
            <span className={styles.historySectionTitle}>
              Consolidation History
            </span>
            {historyLoading && (
              <RefreshCw size={10} className={styles.refreshSpin} />
            )}
          </div>
          {history.length === 0 && !historyLoading && (
            <div className={styles.historyEmpty}>No consolidation runs yet</div>
          )}
          {history.map((run, i) => (
            <div key={i} className={styles.historyEntry}>
              <div className={styles.historyEntryHeader}>
                <span
                  className={`${styles.historyTrigger} ${styles[`trigger${run.trigger?.charAt(0).toUpperCase()}${run.trigger?.slice(1)}`] || ""}`}
                >
                  {TRIGGER_LABELS[run.trigger ?? ""] ||
                    run.trigger ||
                    "unknown"}
                </span>
                <span className={styles.historyTime}>
                  {formatTimeAgo(run.runAt)}
                </span>
              </div>
              <div className={styles.historySummary}>{run.summary}</div>
              <div className={styles.historyStats}>
                <span>
                  <GitMerge size={9} /> {run.actionsApplied} action
                  {run.actionsApplied !== 1 ? "s" : ""}
                </span>
                <span>
                  {run.memoriesBefore} → {run.memoriesAfter} memories
                </span>
                {run.durationMs && (
                  <span>{formatLatencyMs(run.durationMs)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* -- No results after filtering -------------------------- */}
      {isFiltered && filteredMemories.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No matching memories</div>
          <div className={styles.emptySubtitle}>
            Try adjusting your search query or time range.
          </div>
        </div>
      )}

      {filteredMemories.map((memory) => {
        const memoryId = memory.id || memory._id;
        const type = (memory.type || "project") as MemoryType;
        const IconComponent = TYPE_ICONS[type] || FolderKanban;
        const iconClass =
          TYPE_ICON_CLASSES[type] || "memoryIconProject";
        const badgeClass = TYPE_BADGE_CLASSES[type] || "badgeProject";
        const isConfirming = confirmingDeleteId === memoryId;
        const isNew = newMemoryIds.has(memoryId);

        return (
          <div
            key={memoryId}
            className={`${styles.memoryCard} ${isNew ? styles.memoryCardNew : ""}`}
          >
            <div className={styles.memoryCardHeader}>
              <div className={`${styles.memoryIcon} ${styles[iconClass]}`}>
                <IconComponent size={14} />
              </div>
              <div className={styles.memoryInfo}>
                <div className={styles.memoryTitle}>
                  {memory.title ||
                    (memory.content
                      ? memory.content.substring(0, 60)
                      : "Untitled")}
                </div>
                <div className={styles.memoryMeta}>
                  <span
                    className={`${styles.memoryTypeBadge} ${styles[badgeClass]}`}
                  >
                    {type}
                  </span>
                  {memory.createdAt && (
                    <DateTimeBadgeComponent date={memory.createdAt} />
                  )}
                </div>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={() =>
                  setConfirmingDeleteId(isConfirming ? null : memoryId)
                }
                title="Delete memory"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {memory.content && (
              <div className={styles.memoryContent}>{memory.content}</div>
            )}

            {isConfirming && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Delete this memory?</span>
                <button
                  className={`${styles.confirmBtn} ${styles.confirmBtnYes}`}
                  onClick={() => handleDelete(memoryId)}
                >
                  Delete
                </button>
                <button
                  className={`${styles.confirmBtn} ${styles.confirmBtnNo}`}
                  onClick={() => setConfirmingDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Infinite Scroll Sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className={styles.sentinel}>
          {loadingMore && (
            <LoadingIndicatorComponent
              size="small"
              color="inherit"
              label="Loading more..."
            />
          )}
        </div>
      )}

      {/* End of list indicator */}
      {!hasMore && memories.length > 0 && (
        <div className={styles.endOfList}>
          <Brain size={12} />
          <span>All memories loaded</span>
        </div>
      )}
    </div>
  );
}
