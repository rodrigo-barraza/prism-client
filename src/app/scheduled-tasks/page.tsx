"use client";
import { AGENT_IDS, AGENTLESS_AGENT, LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT, EVENT_NAME_CRON_JOB_SCHEDULED } from "@/constants";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useRouter } from "next/navigation";

import {
  ArrowUpDown,
  Clock,
  Plus,
  MoreVertical,
  Trash2,
  Play,
  Check,
  Loader2,
  X,
  Bot,
  Sparkles,
  Copy,
  LayoutGrid,
  List,
  CalendarDays,
  Pencil,
  History,
} from "lucide-react";
import PanelLoadingSpinner from "../../components/PanelLoadingSpinnerComponent";
import PrismService from "../../services/PrismService";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import {
  LayoutHeaderComponent,
  ModalComponent,
  SelectComponent,
  SearchInputComponent,
  InputComponent,
  TextAreaComponent,
  FormGroupComponent,
  ButtonComponent,
  TableComponent,
  BadgeComponent,
} from "@rodrigo-barraza/components-library";
import { AgentPersona, PrismConfig, ModelOption, ToolSchema, Conversation } from "../../types/types";
import ToolBadgeComponent from "../../components/ToolBadgeComponent";
import AgentPickerComponent from "../../components/AgentPickerComponent";
import { getErrorMessage } from "../../utils/errorMessage";
import ModelPickerPopoverComponent from "../../components/ModelPickerPopoverComponent";
import { ViewModeToggleComponent } from "../../components/FilterBarComponent";
import ScheduledTaskCalendarComponent from "../../components/ScheduledTaskCalendarComponent";
import { TOOL_NAMES } from "@rodrigo-barraza/utilities-library/taxonomy";
import styles from "./page.module.css";

interface Workspace {
  id: string;
  name: string;
  path: string;
}

interface Agent {
  id: string;
  name: string;
  description?: string;
  project?: string;
}

interface Model {
  name: string;
  displayName?: string;
  tools?: string[];
}

interface Task {
  id: string;
  name: string;
  project: string;
  prompt: string;
  agent: string | null;
  provider: string;
  model: string;
  scheduleType: "hourly" | "daily" | "weekly" | "cron" | "trigger" | "once" | "custom";
  scheduleTime?: string;
  scheduleDay?: number;
  scheduleDate?: string;
  cronExpression?: string;
  recurrenceRule?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    interval: number;
    startDate?: string;
    weekdays?: number[];
    monthlyType?: "dayOfMonth" | "nthDayOfWeek";
    dayOfMonth?: number;
    nthDayOfWeek?: {
      occurrence: 1 | 2 | 3 | 4 | -1;
      dayOfWeek: number;
    };
    yearlyType?: "specificDate" | "nthDayOfWeek";
    months?: number[];
  };
  enabled: boolean;
  lastRunMinute?: string;
  createdAt: string;
  updatedAt: string;
  username?: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

const NONE_AGENT: AgentPersona = {
  id: AGENT_IDS.NONE,
  name: AGENTLESS_AGENT.name,
  description:
    "A straightforward conversation with the AI — no automated workflows, just you and the model.",
  project: "direct",
  toolCount: -1,
  custom: false,
  icon: "",
  avatar: "",
  color: "",
  backgroundImage: "",
  enabledToolNames: [],
  enabledByDefaultToolNames: [],
  coreToolsLocked: false,
  canSpawnSubAgents: false,
  usesDirectoryTree: false,
  usesCodingGuidelines: false,
};

interface CronJobDetailPanelProps {
  task: Task;
  onClose: () => void;
  onTrigger: (_task: Task) => void;
  onDelete: (_task: Task) => void;
  onToggle: (_task: Task) => void;
  onEdit: (_task: Task) => void;
  agentName: string;
  formatScheduleText: (_task: Task) => string;
  allToolNames: string[];
}

