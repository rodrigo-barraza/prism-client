"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { Zap, RefreshCw, Trash2 } from "lucide-react";
import {
  TOAST_DURATION_MILLISECONDS,
} from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import { getErrorMessage } from "../utils/errorMessage";
import type { WorkflowMemory } from "../types/types";
import {
  ButtonComponent,
  SearchInputComponent,
} from "@rodrigo-barraza/components-library";
import WorkflowCardComponent from "./WorkflowCardComponent";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./WorkflowMemoriesPanelComponent.module.css";

interface ToastState {
  type: "success" | "error" | "info";
  text: string;
}

interface WorkflowMemoriesPanelProps {
  project?: string;
  agent?: string;
  refreshKey?: number;
  onCountChange?: (_count: number) => void;
  onActionsChange?: (_actions: ReactNode) => void;
}

const PAGE_SIZE = 20;

export default function WorkflowMemoriesPanel({
  project,
  agent,
  refreshKey,
  onCountChange,
  onActionsChange,
}: WorkflowMemoriesPanelProps) {
  const [workflows, setWorkflows] = useState<WorkflowMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // -- Search state --
  const [searchQuery, setSearchQuery] = useState("");

  // -- Pagination & Infinite Scroll --
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const workflowsRef = useRef<WorkflowMemory[]>([]);
  // eslint-disable-next-line react-hooks/refs -- existing ref-during-render pattern; restructuring risks behavior change
  workflowsRef.current = workflows;

  const loadWorkflows = useCallback(
    async (isAppend = false) => {
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const currentSkip = isAppend ? workflowsRef.current.length : 0;
        const result = await PrismService.getWorkflowMemories(
          project,
          PAGE_SIZE,
          agent,
          currentSkip,
        );
        const fetched = result.workflows || [];

        setWorkflows((previous) => {
          if (isAppend) {
            const previousIds = new Set(
              previous.map((workflow) => workflow._id),
            );
            const newItems = fetched.filter(
              (workflow) => !previousIds.has(workflow._id),
            );
            return [...previous, ...newItems];
          }
          return fetched;
        });
        setTotal(result.total || 0);
        setHasMore(fetched.length === PAGE_SIZE);
      } catch (fetchError: unknown) {
        console.error("Failed to load workflow memories:", fetchError);
        if (!isAppend) {
          setError(getErrorMessage(fetchError));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [project, agent],
  );

  // Propagate count to parent
  useEffect(() => {
    onCountChange?.(total);
  }, [total, onCountChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in effect (pre-React-Compiler pattern; compiler not enabled)
    loadWorkflows(false);
  }, [loadWorkflows, refreshKey]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadWorkflows(true);
        }
      },
      { root: null, rootMargin: "100px" },
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
  }, [hasMore, loading, loadingMore, loadWorkflows]);

  const handleDelete = useCallback(async (workflowId: string) => {
    try {
      await PrismService.deleteWorkflowMemory(workflowId);
      setWorkflows((previous) =>
        previous.filter((workflow) => workflow._id !== workflowId),
      );
      setTotal((previous) => Math.max(0, previous - 1));
      setConfirmingDeleteId(null);
    } catch (deleteError: unknown) {
      console.error("Failed to delete workflow memory:", deleteError);
    }
  }, []);

  const handleDeleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      const result = await PrismService.deleteAllWorkflowMemories(
        project,
        agent,
      );
      setWorkflows([]);
      setTotal(0);
      setHasMore(false);
      setConfirmingDeleteAll(false);
      setToast({
        type: "success",
        text: `Deleted ${result.deletedCount} workflow${result.deletedCount === 1 ? "" : "s"}`,
      });
      setTimeout(() => setToast(null), TOAST_DURATION_MILLISECONDS);
    } catch (deleteError: unknown) {
      setToast({
        type: "error",
        text: `Failed to delete: ${getErrorMessage(deleteError)}`,
      });
      setTimeout(() => setToast(null), TOAST_DURATION_MILLISECONDS);
    } finally {
      setDeletingAll(false);
    }
  }, [project, agent]);

  // -- Filtered workflows (client-side text search) --
  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) return workflows;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return workflows.filter((workflow) => {
      const request = (workflow.userRequest || "").toLowerCase();
      const summary = (workflow.summary || "").toLowerCase();
      return (
        request.includes(normalizedSearch) ||
        summary.includes(normalizedSearch)
      );
    });
  }, [workflows, searchQuery]);

  const isFiltered = searchQuery.trim().length > 0;

  // -- Push header actions to parent SidebarTabHeader --
  useEffect(() => {
    if (loading || error || workflows.length === 0) {
      onActionsChange?.(null);
      return;
    }
    onActionsChange?.(
      <>
        <ButtonComponent
          variant="text"
          size="small"
          icon={RefreshCw}
          iconSize={11}
          onClick={() => loadWorkflows(false)}
          disabled={loading}
          title="Refresh workflows"
        />
        {confirmingDeleteAll ? (
          <>
            <ButtonComponent
              variant="danger"
              size="small"
              onClick={handleDeleteAll}
              disabled={deletingAll}
              title="Confirm — permanently delete all workflows"
            >
              {deletingAll ? "Deleting…" : "Confirm"}
            </ButtonComponent>
            <ButtonComponent
              variant="text"
              size="small"
              onClick={() => setConfirmingDeleteAll(false)}
              disabled={deletingAll}
              title="Cancel"
            >
              Cancel
            </ButtonComponent>
          </>
        ) : (
          <ButtonComponent
            variant="text"
            size="small"
            icon={Trash2}
            iconSize={11}
            onClick={() => setConfirmingDeleteAll(true)}
            title="Delete all workflows for this agent"
          />
        )}
      </>,
    );
  }, [
    onActionsChange,
    loading,
    error,
    workflows.length,
    loadWorkflows,
    confirmingDeleteAll,
    deletingAll,
    handleDeleteAll,
  ]);

  // Clear actions on unmount
  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Loading --
  if (loading) {
    return (
      <div className={styles["container"]}>
        <PanelLoadingSpinner />
      </div>
    );
  }

  // -- Error --
  if (error) {
    return (
      <div className={styles["container"]}>
        <div className={styles["error"]}>
          Failed to load workflows: {error}
        </div>
      </div>
    );
  }

  // -- Empty --
  if (workflows.length === 0) {
    return (
      <div className={styles["container"]}>
        <div className={styles["empty-state"]}>
          <div className={styles["empty-icon"]}>
            <Zap size={24} />
          </div>
          <div className={styles["empty-title"]}>No workflows yet</div>
          <div className={styles["empty-subtitle"]}>
            Workflows are automatically extracted from successful agentic
            sessions. They capture reusable tool sequences that solved
            similar tasks.
          </div>
        </div>
      </div>
    );
  }

  // -- List --
  return (
    <div className={styles["container"]}>
      {toast && (
        <div
          className={`${styles["toast"]} ${styles[`toast-${toast.type}`]}`}
        >
          {toast.text}
        </div>
      )}

      {/* Search */}
      <div className={styles["filter-bar"]}>
        <SearchInputComponent
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search workflows…"
          compact
        />
      </div>

      {/* Scrollable Content */}
      <div className={styles["scrollable-content-area"]}>
        {/* No results after filtering */}
        {isFiltered && filteredWorkflows.length === 0 && (
          <div className={styles["empty-state"]}>
            <div className={styles["empty-title"]}>
              No matching workflows
            </div>
            <div className={styles["empty-subtitle"]}>
              Try adjusting your search query.
            </div>
          </div>
        )}

        {filteredWorkflows.map((workflow) => (
          <WorkflowCardComponent
            key={workflow._id}
            workflow={workflow}
            isConfirmingDelete={confirmingDeleteId === workflow._id}
            onDeleteRequest={(id) => setConfirmingDeleteId(id || null)}
            onDeleteConfirm={handleDelete}
            onDeleteCancel={() => setConfirmingDeleteId(null)}
          />
        ))}

        {/* Infinite Scroll Sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className={styles["sentinel"]}>
            {loadingMore && <PanelLoadingSpinner size="small" inline />}
          </div>
        )}

        {/* End of list */}
        {!hasMore && workflows.length > 0 && (
          <div className={styles["end-of-list"]}>
            <Zap size={12} />
            <span>All workflows loaded</span>
          </div>
        )}
      </div>
    </div>
  );
}
