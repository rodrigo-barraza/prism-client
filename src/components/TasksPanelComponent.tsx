"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import BadgeComponent from "./BadgeComponent";
import {
  ListChecks,
  RefreshCw,
  Trash2,
  Plus,
  Loader2,
  CircleDot,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import ToolsApiService from "../services/ToolsApiService";
import type { AgenticTask } from "../services/ToolsApiService";
import { getErrorMessage } from "../utils/errorMessage";
import {
  SearchInputComponent,
  InputComponent,
  TextAreaComponent,
} from "@rodrigo-barraza/components-library";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import styles from "./TasksPanelComponent.module.css";

interface StatusConfigEntry {
  icon: typeof CircleDot;
  label: string;
  colorClass: string;
}

const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  pending: { icon: CircleDot, label: "Pending", colorClass: "statusPending" },
  in_progress: {
    icon: Play,
    label: "In Progress",
    colorClass: "statusInProgress",
  },
  completed: {
    icon: CheckCircle2,
    label: "Done",
    colorClass: "statusCompleted",
  },
};

const STATUS_CYCLE = ["pending", "in_progress", "completed"];

interface TaskSummary {
  total: number;
  [key: string]: number | undefined;
}

interface TasksPanelProps {
  project?: string;
  refreshKey?: number;
  conversationId?: string;
  onCountChange?: (count: number) => void;
  onActionsChange?: (actions: ReactNode) => void;
}

/**
 * TasksPanel — view and manage persistent agentic tasks.
 *
 * Displayed in the agent sidebar alongside Memories. Tasks are created
 * by the agent (via task_create tool) and persist across conversations.
 * Users can also create tasks manually from this panel.
 */