function CronJobDetailPanel({
  task,
  onClose,
  onTrigger,
  onDelete,
  onEdit,
  agentName,
  formatScheduleText,
  allToolNames,
}: CronJobDetailPanelProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const parsePromptWithToolBadges = useCallback((promptText: string) => {
    if (!promptText) return "";
    if (!allToolNames || allToolNames.length === 0) return promptText;

    const sortedToolNames = [...allToolNames].sort(
      (firstToolName, secondToolName) => secondToolName.length - firstToolName.length
    );

    const escapedNames = sortedToolNames.map(
      (toolName) => toolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );

    const regex = new RegExp(`\\b(${escapedNames.join("|")})\\b`, "g");

    const parts = promptText.split(regex);
    if (parts.length <= 1) {
      return promptText;
    }

    return parts.map((textSegment, segmentIndex) => {
      if (segmentIndex % 2 === 1) {
        return (
          <span key={segmentIndex} className={styles["inline-tool-badge-wrapper"]}>
            <ToolBadgeComponent name={textSegment} variant="default" />
          </span>
        );
      }
      return textSegment;
    });
  }, [allToolNames]);

  const loadHistory = useCallback(() => {
    setIsLoadingHistory(true);
    PrismService.getTaskConversations(task.project, task.id)
      .then((data) => {
        setConversations(data.items || []);
      })
      .catch((error) => {
        console.error("Failed to load task conversation history:", error);
      })
      .finally(() => {
        setIsLoadingHistory(false);
      });
  }, [task.id, task.project]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRunNow = async () => {
    await onTrigger(task);
    // Wait a brief period for the backend to create the conversation, then refresh.
    setTimeout(() => {
      loadHistory();
    }, 1000);
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (clickEvent: KeyboardEvent) => {
      if (clickEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles['detail-overlay']} onClick={onClose}>
      <aside
        className={styles['detail-panel']}
        onClick={(clickEvent: React.MouseEvent) => clickEvent.stopPropagation()}
        aria-labelledby="cron-job-detail-title"
      >
        {/* Header */}
        <header className={styles['detail-header']}>
          <div className={styles['detail-title-block']}>
            <h2 id="cron-job-detail-title" className={styles['detail-clean-name']}>
              {task.name}
            </h2>
            <div className={styles['detail-title']}>{task.id}</div>
          </div>
          <button
            className={styles['detail-close']}
            onClick={onClose}
            title="Close"
            aria-label="Close details"
          >
            <X />
          </button>
        </header>

        {/* Body */}
        <main className={styles['detail-body']}>
          {/* Status and Action Buttons */}
          <section className={styles['detail-section']}>
            <div className={styles['detail-section-title']}>
              Status & Actions
            </div>
            <div className={styles['detail-actions-layout-row']}>
              <button
                className={`${styles['detail-action-button']} ${styles['detail-edit-button']}`}
                onClick={() => {
                  onEdit(task);
                  onClose();
                }}
                title="Edit scheduled task"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                className={`${styles['detail-action-button']} ${styles['detail-trigger-button']}`}
                onClick={handleRunNow}
                title="Run scheduled task now"
              >
                <Play size={14} /> Run Now
              </button>
              <button
                className={`${styles['detail-action-button']} ${styles['detail-delete-button']}`}
                onClick={() => {
                  if (confirm("Are you sure you want to delete this Scheduled Task?")) {
                    onDelete(task);
                    onClose();
                  }
                }}
                title="Delete scheduled task"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </section>

          {/* Schedule */}
          <section className={styles['detail-section']}>
            <div className={styles['detail-section-title']}>
              <Clock size={12} /> Schedule
            </div>
            <div className={styles['detail-metadata-grid']}>
              <div className={styles['detail-metadata-item']}>
                <span className={styles['detail-metadata-label']}>Type</span>
                <span className={styles['detail-metadata-value']}>
                  {task.scheduleType.toUpperCase()}
                </span>
              </div>
              <div className={styles['detail-metadata-item']}>
                <span className={styles['detail-metadata-label']}>Details</span>
                <span className={styles['detail-metadata-value']}>
                  {formatScheduleText(task)}
                </span>
              </div>
            </div>
          </section>

          {/* Prompt */}
          <section className={styles['detail-section']}>
            <div className={styles['detail-section-title']}>
              Prompt
            </div>
            <div className={styles['detail-prompt-block']}>
              {parsePromptWithToolBadges(task.prompt)}
            </div>
          </section>

          {/* Execution History */}
          <section className={styles['detail-section']}>
            <div className={styles['detail-section-title']}>
              <History size={12} /> Execution History
            </div>
            {isLoadingHistory ? (
              <div className={styles["history-is-loading-state"]}>
                <Loader2 className={styles['spin']} size={16} /> Loading execution history...
              </div>
            ) : conversations.length === 0 ? (
              <div className={styles["history-empty"]}>
                No past runs found for this task.
              </div>
            ) : (
              <div className={styles["history-list"]}>
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    className={styles["history-item"]}
                    onClick={() => {
                      router.push(`/chat?conversation=${conv.id}&agent=${conv.agent || AGENT_IDS.NONE}`);
                      onClose();
                    }}
                  >
                    <div className={styles["history-item-details"]}>
                      <div className={styles["history-item-title"]}>
                        {conv.title || "Untitled Run"}
                      </div>
                      <div className={styles["history-item-metadata"]}>
                        <span>{new Date(conv.createdAt).toLocaleString()}</span>
                        {(conv.totalCost ?? 0) > 0 && (
                          <span className={styles["history-item-cost"]}>
                            ${(conv.totalCost ?? 0).toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={styles["history-item-status"]}>
                      {conv.isActive !== false ? (
                        <span className={styles["status-generating"]}>{conv.isGenerating ? "Generating..." : "Running..."}</span>
                      ) : (
                        <span className={styles["status-completed"]}>Completed</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Configuration / Metadata */}
          <section className={styles['detail-section']}>
            <div className={styles['detail-section-title']}>
              Configuration
            </div>
            <div className={styles['detail-metadata-grid']}>
              <div className={styles['detail-metadata-item']}>
                <span className={styles['detail-metadata-label']}>Agent</span>
                <span className={styles['detail-metadata-value']}>
                  <Bot size={14} style={{ color: "var(--accent-primary)", opacity: 0.7 }} />
                  {agentName}
                </span>
              </div>
              <div className={styles['detail-metadata-item']}>
                <span className={styles['detail-metadata-label']}>Model</span>
                <span className={styles['detail-metadata-value']}>
                  <Sparkles size={14} style={{ color: "var(--accent-primary)", opacity: 0.7 }} />
                  {task.model.split("/").pop()}
                </span>
              </div>
              <div className={styles['detail-metadata-item']}>
                <span className={styles['detail-metadata-label']}>Project</span>
                <span className={styles['detail-metadata-value']}>
                  {task.project || "—"}
                </span>
              </div>
              <div className={styles['detail-metadata-item']}>
                <span className={styles['detail-metadata-label']}>Status</span>
                <span className={styles['detail-metadata-value']}>
                  {task.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </section>
        </main>
      </aside>
    </div>
  );
}

interface ScheduledTasksPageProps {
  mode?: "user" | "admin";
}

export function ScheduledTasksPage({ mode = "user" }: ScheduledTasksPageProps) {
  const isAdminMode = mode === "admin";

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agents, setAgents] = useState<AgentPersona[]>([]);
  const [modelsMap, setModelsMap] = useState<Record<string, Model[]>>({});
  const [_providers, setProviders] = useState<string[]>([]);
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAnchorPosition, setMenuAnchorPosition] = useState<{ top: number; left: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewMode, setViewMode] = usePersistedState("scheduled-tasks:view-mode", "calendar");
  const [activeSortKeys, setActiveSortKeys] = useState<string[]>(["createdAt"]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [allToolNames, setAllToolNames] = useState<string[]>([]);

  // New task form state
  const [formName, setFormName] = useState("");
  const [formProject, setFormProject] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formAgent, setFormAgent] = useState<string>(AGENT_IDS.CODING);
  const [formProvider, setFormProvider] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<
    "hourly" | "daily" | "weekly" | "cron" | "trigger" | "once" | "custom"
  >("daily");
  const [formTimeHour, setFormTimeHour] = useState("09");
  const [formTimeMinute, setFormTimeMinute] = useState("00");
  const [formTimeAmpm, setFormTimeAmpm] = useState("AM");
  const [formWeeklyDay, setFormWeeklyDay] = useState(1); // Monday
  const [formCron, setFormCron] = useState("0 9 * * *");
  const [formOnceDate, setFormOnceDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  
  // Custom recurrence states
  const [formCustomFrequency, setFormCustomFrequency] = useState<"daily" | "weekly" | "monthly" | "yearly">("weekly");
  const [formCustomInterval, setFormCustomInterval] = useState<number>(1);
  const [formCustomWeekdays, setFormCustomWeekdays] = useState<number[]>([1]); // default Monday
  const [formCustomMonthlyType, setFormCustomMonthlyType] = useState<"dayOfMonth" | "nthDayOfWeek">("dayOfMonth");
  const [formCustomDayOfMonth, setFormCustomDayOfMonth] = useState<number>(1);
  const [formCustomNthDayOccurrence, setFormCustomNthDayOccurrence] = useState<1 | 2 | 3 | 4 | -1>(1);
  const [formCustomNthDayOfWeek, setFormCustomNthDayOfWeek] = useState<number>(2); // Tuesday
  const [formCustomYearlyType, setFormCustomYearlyType] = useState<"specificDate" | "nthDayOfWeek">("specificDate");
  const [formCustomMonths, setFormCustomMonths] = useState<number[]>([5]); // default May

  const [formSubmitting, setFormSubmitting] = useState(false);

  const isEditMode = editingTask !== null;

  const populateFormFromTask = useCallback((task: Task) => {
    setFormName(task.name);
    setFormPrompt(task.prompt);
    setFormAgent(task.agent || AGENT_IDS.NONE);
    setFormProvider(task.provider);
    setFormModel(task.model);
    setFormProject(task.project || "");
    setFormScheduleType(task.scheduleType);
    setFormCron(task.cronExpression || "0 9 * * *");
    setFormOnceDate(task.scheduleDate || new Date().toISOString().split("T")[0]);

    if (task.scheduleType === "weekly") {
      setFormWeeklyDay(task.scheduleDay ?? 1);
    }

    if (task.scheduleTime) {
      const [hourValue, minuteValue] = task.scheduleTime.split(":").map(Number);
      const isPM = hourValue >= 12;
      const displayHour = hourValue % 12 || 12;
      setFormTimeHour(String(displayHour).padStart(2, "0"));
      setFormTimeMinute(String(minuteValue).padStart(2, "0"));
      setFormTimeAmpm(isPM ? "PM" : "AM");
    } else {
      setFormTimeHour("09");
      setFormTimeMinute("00");
      setFormTimeAmpm("AM");
    }

    if (task.scheduleType === "custom" && task.recurrenceRule) {
      const rule = task.recurrenceRule;
      setFormCustomFrequency(rule.frequency);
      setFormCustomInterval(rule.interval || 1);
      setFormCustomWeekdays(rule.weekdays || [1]);
      setFormCustomMonthlyType(rule.monthlyType || "dayOfMonth");
      setFormCustomDayOfMonth(rule.dayOfMonth ?? 1);
      setFormCustomNthDayOccurrence((rule.nthDayOfWeek?.occurrence as 1 | 2 | 3 | 4 | -1) ?? 1);
      setFormCustomNthDayOfWeek(rule.nthDayOfWeek?.dayOfWeek ?? 2);
      setFormCustomYearlyType(rule.yearlyType || "specificDate");
      setFormCustomMonths(rule.months || [5]);
    }
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    populateFormFromTask(task);
    setShowNewModal(true);
    setSelectedTask(null);
    setActiveMenuId(null);
  }, [populateFormFromTask]);

  const resetFormFields = useCallback(() => {
    setFormName("");
    setFormPrompt("");
    setFormAgent(AGENT_IDS.CODING);
    setFormScheduleType("daily");
    setFormTimeHour("09");
    setFormTimeMinute("00");
    setFormTimeAmpm("AM");
    setFormWeeklyDay(1);
    setFormCron("0 9 * * *");
    setFormOnceDate(new Date().toISOString().split("T")[0]);
    setFormCustomFrequency("weekly");
    setFormCustomInterval(1);
    setFormCustomWeekdays([1]);
    setFormCustomMonthlyType("dayOfMonth");
    setFormCustomDayOfMonth(1);
    setFormCustomNthDayOccurrence(1);
    setFormCustomNthDayOfWeek(2);
    setFormCustomYearlyType("specificDate");
    setFormCustomMonths([5]);
    setEditingTask(null);
  }, []);

  // -- Show Toast Helper --
  const showToast = useCallback(
    (message: string, type: Toast["type"] = "success") => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((previousToasts) => [...previousToasts, { id, message, type }]);
      setTimeout(() => {
        setToasts((previousToasts) => previousToasts.filter((toastItem) => toastItem.id !== id));
      }, 4000);
    },
    [],
  );

  // -- Fetch all data --
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch tasks
      const fetchedTasks = isAdminMode
        ? await PrismService.getAllCronJobs()
        : await PrismService.getCronJobs();
      setTasks(fetchedTasks as Task[]);

      // 2. Fetch workspaces
      const fetchedWorkspaces = await PrismService._request<Workspace[]>(
        "/workspaces",
        { method: "GET" },
      );
      setWorkspaces(fetchedWorkspaces);
      if (fetchedWorkspaces.length > 0) {
        setFormProject(fetchedWorkspaces[0].name);
      }

      // 3. Fetch agent personas
      const fetchedAgents = await PrismService.getAgentPersonas();
      setAgents([NONE_AGENT, ...fetchedAgents]);

      // 4. Fetch config for providers and models
      const config = await PrismService.getConfig();
      setConfig(config);
      const textModelsMap = config.textToText?.models || {};

      // Filter models: show all for direct, or only tool calling models
      const cleanModelsMap: Record<string, Model[]> = {};
      const activeProviders: string[] = [];

      for (const [provider, modelOpts] of Object.entries(
        textModelsMap,
      ) as [string, ModelOption[]][]) {
        if (modelOpts.length > 0) {
          cleanModelsMap[provider] = modelOpts.map((modelOption) => ({
            name: modelOption.name,
            displayName: modelOption.display_name || modelOption.label || modelOption.name,
            tools: modelOption.tools || [],
          }));
          activeProviders.push(provider);
        }
      }

      setModelsMap(cleanModelsMap);
      setProviders(activeProviders);

      if (activeProviders.length > 0) {
        setFormProvider(activeProviders[0]);
        if (cleanModelsMap[activeProviders[0]]?.length > 0) {
          setFormModel(cleanModelsMap[activeProviders[0]][0].name);
        }
      }

      // 5. Fetch favorites
      try {
        const favs = await PrismService.getFavorites("model");
        setFavoriteKeys(favs.map((favorite) => favorite.key as string));
      } catch (error) {
        console.error("Failed to load favorite models", error);
      }

      // Fetch built-in and custom tool names for inline badge parsing
      try {
        const builtInSchemas = await PrismService.getBuiltInToolSchemas().catch(() => [] as ToolSchema[]);
        const agentToolNames = fetchedAgents.flatMap((agent) => agent.enabledToolNames || []);
        
        const canonicalCapabilities = [
          "Thinking",
          "Tool Calling",
          "Web Search",
          "Google Search",
          "Web Fetch",
          "Code Execution",
          "Computer Use",
          "File Search",
          "URL Context",
          "Image Generation",
          TOOL_NAMES.GOOGLE_SEARCH,
        ];
        
        const combinedNames = new Set<string>([
          ...canonicalCapabilities,
          ...builtInSchemas.map((schema) => schema.name),
          ...agentToolNames,
        ]);
        
        const cleanNames = Array.from(combinedNames).filter(
          (toolName) => typeof toolName === "string" && toolName.trim().length > 0
        );
        setAllToolNames(cleanNames);
      } catch (toolError) {
        console.error("Failed to load tool names for badge parsing", toolError);
      }
    } catch (error: unknown) {
      console.error(error);
      showToast("Failed to load initial data", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, isAdminMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -- Form side-effects --
  useEffect(() => {
    if (formProvider && modelsMap[formProvider]?.length > 0) {
      setFormModel(modelsMap[formProvider][0].name);
    }
  }, [formProvider, modelsMap]);

  // -- Favorites -------------------------------------------------
  const handleToggleFavorite = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((previousFavoriteKeys) => previousFavoriteKeys.filter((k) => k !== key));
        try {
          await PrismService.removeFavorite("model", key);
        } catch {}
      } else {
        setFavoriteKeys((previousFavoriteKeys) => [...previousFavoriteKeys, key]);
        try {
          await PrismService.addFavorite("model", key, { type: "model" });
        } catch {}
      }
    },
    [favoriteKeys],
  );

  // -- Handle task toggle enablement --
  const handleToggleTask = async (task: Task) => {
    const nextEnabledValue = !task.enabled;
    try {
      const updated = await PrismService.updateCronJob(task.id, {
        enabled: nextEnabledValue,
      });
      setTasks((previousTasks) =>
        previousTasks.map((taskItem) =>
          taskItem.id === task.id ? { ...taskItem, enabled: updated.enabled } : taskItem,
        ),
      );
      showToast(
        `Task "${task.name}" is now ${nextEnabledValue ? "enabled" : "disabled"}`,
      );
    } catch (error) {
      console.error(error);
      showToast("Failed to toggle task state", "error");
    }
  };

  // -- Handle manual run trigger --
  const handleTriggerTask = async (task: Task) => {
    setActiveMenuId(null);
    setTriggeringId(task.id);
    try {
      const triggerResponse = await PrismService.triggerCronJob(task.id);
      showToast(
        `Task successfully triggered. Conversation ID: ${triggerResponse.agentConversationId.slice(0, 8)}…`,
      );
    } catch (error: unknown) {
      console.error(error);
      showToast(getErrorMessage(error) || "Failed to trigger task", "error");
    } finally {
      setTriggeringId(null);
    }
  };

  // -- Handle task deletion --
  const handleDeleteTask = async (task: Task) => {
    try {
      await PrismService.deleteCronJob(task.id);
      setTasks((previousTasks) => previousTasks.filter((taskItem) => taskItem.id !== task.id));
      showToast(`Deleted task "${task.name}"`);
      setConfirmDeleteId(null);
    } catch (error) {
      console.error(error);
      showToast("Failed to delete task", "error");
    }
  };

  // -- Handle task creation or update submit --
  const handleSubmitTask = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrompt.trim() || !formProvider || !formModel) {
      showToast("Please fill all required fields", "error");
      return;
    }

    setFormSubmitting(true);

    // Calculate time format
    let scheduleTime = "";
    if (
      formScheduleType === "daily" ||
      formScheduleType === "weekly" ||
      formScheduleType === "once" ||
      formScheduleType === "custom"
    ) {
      let handler = parseInt(formTimeHour, 10);
      if (formTimeAmpm === "PM" && handler < 12) handler += 12;
      if (formTimeAmpm === "AM" && handler === 12) handler = 0;
      scheduleTime = `${String(handler).padStart(2, "0")}:${formTimeMinute}`;
    }

    let recurrenceRule: Task["recurrenceRule"] = undefined;
    if (formScheduleType === "custom") {
      recurrenceRule = {
        frequency: formCustomFrequency,
        interval: formCustomInterval,
        weekdays: formCustomFrequency === "weekly" ? formCustomWeekdays : undefined,
        monthlyType: formCustomFrequency === "monthly" ? formCustomMonthlyType : undefined,
        dayOfMonth: formCustomFrequency === "monthly"
          ? (formCustomMonthlyType === "dayOfMonth" ? formCustomDayOfMonth : undefined)
          : (formCustomFrequency === "yearly"
            ? (formCustomYearlyType === "specificDate" ? formCustomDayOfMonth : undefined)
            : undefined),
        nthDayOfWeek: (formCustomFrequency === "monthly" && formCustomMonthlyType === "nthDayOfWeek")
          ? { occurrence: formCustomNthDayOccurrence, dayOfWeek: formCustomNthDayOfWeek }
          : ((formCustomFrequency === "yearly" && formCustomYearlyType === "nthDayOfWeek")
            ? { occurrence: formCustomNthDayOccurrence, dayOfWeek: formCustomNthDayOfWeek }
            : undefined),
        yearlyType: formCustomFrequency === "yearly" ? formCustomYearlyType : undefined,
        months: formCustomFrequency === "yearly" ? formCustomMonths : undefined,
      };
    }

    const taskPayload = {
      name: formName.trim(),
      prompt: formPrompt.trim(),
      agent: formAgent === AGENT_IDS.NONE ? null : formAgent,
      provider: formProvider,
      model: formModel,
      scheduleType: formScheduleType,
      scheduleTime: scheduleTime || undefined,
      scheduleDay: formScheduleType === "weekly" ? formWeeklyDay : undefined,
      scheduleDate: formScheduleType === "once" ? formOnceDate : undefined,
      cronExpression:
        formScheduleType === "cron" ? formCron.trim() : undefined,
      recurrenceRule: recurrenceRule,
    };

    try {
      if (editingTask) {
        const updatedTask = await PrismService.updateCronJob(editingTask.id, taskPayload);
        setTasks((previousTasks) =>
          previousTasks.map((task) => (task.id === editingTask.id ? { ...task, ...updatedTask } : task)),
        );
        showToast(`Scheduled Task "${formName}" updated successfully!`);
      } else {
        const createdTask = await PrismService.createCronJob(taskPayload);
        setTasks((previousTasks) => [createdTask, ...previousTasks]);
        showToast(`Scheduled Task "${formName}" created successfully!`);
        const currentNotificationCount = parseInt(localStorage.getItem(LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT) || "0", 10);
        localStorage.setItem(LOCAL_STORAGE_KEY_CRON_JOB_NOTIFICATIONS_COUNT, String(currentNotificationCount + 1));
        window.dispatchEvent(new CustomEvent(EVENT_NAME_CRON_JOB_SCHEDULED));
      }

      setShowNewModal(false);
      resetFormFields();
    } catch (error: unknown) {
      console.error(error);
      showToast(getErrorMessage(error) || `Failed to ${editingTask ? "update" : "create"} task`, "error");
    } finally {
      setFormSubmitting(false);
    }
  };

  // -- Format schedule text --
  const formatScheduleText = (task: Task) => {
    if (task.scheduleType === "hourly") return "Hourly";

    const formatTime = (timeValue?: string) => {
      if (!timeValue) return "";
      const [hours, minutes] = timeValue.split(":").map(Number);
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHour = hours % 12 || 12;
      const displayMin = String(minutes).padStart(2, "0");
      return `${displayHour}:${displayMin} ${ampm}`;
    };

    if (task.scheduleType === "daily") {
      return `Daily around ${formatTime(task.scheduleTime)}`;
    }

    if (task.scheduleType === "weekly") {
      const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayName = days[task.scheduleDay ?? 1] || "Monday";
      return `Weekly on ${dayName} around ${formatTime(task.scheduleTime)}`;
    }

    if (task.scheduleType === "cron") {
      return `Cron expression: ${task.cronExpression || "* * * * *"}`;
    }

    if (task.scheduleType === "trigger") {
      return "Manual / Remote Trigger";
    }

    if (task.scheduleType === "once") {
      return `One-time on ${task.scheduleDate || ""} around ${formatTime(task.scheduleTime)}`;
    }

    if (task.scheduleType === "custom" && task.recurrenceRule) {
      const rule = task.recurrenceRule;
      const freq = rule.frequency;
      const intervalString = rule.interval > 1
        ? `every ${rule.interval} ${freq === "daily" ? "days" : freq === "weekly" ? "weeks" : freq === "monthly" ? "months" : "years"}`
        : `every ${freq === "daily" ? "day" : freq === "weekly" ? "week" : freq === "monthly" ? "month" : "year"}`;
      
      const timeString = formatTime(task.scheduleTime);
      const timeSuffix = timeString ? ` around ${timeString}` : "";

      const daysOfWeekLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const monthLabels = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

      if (freq === "daily") {
        return `Custom: Repeat ${intervalString}${timeSuffix}`;
      }

      if (freq === "weekly") {
        const weekdaysNames = rule.weekdays && rule.weekdays.length > 0
          ? rule.weekdays.map(dayIndex => daysOfWeekLabels[dayIndex]).join(", ")
          : daysOfWeekLabels[task.scheduleDay ?? 1];
        return `Custom: Repeat ${intervalString} on ${weekdaysNames}${timeSuffix}`;
      }

      if (freq === "monthly") {
        if (rule.monthlyType === "nthDayOfWeek" && rule.nthDayOfWeek) {
          const occ = rule.nthDayOfWeek.occurrence;
          const occName = occ === 1 ? "first" : occ === 2 ? "second" : occ === 3 ? "third" : occ === 4 ? "fourth" : "last";
          const dayName = daysOfWeekLabels[rule.nthDayOfWeek.dayOfWeek];
          return `Custom: Repeat ${intervalString} on the ${occName} ${dayName}${timeSuffix}`;
        }
        const dom = rule.dayOfMonth ?? 1;
        const domName = dom === -1 ? "last day" : `${dom}${dom === 1 ? "st" : dom === 2 ? "nd" : dom === 3 ? "rd" : "th"}`;
        return `Custom: Repeat ${intervalString} on the ${domName} of the month${timeSuffix}`;
      }

      if (freq === "yearly") {
        const monthNames = rule.months && rule.months.length > 0
          ? rule.months.map(monthIndex => monthLabels[monthIndex - 1]).join(", ")
          : monthLabels[5 - 1];

        if (rule.yearlyType === "nthDayOfWeek" && rule.nthDayOfWeek) {
          const occ = rule.nthDayOfWeek.occurrence;
          const occName = occ === 1 ? "first" : occ === 2 ? "second" : occ === 3 ? "third" : occ === 4 ? "fourth" : "last";
          const dayName = daysOfWeekLabels[rule.nthDayOfWeek.dayOfWeek];
          return `Custom: Repeat ${intervalString} in ${monthNames} on the ${occName} ${dayName}${timeSuffix}`;
        }
        const dom = rule.dayOfMonth ?? 1;
        const domName = dom === -1 ? "last day" : `${dom}${dom === 1 ? "st" : dom === 2 ? "nd" : dom === 3 ? "rd" : "th"}`;
        return `Custom: Repeat ${intervalString} in ${monthNames} on the ${domName}${timeSuffix}`;
      }
    }

    return "Unknown schedule";
  };

  // -- Copy config to clipboard --
  const handleCopyConfig = (task: Task) => {
    setActiveMenuId(null);
    const configString = JSON.stringify(
      {
        id: task.id,
        name: task.name,
        prompt: task.prompt,
        agent: task.agent,
        schedule: formatScheduleText(task),
        provider: task.provider,
        model: task.model,
      },
      null,
      2,
    );

    navigator.clipboard
      .writeText(configString)
      .then(() => {
        showToast("Task configuration copied to clipboard");
      })
      .catch(() => {
        showToast("Failed to copy configuration", "error");
      });
  };

  // -- Sort options for MultiSelectComponent --
  const sortOptions = useMemo(
    () => [
      { value: "name", label: "Name" },
      { value: "scheduleType", label: "Schedule Type" },
      { value: "agent", label: "Agent" },
      { value: "model", label: "Model" },
      { value: "enabled", label: "Status" },
      { value: "createdAt", label: "Created Date" },
    ],
    [],
  );

  // -- Filtered and sorted tasks --
  const filteredTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      const normalizedSearch = searchQuery.toLowerCase();
      return (
        task.name.toLowerCase().includes(normalizedSearch) ||
        task.prompt.toLowerCase().includes(normalizedSearch) ||
        task.model.toLowerCase().includes(normalizedSearch)
      );
    });

    if (activeSortKeys.length === 0) return filtered;

    return [...filtered].sort((taskA, taskB) => {
      for (const sortKey of activeSortKeys) {
        let comparison = 0;

        switch (sortKey) {
          case "name":
            comparison = taskA.name.localeCompare(taskB.name);
            break;
          case "scheduleType":
            comparison = taskA.scheduleType.localeCompare(taskB.scheduleType);
            break;
          case "agent": {
            const agentNameA = taskA.agent || "";
            const agentNameB = taskB.agent || "";
            comparison = agentNameA.localeCompare(agentNameB);
            break;
          }
          case "model":
            comparison = taskA.model.localeCompare(taskB.model);
            break;
          case "enabled":
            comparison = (taskB.enabled ? 1 : 0) - (taskA.enabled ? 1 : 0);
            break;
          case "createdAt":
            comparison =
              new Date(taskB.createdAt).getTime() -
              new Date(taskA.createdAt).getTime();
            break;
        }

        if (comparison !== 0) return comparison;
      }
      return 0;
    });
  }, [tasks, searchQuery, activeSortKeys]);

  const contentBlock = (
          <div className={styles['content']}>
            {/* Sleek toast list */}
            <div className={styles['toast-container']}>
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  className={`${styles['toast']} ${styles[toast.type]}`}
                >
                  <Check size={14} className={styles['toast-icon']} />
                  <span>{toast.message}</span>
                </div>
              ))}
            </div>

            {/* Header */}
            <header className={styles['header']}>
              <div className={styles['header-top-layout-row']}>
                <div className={styles['header-left']}>
                  <div className={styles['header-title-layout-row']}>
                    <Clock className={styles['header-icon']} />
                    <h1 className={styles['header-title']}>Scheduled Tasks</h1>
                  </div>
                  <p className={styles['header-subtitle']}>Automate background agent workflows on a schedule</p>
                </div>
              </div>

              <SearchInputComponent
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search scheduled tasks…"
                className={styles['tasks-search']}
              />

              <div className={styles['header-actions']}>
                <SelectComponent
                  multiple
                  icon={<ArrowUpDown size={12} />}
                  value={activeSortKeys}
                  options={sortOptions}
                  onChange={setActiveSortKeys}
                  allLabel="Default"
                  compact
                />

                <ViewModeToggleComponent
                  mode={viewMode}
                  onChange={setViewMode}
                  modes={[
                    {
                      key: "calendar",
                      icon: CalendarDays,
                      title: "Calendar view",
                    },
                    { key: "card", icon: LayoutGrid, title: "Card view" },
                    { key: "table", icon: List, title: "Table view" },
                  ]}
                />

                <ButtonComponent
                  variant="primary"
                  size="small"
                  icon={Plus}
                  onClick={() => {
                    resetFormFields();
                    setShowNewModal(true);
                  }}
                  title="Create Scheduled Task"
                >
                  New
                </ButtonComponent>
              </div>
            </header>

            {/* Task Content */}
            <div>
              {loading ? (
                <div className={styles['is-loading-state']}>
                  <PanelLoadingSpinner size="large" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className={styles['empty-state']}>
                  <Clock size={48} className={styles['empty-icon']} />
                  <h2>No Scheduled Tasks found</h2>
                  <p>
                    Create a background agent automation task to get started.
                  </p>
                  <ButtonComponent
                    variant="primary"
                    size="small"
                    onClick={() => setShowNewModal(true)}
                  >
                    Create your first task
                  </ButtonComponent>
                </div>
              ) : viewMode === "calendar" ? (
                /* -- Calendar View -- */
                <ScheduledTaskCalendarComponent
                  tasks={filteredTasks}
                  onEventClick={(taskId: string) => {
                    const task = tasks.find((taskItem) => taskItem.id === taskId);
                    if (task) setSelectedTask(task);
                  }}
                />
              ) : viewMode === "table" ? (
                /* -- Table View -- */
                <TableComponent
                  columns={[
                    {
                      key: "name",
                      label: "Name",
                      render: (row: Task) => (
                        <span
                          className={styles['table-name-cell']}
                          onClick={() => setSelectedTask(row)}
                          style={{ cursor: "pointer", textDecoration: "underline" }}
                        >
                          {row.name}
                        </span>
                      ),
                    },
                    {
                      key: "schedule",
                      label: "Schedule",
                      sortable: false,
                      render: (row: Task) => (
                        <span className={styles['table-schedule-cell']}>
                          {formatScheduleText(row)}
                        </span>
                      ),
                    },
                    {
                      key: "agent",
                      label: "Agent",
                      sortable: false,
                      render: (row: Task) => {
                        const taskAgent = agents.find(
                          (agentOption) => agentOption.id === row.agent,
                        );
                        return (
                          <BadgeComponent variant="info" mini>
                            <Bot size={10} />
                            {taskAgent ? taskAgent.name : "Direct Chat"}
                          </BadgeComponent>
                        );
                      },
                    },
                    {
                      key: "model",
                      label: "Model",
                      render: (row: Task) => (
                        <BadgeComponent variant="provider" mini>
                          <Sparkles size={10} />
                          {row.model?.split("/").pop()}
                        </BadgeComponent>
                      ),
                    },
                    {
                      key: "project",
                      label: "Project",
                      render: (row: Task) =>
                        row.project ? (
                          <BadgeComponent variant="info" mini>
                            {row.project}
                          </BadgeComponent>
                        ) : (
                          <span className={styles['table-dash']}>—</span>
                        ),
                    },
                    ...(isAdminMode
                      ? [
                          {
                            key: "username",
                            label: "Owner",
                            render: (row: Task) =>
                              row.username ? (
                                <BadgeComponent variant="info" mini>
                                  {row.username}
                                </BadgeComponent>
                              ) : (
                                <span className={styles['table-dash']}>—</span>
                              ),
                          },
                        ]
                      : []),
                    {
                      key: "enabled",
                      label: "Status",
                      sortValue: (row: Task) => (row.enabled ? 1 : 0),
                      render: (row: Task) => (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTask(row);
                          }}
                          className={`${styles['toggle-switch']} ${styles['toggle-switch-small']} ${row.enabled ? styles['toggle-switch-on'] : ""}`}
                          title={row.enabled ? "Disable task" : "Enable task"}
                        >
                          <span className={styles['toggle-knob']} />
                        </button>
                      ),
                    },
                    {
                      key: "createdAt",
                      label: "Created",
                      sortable: true,
                      align: "right",
                      render: (row: Task) =>
                        row.createdAt ? (
                          <BadgeComponent
                            type="dateTime"
                            date={row.createdAt}
                          />
                        ) : (
                          <span className={styles['table-dash']}>—</span>
                        ),
                    },
                    {
                      key: "actions",
                      label: "",
                      sortable: false,
                      align: "right",
                      render: (row: Task) => {
                        const isMenuOpen = activeMenuId === row.id;
                        const isTriggering = triggeringId === row.id;
                        return (
                          <div className={styles['table-actions-cell']}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTriggerTask(row);
                              }}
                              className={styles['table-action-button']}
                              disabled={isTriggering}
                              title="Trigger task"
                            >
                              {isTriggering ? (
                                <Loader2 size={13} className={styles['spin']} />
                              ) : (
                                <Play size={13} />
                              )}
                            </button>
                            <div className={styles['menu-container']}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isMenuOpen) {
                                    setActiveMenuId(null);
                                    setMenuAnchorPosition(null);
                                  } else {
                                    const buttonRect = e.currentTarget.getBoundingClientRect();
                                    setMenuAnchorPosition({ top: buttonRect.bottom + 4, left: buttonRect.right });
                                    setActiveMenuId(row.id);
                                  }
                                }}
                                className={styles['menu-button']}
                                title="More Actions"
                              >
                                <MoreVertical size={14} />
                              </button>
                              {isMenuOpen && menuAnchorPosition && (
                                <>
                                  <div
                                    className={styles['menu-backdrop']}
                                    onClick={() => { setActiveMenuId(null); setMenuAnchorPosition(null); }}
                                  />
                                  <div className={styles['menu-dropdown']} style={{ position: 'fixed', top: menuAnchorPosition.top, right: document.documentElement.clientWidth - menuAnchorPosition.left, left: 'auto', marginTop: 0 }}>
                                    <button
                                      onClick={() => handleEditTask(row)}
                                    >
                                      <Pencil size={13} />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      onClick={() => handleCopyConfig(row)}
                                    >
                                      <Copy size={13} />
                                      <span>Copy Config</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setConfirmDeleteId(row.id);
                                        setActiveMenuId(null);
                                      }}
                                      className={styles['delete-button-element-text']}
                                    >
                                      <Trash2 size={13} />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      },
                    },
                  ]}
                  data={filteredTasks}
                  getRowKey={(task: Task) => task.id}
                  emptyText="No Scheduled Tasks found"
                  storageKey="scheduled-tasks"
                />
              ) : (
                /* -- Card View -- */
                <div className={styles['grid']}>
                  {filteredTasks.map((task) => {
                    const isMenuOpen = activeMenuId === task.id;
                    const isConfirming = confirmDeleteId === task.id;
                    const isTriggering = triggeringId === task.id;
                    const taskAgent = agents.find((agent) => agent.id === task.agent);

                    return (
                      <div
                        key={task.id}
                        className={`${styles['card']} ${!task.enabled ? styles['disabled-card'] : ""}`}
                        onClick={() => setSelectedTask(task)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className={styles['card-header']}>
                          <div className={styles['card-title-info']}>
                            <h3 className={styles['card-title']}>{task.name}</h3>
                            <p className={styles['card-schedule']}>
                              {formatScheduleText(task)}
                            </p>
                          </div>

                          <div className={styles['card-actions']}>
                            {/* Custom sleek toggle switch */}
                            <button
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                handleToggleTask(task);
                              }}
                              className={`${styles['toggle-switch']} ${task.enabled ? styles['toggle-switch-on'] : ""}`}
                              title={
                                task.enabled ? "Disable task" : "Enable task"
                              }
                            >
                              <span className={styles['toggle-knob']} />
                            </button>

                            <div className={styles['menu-container']}>
                              <button
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  if (isMenuOpen) {
                                    setActiveMenuId(null);
                                    setMenuAnchorPosition(null);
                                  } else {
                                    const buttonRect = clickEvent.currentTarget.getBoundingClientRect();
                                    setMenuAnchorPosition({ top: buttonRect.bottom + 4, left: buttonRect.right });
                                    setActiveMenuId(task.id);
                                  }
                                }}
                                className={styles['menu-button']}
                                title="More Actions"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {/* Menu dropdown */}
                              {isMenuOpen && menuAnchorPosition && (
                                <>
                                  <div
                                    className={styles['menu-backdrop']}
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation();
                                      setActiveMenuId(null);
                                      setMenuAnchorPosition(null);
                                    }}
                                  />
                                  <div
                                    className={styles['menu-dropdown']}
                                    style={{ position: 'fixed', top: menuAnchorPosition.top, right: document.documentElement.clientWidth - menuAnchorPosition.left, left: 'auto', marginTop: 0 }}
                                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                                  >
                                    <button
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation();
                                        handleEditTask(task);
                                      }}
                                    >
                                      <Pencil size={13} />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation();
                                        handleCopyConfig(task);
                                      }}
                                    >
                                      <Copy size={13} />
                                      <span>Copy Config Path</span>
                                    </button>
                                    <button
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation();
                                        handleTriggerTask(task);
                                      }}
                                      disabled={isTriggering}
                                    >
                                      {isTriggering ? (
                                        <Loader2
                                          size={13}
                                          className={styles['spin']}
                                        />
                                      ) : (
                                        <Play size={13} />
                                      )}
                                      <span>Restart Task</span>
                                    </button>
                                    <button
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation();
                                        setConfirmDeleteId(task.id);
                                        setActiveMenuId(null);
                                      }}
                                      className={styles['delete-button-element-text']}
                                    >
                                      <Trash2 size={13} />
                                      <span>Delete Task</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className={styles['card-body']}>
                          <div className={styles['prompt-wrapper']}>
                            <p className={styles['prompt-text']}>{task.prompt}</p>
                          </div>

                          <div className={styles['tags-layout-row']}>
                            <span className={styles['tag']}>
                              <Bot size={11} />
                              <span>
                                {taskAgent ? taskAgent.name : "Direct Chat"}
                              </span>
                            </span>
                            <span
                              className={styles['tag']}
                              title={`${task.provider}/${task.model}`}
                            >
                              <Sparkles size={11} />
                              <span>{task.model.split("/").pop()}</span>
                            </span>
                            {task.project && (
                              <span className={styles['tag']}>
                                <span>{task.project}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Inline Confirm Delete */}
                        {isConfirming && (
                          <div
                            className={styles['confirm-layout-row']}
                            onClick={(clickEvent) => clickEvent.stopPropagation()}
                          >
                            <span>Delete task permanently?</span>
                            <div className={styles['confirm-buttons']}>
                              <button
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  handleDeleteTask(task);
                                }}
                                className={styles['confirm-yes']}
                              >
                                Delete
                              </button>
                              <button
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                                className={styles['confirm-no']}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal for New Agentic Cron — using ModalComponent from components-library */}
            {showNewModal && (
              <ModalComponent
                title={isEditMode ? "Edit Agentic Cron" : "New Agentic Cron"}
                onClose={() => {
                  setShowNewModal(false);
                  resetFormFields();
                }}
                size="md"
                footer={
                  <div className={styles['modal-actions']}>
                    <ButtonComponent
                      variant="disabled"
                      onClick={() => {
                        setShowNewModal(false);
                        resetFormFields();
                      }}
                    >
                      Cancel
                    </ButtonComponent>
                    <ButtonComponent
                      variant="primary"
                      icon={isEditMode ? Pencil : Check}
                      loading={formSubmitting}
                      disabled={formSubmitting}
                      onClick={handleSubmitTask}
                    >
                      {isEditMode ? "Save Changes" : "Add Agentic Cron"}
                    </ButtonComponent>
                  </div>
                }
              >
                <form onSubmit={handleSubmitTask} className={styles['form']}>
                  {/* Task Name */}
                  <FormGroupComponent label="Name">
                    <InputComponent
                      id="task-name"
                      required
                      placeholder="Enter task name"
                      value={formName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setFormName(e.target.value)
                      }
                    />
                  </FormGroupComponent>

                  <div className={styles['form-layout-row']}>
                    {/* Project / Workspace */}
                    <FormGroupComponent label="Project">
                      <SelectComponent
                        value={formProject}
                        onChange={(value: string) => setFormProject(value)}
                        options={workspaces.map((workspace) => ({
                          value: workspace.name,
                          label: workspace.name,
                        }))}
                        placeholder="Select project"
                      />
                    </FormGroupComponent>

                    {/* Agent Persona */}
                    <FormGroupComponent label="Agent">
                      <AgentPickerComponent
                        agents={agents}
                        activeAgentId={formAgent}
                        onSelect={setFormAgent}
                      />
                    </FormGroupComponent>
                  </div>

                  {/* Model Selection */}
                  <FormGroupComponent label="Model">
                    <ModelPickerPopoverComponent
                      config={config}
                      settings={{ provider: formProvider, model: formModel }}
                      onSelectModel={(provider: string, model: string) => {
                        setFormProvider(provider);
                        setFormModel(model);
                      }}
                      favorites={favoriteKeys}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  </FormGroupComponent>

                  {/* Prompt */}
                  <FormGroupComponent label="Prompt">
                    <TextAreaComponent
                      id="task-prompt"
                      required
                      placeholder="Enter a prompt for the agent..."
                      value={formPrompt}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setFormPrompt(e.target.value)
                      }
                      minRows={4}
                      maxRows={10}
                    />
                  </FormGroupComponent>

                  {/* Schedule Selector */}
                  <div className={styles['schedule-builder']}>
                    <FormGroupComponent label="Schedule">
                      <SelectComponent
                        value={formScheduleType}
                        onChange={(value: string) =>
                          setFormScheduleType(value as typeof formScheduleType)
                        }
                        options={[
                          { value: "once", label: "One-time" },
                          { value: "hourly", label: "Hourly" },
                          { value: "daily", label: "Daily" },
                          { value: "weekly", label: "Weekly" },
                          { value: "cron", label: "Cron Expression" },
                          { value: "custom", label: "Custom Recurrence" },
                          {
                            value: "trigger",
                            label: "Trigger (Manual / Remote)",
                          },
                        ]}
                      />
                    </FormGroupComponent>

                    {/* Time picker for daily */}
                    {formScheduleType === "daily" && (
                      <div className={styles['time-picker-layout-row']}>
                        <span className={styles['picker-label']}>around</span>
                        <SelectComponent
                          value={formTimeHour}
                          onChange={(value: string) => setFormTimeHour(value)}
                          options={Array.from({ length: 12 }, (_, i) => {
                            const formattedHour = String(
                              i === 0 ? 12 : i,
                            ).padStart(2, "0");
                            return {
                              value: formattedHour,
                              label: formattedHour,
                            };
                          })}
                        />
                        <span className={styles['time-colon']}>:</span>
                        <SelectComponent
                          value={formTimeMinute}
                          onChange={(value: string) => setFormTimeMinute(value)}
                          options={["00", "15", "30", "45"].map((minuteOption) => ({
                            value: minuteOption,
                            label: minuteOption,
                          }))}
                        />
                        <SelectComponent
                          value={formTimeAmpm}
                          onChange={(value: string) => setFormTimeAmpm(value)}
                          options={[
                            { value: "AM", label: "AM" },
                            { value: "PM", label: "PM" },
                          ]}
                        />
                      </div>
                    )}

                    {/* Day + time picker for weekly */}
                    {formScheduleType === "weekly" && (
                      <div className={styles['weekly-picker-layout-row']}>
                        <SelectComponent
                          value={String(formWeeklyDay)}
                          onChange={(value: string) =>
                            setFormWeeklyDay(Number(value))
                          }
                          options={[
                            { value: "0", label: "Sunday" },
                            { value: "1", label: "Monday" },
                            { value: "2", label: "Tuesday" },
                            { value: "3", label: "Wednesday" },
                            { value: "4", label: "Thursday" },
                            { value: "5", label: "Friday" },
                            { value: "6", label: "Saturday" },
                          ]}
                        />
                        <span className={styles['picker-label']}>around</span>
                        <SelectComponent
                          value={formTimeHour}
                          onChange={(value: string) => setFormTimeHour(value)}
                          options={Array.from({ length: 12 }, (_, i) => {
                            const formattedHour = String(
                              i === 0 ? 12 : i,
                            ).padStart(2, "0");
                            return {
                              value: formattedHour,
                              label: formattedHour,
                            };
                          })}
                        />
                        <span className={styles['time-colon']}>:</span>
                        <SelectComponent
                          value={formTimeMinute}
                          onChange={(value: string) => setFormTimeMinute(value)}
                          options={["00", "15", "30", "45"].map((minuteOption) => ({
                            value: minuteOption,
                            label: minuteOption,
                          }))}
                        />
                        <SelectComponent
                          value={formTimeAmpm}
                          onChange={(value: string) => setFormTimeAmpm(value)}
                          options={[
                            { value: "AM", label: "AM" },
                            { value: "PM", label: "PM" },
                          ]}
                        />
                      </div>
                    )}

                    {/* Date + time picker for once */}
                    {formScheduleType === "once" && (
                      <div className={styles['weekly-picker-layout-row']}>
                        <InputComponent
                          type="date"
                          value={formOnceDate}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setFormOnceDate(e.target.value)
                          }
                        />
                        <span className={styles['picker-label']}>around</span>
                        <SelectComponent
                          value={formTimeHour}
                          onChange={(value: string) => setFormTimeHour(value)}
                          options={Array.from({ length: 12 }, (_, i) => {
                            const formattedHour = String(
                              i === 0 ? 12 : i,
                            ).padStart(2, "0");
                            return {
                              value: formattedHour,
                              label: formattedHour,
                            };
                          })}
                        />
                        <span className={styles['time-colon']}>:</span>
                        <SelectComponent
                          value={formTimeMinute}
                          onChange={(value: string) => setFormTimeMinute(value)}
                          options={["00", "15", "30", "45"].map((minuteOption) => ({
                            value: minuteOption,
                            label: minuteOption,
                          }))}
                        />
                        <SelectComponent
                          value={formTimeAmpm}
                          onChange={(value: string) => setFormTimeAmpm(value)}
                          options={[
                            { value: "AM", label: "AM" },
                            { value: "PM", label: "PM" },
                          ]}
                        />
                      </div>
                    )}

                    {/* Cron expression input */}
                    {formScheduleType === "cron" && (
                      <FormGroupComponent label="Cron Expression">
                        <InputComponent
                          id="task-cron"
                          required
                          placeholder="* * * * *"
                          value={formCron}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setFormCron(e.target.value)
                          }
                        />
                      </FormGroupComponent>
                    )}

                    {/* Custom recurrence visual builder panel */}
                    {formScheduleType === "custom" && (
                      <div className={styles['custom-recurrence-panel']}>
                        <div className={styles['recurrence-layout-row']}>
                          <span className={styles['recurrence-text']}>Repeat every</span>
                          <InputComponent
                            type="number"
                            min={1}
                            value={String(formCustomInterval)}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormCustomInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className={styles['recurrence-input']}
                          />
                          <SelectComponent
                            value={formCustomFrequency}
                            onChange={(value: string) => setFormCustomFrequency(value as "daily" | "weekly" | "monthly" | "yearly")}
                            options={[
                              { value: "daily", label: "Day(s)" },
                              { value: "weekly", label: "Week(s)" },
                              { value: "monthly", label: "Month(s)" },
                              { value: "yearly", label: "Year(s)" },
                            ]}
                          />
                          <span className={styles['recurrence-text']}>around</span>
                          <SelectComponent
                            value={formTimeHour}
                            onChange={(value: string) => setFormTimeHour(value)}
                            options={Array.from({ length: 12 }, (_, i) => {
                              const formattedHour = String(i === 0 ? 12 : i).padStart(2, "0");
                              return { value: formattedHour, label: formattedHour };
                            })}
                          />
                          <span className={styles['time-colon']}>:</span>
                          <SelectComponent
                            value={formTimeMinute}
                            onChange={(value: string) => setFormTimeMinute(value)}
                            options={["00", "15", "30", "45"].map((minuteOption) => ({ value: minuteOption, label: minuteOption }))}
                          />
                          <SelectComponent
                            value={formTimeAmpm}
                            onChange={(value: string) => setFormTimeAmpm(value)}
                            options={[
                              { value: "AM", label: "AM" },
                              { value: "PM", label: "PM" },
                            ]}
                          />
                        </div>

                        {formCustomFrequency === "weekly" && (
                          <div className={styles['weekday-picker-panel']}>
                            <span className={styles['recurrence-sublabel']}>On days:</span>
                            <div className={styles['weekday-buttons-grid']}>
                              {["S", "M", "T", "W", "T", "F", "S"].map((label, dayIndex) => {
                                const isSelected = formCustomWeekdays.includes(dayIndex);
                                return (
                                  <button
                                    key={dayIndex}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setFormCustomWeekdays(previousWeekdays => previousWeekdays.filter(dayItem => dayItem !== dayIndex));
                                      } else {
                                        setFormCustomWeekdays(previousWeekdays => [...previousWeekdays, dayIndex].sort());
                                      }
                                    }}
                                    className={`${styles['weekday-badge-button']} ${isSelected ? styles['weekday-badge-is-active-state'] : ""}`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {formCustomFrequency === "monthly" && (
                          <div>
                            <div className={styles['recurrence-subrow']}>
                              <input
                                type="radio"
                                id="monthly-type-day"
                                name="monthly-type"
                                checked={formCustomMonthlyType === "dayOfMonth"}
                                onChange={() => setFormCustomMonthlyType("dayOfMonth")}
                              />
                              <label htmlFor="monthly-type-day" className={styles['radio-label']}>
                                On the
                                <SelectComponent
                                  value={String(formCustomDayOfMonth)}
                                  onChange={(value: string) => setFormCustomDayOfMonth(Number(value))}
                                  options={[
                                    { value: "-1", label: "last day" },
                                    ...Array.from({ length: 31 }, (_, i) => ({
                                      value: String(i + 1),
                                      label: `${i + 1}${i + 1 === 1 ? "st" : i + 1 === 2 ? "nd" : i + 1 === 3 ? "rd" : "th"}`
                                    }))
                                  ]}
                                  disabled={formCustomMonthlyType !== "dayOfMonth"}
                                />
                                of the month
                              </label>
                            </div>

                            <div className={styles['recurrence-subrow']}>
                              <input
                                type="radio"
                                id="monthly-type-nth"
                                name="monthly-type"
                                checked={formCustomMonthlyType === "nthDayOfWeek"}
                                onChange={() => setFormCustomMonthlyType("nthDayOfWeek")}
                              />
                              <label htmlFor="monthly-type-nth" className={styles['radio-label']}>
                                On the
                                <SelectComponent
                                  value={String(formCustomNthDayOccurrence)}
                                  onChange={(value: string) => setFormCustomNthDayOccurrence(Number(value) as 1 | 2 | 3 | 4 | -1)}
                                  options={[
                                    { value: "1", label: "first" },
                                    { value: "2", label: "second" },
                                    { value: "3", label: "third" },
                                    { value: "4", label: "fourth" },
                                    { value: "-1", label: "last" },
                                  ]}
                                  disabled={formCustomMonthlyType !== "nthDayOfWeek"}
                                />
                                <SelectComponent
                                  value={String(formCustomNthDayOfWeek)}
                                  onChange={(value: string) => setFormCustomNthDayOfWeek(Number(value))}
                                  options={[
                                    { value: "0", label: "Sunday" },
                                    { value: "1", label: "Monday" },
                                    { value: "2", label: "Tuesday" },
                                    { value: "3", label: "Wednesday" },
                                    { value: "4", label: "Thursday" },
                                    { value: "5", label: "Friday" },
                                    { value: "6", label: "Saturday" },
                                  ]}
                                  disabled={formCustomMonthlyType !== "nthDayOfWeek"}
                                />
                                of the month
                              </label>
                            </div>
                          </div>
                        )}

                        {formCustomFrequency === "yearly" && (
                          <div className={styles['yearly-picker-panel']}>
                            <span className={styles['recurrence-sublabel']}>In months:</span>
                            <div className={styles['months-grid']}>
                              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, monthIndex) => {
                                const monthOneIndexed = monthIndex + 1;
                                const isSelected = formCustomMonths.includes(monthOneIndexed);
                                return (
                                  <button
                                    key={monthIndex}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setFormCustomMonths(previousMonths => previousMonths.filter(monthItem => monthItem !== monthOneIndexed));
                                      } else {
                                        setFormCustomMonths(previousMonths => [...previousMonths, monthOneIndexed].sort());
                                      }
                                    }}
                                    className={`${styles['month-badge-button']} ${isSelected ? styles['month-badge-is-active-state'] : ""}`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>

                            <div className={styles['recurrence-subrow']}>
                              <input
                                type="radio"
                                id="yearly-type-day"
                                name="yearly-type"
                                checked={formCustomYearlyType === "specificDate"}
                                onChange={() => setFormCustomYearlyType("specificDate")}
                              />
                              <label htmlFor="yearly-type-day" className={styles['radio-label']}>
                                On the
                                <SelectComponent
                                  value={String(formCustomDayOfMonth)}
                                  onChange={(value: string) => setFormCustomDayOfMonth(Number(value))}
                                  options={[
                                    { value: "-1", label: "last day" },
                                    ...Array.from({ length: 31 }, (_, i) => ({
                                      value: String(i + 1),
                                      label: `${i + 1}${i + 1 === 1 ? "st" : i + 1 === 2 ? "nd" : i + 1 === 3 ? "rd" : "th"}`
                                    }))
                                  ]}
                                  disabled={formCustomYearlyType !== "specificDate"}
                                />
                                of those months
                              </label>
                            </div>

                            <div className={styles['recurrence-subrow']}>
                              <input
                                type="radio"
                                id="yearly-type-nth"
                                name="yearly-type"
                                checked={formCustomYearlyType === "nthDayOfWeek"}
                                onChange={() => setFormCustomYearlyType("nthDayOfWeek")}
                              />
                              <label htmlFor="yearly-type-nth" className={styles['radio-label']}>
                                On the
                                <SelectComponent
                                  value={String(formCustomNthDayOccurrence)}
                                  onChange={(value: string) => setFormCustomNthDayOccurrence(Number(value) as 1 | 2 | 3 | 4 | -1)}
                                  options={[
                                    { value: "1", label: "first" },
                                    { value: "2", label: "second" },
                                    { value: "3", label: "third" },
                                    { value: "4", label: "fourth" },
                                    { value: "-1", label: "last" },
                                  ]}
                                  disabled={formCustomYearlyType !== "nthDayOfWeek"}
                                />
                                <SelectComponent
                                  value={String(formCustomNthDayOfWeek)}
                                  onChange={(value: string) => setFormCustomNthDayOfWeek(Number(value))}
                                  options={[
                                    { value: "0", label: "Sunday" },
                                    { value: "1", label: "Monday" },
                                    { value: "2", label: "Tuesday" },
                                    { value: "3", label: "Wednesday" },
                                    { value: "4", label: "Thursday" },
                                    { value: "5", label: "Friday" },
                                    { value: "6", label: "Saturday" },
                                  ]}
                                  disabled={formCustomYearlyType !== "nthDayOfWeek"}
                                />
                                of those months
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </form>
              </ModalComponent>
            )}

            {selectedTask && (
              <CronJobDetailPanel
                task={selectedTask}
                onClose={() => setSelectedTask(null)}
                onTrigger={handleTriggerTask}
                onDelete={handleDeleteTask}
                onToggle={handleToggleTask}
                onEdit={handleEditTask}
                agentName={
                  agents.find((agent) => agent.id === selectedTask.agent)?.name ||
                  "Direct Chat"
                }
                formatScheduleText={formatScheduleText}
                allToolNames={allToolNames}
              />
            )}
          </div>
  );

  if (isAdminMode) {
    return contentBlock;
  }

  return (
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />

      <div className={styles["layout-page-column"]}>
        <LayoutHeaderComponent title="Scheduled Tasks" />
        <div className={styles["page-content-area"]}>
          {contentBlock}
        </div>
      </div>
    </div>
  );
}

export default function ScheduledTasksPageWrapper() {
  return <ScheduledTasksPage mode="user" />;
}
