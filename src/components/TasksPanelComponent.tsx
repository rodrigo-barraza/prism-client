"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DateTimeBadgeComponent } from "@rodrigo-barraza/components-library";
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

import styles from "./TasksPanelComponent.module.css";

const STATUS_CONFIG = {
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
  agentSessionId,
  onCountChange,
}: any) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const hasData = useRef<any>(false);

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
        agentSessionId: agentSessionId || undefined,
      });
      setTasks(result.tasks || []);
      setSummary(result.summary || null);
      onCountChange?.(result.summary?.total || (result.tasks || []).length);
      hasData.current = true;
    } catch (error: any) {
      console.error("Failed to load tasks:", error);
      if (!hasData.current) setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, agentSessionId, onCountChange]);

  // Reset on session change (new conversation = clean slate)
  useEffect(() => {
    hasData.current = false;
    setTasks([]);
    setSummary(null);
  }, [agentSessionId]);

  // Single effect — fires on mount, refreshKey changes, and statusFilter/session changes
  useEffect(() => {
    loadTasks();
  }, [loadTasks, refreshKey]);

  // -- Create -------------------------------------------------

  const handleCreate = useCallback(
    async (e: any) => {
      e.preventDefault();
      if (!newSubject.trim() || !newDescription.trim()) return;
      setCreating(true);
      try {
        await ToolsApiService.createAgenticTask(project, {
          subject: newSubject.trim(),
          description: newDescription.trim(),
        });
        setNewSubject("");
        setNewDescription("");
        setShowNewForm(false);
        loadTasks();
      } catch (error: any) {
        console.error("Failed to create task:", error);
      } finally {
        setCreating(false);
      }
    },
    [project, newSubject, newDescription, loadTasks],
  );

  // -- Status cycle -------------------------------------------

  const handleCycleStatus = useCallback(
    async (task: any) => {
      const index = STATUS_CYCLE.indexOf(task.status);
      const nextStatus = STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
      try {
        await ToolsApiService.updateAgenticTask(task.project, task.taskId, {
          status: nextStatus,
        });
        // Optimistic
        setTasks((prev: any) =>
          prev.map((t: any) =>
            t.project === task.project && t.taskId === task.taskId
              ? { ...t, status: nextStatus }
              : t,
          ),
        );
        // Refresh summary
        loadTasks();
      } catch (error: any) {
        console.error("Failed to update task:", error);
      }
    },
    [loadTasks],
  );

  // -- Delete -------------------------------------------------

  const handleDelete = useCallback(
    async (task: any) => {
      try {
        await ToolsApiService.deleteAgenticTask(task.project, task.taskId);
        setTasks((prev: any) =>
          prev.filter(
            (t: any) =>
              !(t.project === task.project && t.taskId === task.taskId),
          ),
        );
        setConfirmingDeleteId(null);
        loadTasks();
      } catch (error: any) {
        console.error("Failed to delete task:", error);
      }
    },
    [loadTasks],
  );

  // -- Loading ------------------------------------------------

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <RefreshCw size={14} className={styles.spin} />
          Loading tasks…
        </div>
      </div>
    );
  }

  // -- Error --------------------------------------------------

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Failed to load tasks: {error}</div>
      </div>
    );
  }

  // -- Render -------------------------------------------------

  return (
    <div className={styles.container}>
      {/* -- Header -------------------------------------------- */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          Tasks {summary ? `(${(summary as any).total})` : ""}
        </span>
        <button
          className={styles.headerBtn}
          onClick={() => setShowNewForm((v: any) => !v)}
          title="Create task"
        >
          {showNewForm ? <X size={11} /> : <Plus size={11} />}
        </button>
        <button
          className={styles.headerBtn}
          onClick={loadTasks}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? styles.spin : ""} />
        </button>
      </div>

      {/* -- Summary badges ------------------------------------ */}
      {summary && (summary as any).total > 0 && (
        <div className={styles.summaryRow}>
          {STATUS_CYCLE.map((s: any) => {
            const config = (STATUS_CONFIG as any)[s];
            const count = summary[s] || 0;
            if (count === 0 && statusFilter !== s) return null;
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                className={`${styles.summaryBadge} ${styles[config.colorClass]} ${isActive ? styles.summaryBadgeActive : ""}`}
                onClick={() => setStatusFilter(isActive ? null : s)}
                title={`${isActive ? "Clear" : "Filter"}: ${config.label}`}
              >
                <config.icon size={9} />
                {count}
              </button>
            );
          })}
        </div>
      )}

      {/* -- New Task Form ------------------------------------ */}
      {showNewForm && (
        <form className={styles.newTaskForm} onSubmit={handleCreate}>
          <input
            className={styles.newTaskInput}
            placeholder="Task subject…"
            value={newSubject}
            onChange={(e: any) => setNewSubject(e.target.value)}
            autoFocus
          />
          <textarea
            className={styles.newTaskTextarea}
            placeholder="Description…"
            value={newDescription}
            onChange={(e: any) => setNewDescription(e.target.value)}
            rows={2}
          />
          <div className={styles.newTaskActions}>
            <button
              type="submit"
              className={styles.newTaskSubmit}
              disabled={
                creating || !newSubject.trim() || !newDescription.trim()
              }
            >
              {creating ? (
                <RefreshCw size={10} className={styles.spin} />
              ) : (
                <Plus size={10} />
              )}
              Create
            </button>
            <button
              type="button"
              className={styles.newTaskCancel}
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
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <ListChecks size={24} />
          </div>
          <div className={styles.emptyTitle}>No tasks yet</div>
          <div className={styles.emptySubtitle}>
            {statusFilter
              ? `No ${(STATUS_CONFIG[statusFilter] as any)?.label.toLowerCase()} tasks. Try clearing the filter.`
              : "Tasks are created by the agent during coding sessions, or you can create them manually."}
          </div>
        </div>
      )}

      {/* -- Task list --------------------------------------- */}
      {tasks.map((task: any) => {
        const config =
          (STATUS_CONFIG as any)[task.status] || STATUS_CONFIG.pending;
        const StatusIcon = config.icon;
        const isExpanded = expandedId === task.taskId;
        const isConfirming = confirmingDeleteId === task.taskId;

        return (
          <div
            key={`${task.project}-${task.taskId}`}
            className={`${styles.taskCard} ${styles[config.colorClass + "Card"]}`}
          >
            <div className={styles.taskCardHeader}>
              {/* Status cycle button */}
              <button
                className={`${styles.statusBtn} ${styles[config.colorClass]}`}
                onClick={() => handleCycleStatus(task)}
                title={`Status: ${config.label} — click to cycle`}
              >
                <StatusIcon size={14} />
              </button>

              {/* Content */}
              <div
                className={styles.taskInfo}
                onClick={() => setExpandedId(isExpanded ? null : task.taskId)}
              >
                <div
                  className={`${styles.taskSubject} ${task.status === "completed" ? styles.taskDone : ""}`}
                >
                  <span className={styles.taskIdBadge}>#{task.taskId}</span>
                  {task.subject}
                </div>
                <div className={styles.taskMeta}>
                  <span
                    className={`${styles.taskStatusBadge} ${styles[config.colorClass]}`}
                  >
                    {config.label}
                  </span>
                  {task.status === "in_progress" && task.activeForm && (
                    <span className={styles.activeFormBadge}>
                      <Loader2 size={9} className={styles.activeFormSpin} />
                      {task.activeForm}
                    </span>
                  )}
                  {task.project && (
                    <span className={styles.taskProjectBadge}>
                      {task.project}
                    </span>
                  )}
                  {task.createdAt && (
                    <DateTimeBadgeComponent date={task.createdAt} />
                  )}
                </div>
              </div>

              {/* Expand/collapse */}
              <button
                className={styles.expandBtn}
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
                className={styles.deleteBtn}
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
              <div className={styles.taskDetail}>
                <div className={styles.taskDescription}>{task.description}</div>
                {task.metadata && Object.keys(task.metadata).length > 0 && (
                  <div className={styles.taskMetadata}>
                    {Object.entries(task.metadata).map(([k, v]: any) => (
                      <span key={k} className={styles.metaTag}>
                        <span className={styles.metaKey}>{k}</span>
                        <span className={styles.metaValue}>{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {task.conversationId && (
                  <div className={styles.taskConversation}>
                    Conv: {task.conversationId.slice(0, 8)}…
                  </div>
                )}
              </div>
            )}

            {/* Delete confirm */}
            {isConfirming && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>
                  Delete task #{task.taskId}?
                </span>
                <button
                  className={`${styles.confirmBtn} ${styles.confirmBtnYes}`}
                  onClick={() => handleDelete(task)}
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
    </div>
  );
}