export default function TasksPanel({
  project,
  refreshKey,
  conversationId,
  onCountChange,
  onActionsChange,
}: TasksPanelProps) {
  const [tasks, setTasks] = useState<AgenticTask[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const hasData = useRef<boolean>(false);

  // New task form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // -- Load ----------------------------------------------------

  const loadTasks = useCallback(async () => {
    // Only show full spinner on first load (no data yet)
    if (!hasData.current) setLoading(true);
    setError(null);
    try {
      const result = await ToolsApiService.getAllAgenticTasks({
        status: statusFilter || undefined,
        conversationId: conversationId || undefined,
      });
      setTasks((result.tasks || []) as AgenticTask[]);
      setSummary((result.summary || null) as TaskSummary | null);
      onCountChange?.(result.summary?.total || (result.tasks || []).length);
      hasData.current = true;
    } catch (error: unknown) {
      console.error("Failed to load tasks:", error);
      if (!hasData.current) setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, conversationId, onCountChange]);

  // Reset on session change (new conversation = clean slate)
  useEffect(() => {
    hasData.current = false;
    setTasks([]);
    setSummary(null);
  }, [conversationId]);

  // Single effect — fires on mount, refreshKey changes, and statusFilter/conversation changes
  useEffect(() => {
    loadTasks();
  }, [loadTasks, refreshKey]);

  // -- Create -------------------------------------------------

  const handleCreate = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (!newSubject.trim() || !newDescription.trim()) return;
      setCreating(true);
      try {
        await ToolsApiService.createAgenticTask(project!, {
          subject: newSubject.trim(),
          description: newDescription.trim(),
        });
        setNewSubject("");
        setNewDescription("");
        setShowNewForm(false);
        loadTasks();
      } catch (error: unknown) {
        console.error("Failed to create task:", error);
      } finally {
        setCreating(false);
      }
    },
    [project, newSubject, newDescription, loadTasks],
  );

  // -- Status cycle -------------------------------------------

  const handleCycleStatus = useCallback(
    async (task: AgenticTask) => {
      const index = STATUS_CYCLE.indexOf(task.status || "pending");
      const nextStatus = STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
      try {
        await ToolsApiService.updateAgenticTask(task.project, task.taskId, {
          status: nextStatus,
        });
        // Optimistic
        setTasks((previousTasks) =>
          previousTasks.map((taskItem) =>
            taskItem.project === task.project && taskItem.taskId === task.taskId
              ? { ...taskItem, status: nextStatus }
              : taskItem,
          ),
        );
        // Refresh summary
        loadTasks();
      } catch (error: unknown) {
        console.error("Failed to update task:", error);
      }
    },
    [loadTasks],
  );

  // -- Delete -------------------------------------------------

  const handleDelete = useCallback(
    async (task: AgenticTask) => {
      try {
        await ToolsApiService.deleteAgenticTask(task.project, task.taskId);
        setTasks((previousTasks) =>
          previousTasks.filter(
            (taskItem) => !(taskItem.project === task.project && taskItem.taskId === task.taskId),
          ),
        );
        setConfirmingDeleteId(null);
        loadTasks();
      } catch (error: unknown) {
        console.error("Failed to delete task:", error);
      }
    },
    [loadTasks],
  );

  // -- Filtered tasks (client-side) ---------------------------
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Text search — match against subject, description, project, taskId
    if (searchQuery.trim()) {
      const normalizedSearch = searchQuery.trim().toLowerCase();
      result = result.filter((task) => {
        const subject = (task.subject || "").toLowerCase();
        const description = (task.description || "").toLowerCase();
        const project = (task.project || "").toLowerCase();
        const taskId = (task.taskId || "").toLowerCase();
        return (
          subject.includes(normalizedSearch) ||
          description.includes(normalizedSearch) ||
          project.includes(normalizedSearch) ||
          taskId.includes(normalizedSearch)
        );
      });
    }

    return result;
  }, [tasks, searchQuery]);

  // -- Push header action buttons to parent SidebarTabHeader ---
  useEffect(() => {
    onActionsChange?.(
      <>
        <button
          className={styles['header-button']}
          onClick={() => setShowNewForm((previousState) => !previousState)}
          title="Create task"
        >
          {showNewForm ? <X size={11} /> : <Plus size={11} />}
        </button>
        <button
          className={styles['header-button']}
          onClick={loadTasks}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? styles['spin'] : ""} />
        </button>
      </>,
    );
  }, [onActionsChange, showNewForm, loading, loadTasks]);

  useEffect(() => {
    return () => onActionsChange?.(null);
  }, [onActionsChange]);

  // -- Loading ------------------------------------------------

  if (loading) {
    return (
      <div className={styles['container']}>
        <PanelLoadingSpinner />
      </div>
    );
  }

  // -- Error --------------------------------------------------

  if (error) {
    return (
      <div className={styles['container']}>
        <div className={styles['error']}>Failed to load tasks: {error}</div>
      </div>
    );
  }

  // -- Render -------------------------------------------------

  return (
    <div className={`tasks-panel-component ${styles['container']}`}>
      {/* -- Search & Filters ------------------------------------- */}
      {((summary && summary.total > 0) || tasks.length > 0) && (
        <div className={styles["filter-controls-section"]}>
          <SearchInputComponent
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tasks…"
            compact
            className={styles["search-input-wrapper"]}
          />

          {/* -- Summary badges ------------------------------------ */}
          {summary && summary.total > 0 && (
            <div className={styles['summary-layout-row']}>
              {STATUS_CYCLE.map((state) => {
                const config = STATUS_CONFIG[state];
                const count = summary[state] || 0;
                if (count === 0 && statusFilter !== state) return null;
                const isActive = statusFilter === state;
                return (
                  <button
                    key={state}
                    className={`${styles['summary-badge']} ${styles[config.colorClass]} ${isActive ? styles['summary-badge-is-active-state'] : ""}`}
                    onClick={() => setStatusFilter(isActive ? null : state)}
                    title={`${isActive ? "Clear" : "Filter"}: ${config.label}`}
                  >
                    <config.icon size={9} />
                    {count}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -- New Task Form ------------------------------------ */}
      {showNewForm && (
        <form className={styles['new-task-form']} onSubmit={handleCreate}>
          <InputComponent
            placeholder="Task subject…"
            value={newSubject}
            onChange={(
              e: React.ChangeEvent<HTMLInputElement>,
            ) => setNewSubject(e.target.value)}
            autoFocus
          />
          <TextAreaComponent
            placeholder="Description…"
            value={newDescription}
            onChange={(
              e: React.ChangeEvent<HTMLTextAreaElement>,
            ) => setNewDescription(e.target.value)}
            minRows={2}
          />
          <div className={styles['new-task-actions']}>
            <button
              type="submit"
              className={styles['new-task-submit']}
              disabled={
                creating || !newSubject.trim() || !newDescription.trim()
              }
            >
              {creating ? (
                <RefreshCw size={10} className={styles['spin']} />
              ) : (
                <Plus size={10} />
              )}
              Create
            </button>
            <button
              type="button"
              className={styles['new-task-cancel']}
              onClick={() => {
                setShowNewForm(false);
                setNewSubject("");
                setNewDescription("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* -- Empty ------------------------------------------- */}
      {tasks.length === 0 && (
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']}>
            <ListChecks size={24} />
          </div>
          <div className={styles['empty-title']}>No tasks yet</div>
          <div className={styles['empty-subtitle']}>
            {statusFilter
              ? `No ${STATUS_CONFIG[statusFilter]?.label.toLowerCase()} tasks. Try clearing the filter.`
              : "Tasks are created by the agent during coding conversations, or you can create them manually."}
          </div>
        </div>
      )}

      {/* -- No results after filtering -------------------------- */}
      {tasks.length > 0 && filteredTasks.length === 0 && (
        <div className={styles['empty-state']}>
          <div className={styles['empty-title']}>No matching tasks</div>
          <div className={styles['empty-subtitle']}>
            Try adjusting your search query.
          </div>
        </div>
      )}

      {/* -- Task list --------------------------------------- */}
      {filteredTasks.map((task) => {
        const config =
          STATUS_CONFIG[task.status ?? "pending"] || STATUS_CONFIG.pending;
        const StatusIcon = config.icon;
        const isExpanded = expandedId === task.taskId;
        const isConfirming = confirmingDeleteId === task.taskId;

        return (
          <div
            key={`${task.project}-${task.taskId}`}
            className={`${styles['task-card']} ${styles[config.colorClass + "Card"]}`}
          >
            <div className={styles['task-card-header']}>
              {/* Status cycle button */}
              <button
                className={`${styles['status-button']} ${styles[config.colorClass]}`}
                onClick={() => handleCycleStatus(task)}
                title={`Status: ${config.label} — click to cycle`}
              >
                <StatusIcon size={14} />
              </button>

              {/* Content */}
              <div
                className={styles['task-info']}
                onClick={() => setExpandedId(isExpanded ? null : task.taskId)}
              >
                <div
                  className={`${styles['task-subject']} ${task.status === "completed" ? styles['task-done'] : ""}`}
                >
                  <span className={styles['task-id-badge']}>#{task.taskId}</span>
                  {task.subject}
                </div>
                <div className={styles['task-meta']}>
                  <span
                    className={`${styles['task-status-badge']} ${styles[config.colorClass]}`}
                  >
                    {config.label}
                  </span>
                  {task.status === "in_progress" && task.activeForm && (
                    <span className={styles['is-active-state-form-badge']}>
                      <Loader2 size={9} className={styles['is-active-state-form-spin']} />
                      {task.activeForm}
                    </span>
                  )}
                  {task.project && (
                    <span className={styles['task-project-badge']}>
                      {task.project}
                    </span>
                  )}
                  {task.createdAt && (
                    <BadgeComponent type="dateTime" date={task.createdAt} />
                  )}
                </div>
              </div>

              {/* Expand/collapse */}
              <button
                className={styles['expand-button']}
                onClick={() => setExpandedId(isExpanded ? null : task.taskId)}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </button>

              {/* Delete */}
              <button
                className={styles['delete-button']}
                onClick={() =>
                  setConfirmingDeleteId(isConfirming ? null : task.taskId)
                }
                title="Delete task"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className={styles['task-detail']}>
                <div className={styles['task-description']}>{task.description}</div>
                {task.metadata && Object.keys(task.metadata).length > 0 && (
                  <div className={styles['task-metadata']}>
                    {Object.entries(task.metadata).map(([key, value]) => (
                      <span key={key} className={styles['meta-tag']}>
                        <span className={styles['meta-key']}>{key}</span>
                        <span className={styles['meta-value']}>{String(value)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {task.conversationId && (
                  <div className={styles['task-conversation']}>
                    Conv: {task.conversationId.slice(0, 8)}…
                  </div>
                )}
              </div>
            )}

            {/* Delete confirm */}
            {isConfirming && (
              <div className={styles['confirm-layout-row']}>
                <span className={styles['confirm-label']}>
                  Delete task #{task.taskId}?
                </span>
                <button
                  className={`${styles['confirm-button']} ${styles['confirm-button-element-yes']}`}
                  onClick={() => handleDelete(task)}
                >
                  Delete
                </button>
                <button
                  className={`${styles['confirm-button']} ${styles['confirm-button-element-no']}`}
                  onClick={() => setConfirmingDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
