"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Play,
  Check,
  Loader2,
  X,
  ChevronDown,
  Bot,
  Sparkles,
  Copy,
  AlertCircle,
} from "lucide-react";
import PrismService from "../../services/PrismService";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
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
  scheduleType: "hourly" | "daily" | "weekly" | "cron" | "trigger";
  scheduleTime?: string;
  scheduleDay?: number;
  cronExpression?: string;
  enabled: boolean;
  lastRunMinute?: string;
  createdAt: string;
  updatedAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export default function ScheduledTasksPage() {
  const router = useRouter();

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [modelsMap, setModelsMap] = useState<Record<string, Model[]>>({});
  const [providers, setProviders] = useState<string[]>([]);
  
  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // New task form state
  const [formName, setFormName] = useState("");
  const [formProject, setFormProject] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formAgent, setFormAgent] = useState("CODING");
  const [formProvider, setFormProvider] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<"hourly" | "daily" | "weekly" | "cron" | "trigger">("daily");
  const [formTimeHour, setFormTimeHour] = useState("09");
  const [formTimeMinute, setFormTimeMinute] = useState("00");
  const [formTimeAmpm, setFormTimeAmpm] = useState("AM");
  const [formWeeklyDay, setFormWeeklyDay] = useState(1); // Monday
  const [formCron, setFormCron] = useState("0 9 * * *");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // -- Show Toast Helper --
  const showToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // -- Fetch all data --
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch tasks
      const fetchedTasks = await PrismService.getScheduledTasks();
      setTasks(fetchedTasks as Task[]);

      // 2. Fetch workspaces
      const fetchedWorkspaces = await PrismService._request<Workspace[]>("/workspaces", { method: "GET" });
      setWorkspaces(fetchedWorkspaces);
      if (fetchedWorkspaces.length > 0) {
        setFormProject(fetchedWorkspaces[0].name);
      }

      // 3. Fetch agent personas
      const fetchedAgents = await PrismService.getAgentPersonas();
      setAgents(fetchedAgents);

      // 4. Fetch config for providers and models
      const config = await PrismService.getConfig();
      const textModelsMap = config.textToText?.models || {};
      
      // Filter models: show all for direct, or only tool calling models
      const cleanModelsMap: Record<string, Model[]> = {};
      const activeProviders: string[] = [];

      for (const [provider, modelOpts] of Object.entries(textModelsMap as Record<string, any[]>)) {
        if (modelOpts.length > 0) {
          cleanModelsMap[provider] = modelOpts.map((m) => ({
            name: m.name,
            displayName: m.displayName || m.name,
            tools: m.tools || [],
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

    } catch (err: unknown) {
      console.error(err);
      showToast("Failed to load initial data", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -- Form side-effects --
  useEffect(() => {
    if (formProvider && modelsMap[formProvider]?.length > 0) {
      setFormModel(modelsMap[formProvider][0].name);
    }
  }, [formProvider, modelsMap]);

  // -- Handle task toggle enablement --
  const handleToggleTask = async (task: Task) => {
    const nextVal = !task.enabled;
    try {
      const updated = await PrismService.updateScheduledTask(task.id, { enabled: nextVal });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, enabled: updated.enabled } : t)));
      showToast(`Task "${task.name}" is now ${nextVal ? "enabled" : "disabled"}`);
    } catch (err) {
      console.error(err);
      showToast("Failed to toggle task state", "error");
    }
  };

  // -- Handle manual run trigger --
  const handleTriggerTask = async (task: Task) => {
    setActiveMenuId(null);
    setTriggeringId(task.id);
    try {
      const res = await PrismService.triggerScheduledTask(task.id);
      showToast(`Task successfully triggered. Session ID: ${res.agentSessionId.slice(0, 8)}…`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to trigger task", "error");
    } finally {
      setTriggeringId(null);
    }
  };

  // -- Handle task deletion --
  const handleDeleteTask = async (task: Task) => {
    try {
      await PrismService.deleteScheduledTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      showToast(`Deleted task "${task.name}"`);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error(err);
      showToast("Failed to delete task", "error");
    }
  };

  // -- Handle task creation submit --
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrompt.trim() || !formProvider || !formModel) {
      showToast("Please fill all required fields", "error");
      return;
    }

    setFormSubmitting(true);

    // Calculate time format
    let scheduleTime = "";
    if (formScheduleType === "daily" || formScheduleType === "weekly") {
      let h = parseInt(formTimeHour, 10);
      if (formTimeAmpm === "PM" && h < 12) h += 12;
      if (formTimeAmpm === "AM" && h === 12) h = 0;
      scheduleTime = `${String(h).padStart(2, "0")}:${formTimeMinute}`;
    }

    try {
      const created = await PrismService.createScheduledTask({
        name: formName.trim(),
        prompt: formPrompt.trim(),
        agent: formAgent === "NONE" ? null : formAgent,
        provider: formProvider,
        model: formModel,
        scheduleType: formScheduleType,
        scheduleTime: scheduleTime || undefined,
        scheduleDay: formScheduleType === "weekly" ? formWeeklyDay : undefined,
        cronExpression: formScheduleType === "cron" ? formCron.trim() : undefined,
      });

      setTasks((prev) => [created, ...prev]);
      showToast(`Scheduled Task "${formName}" created successfully!`);
      setShowNewModal(false);

      // Reset form fields
      setFormName("");
      setFormPrompt("");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to create task", "error");
    } finally {
      setFormSubmitting(false);
    }
  };

  // -- Format schedule text --
  const formatScheduleText = (task: Task) => {
    if (task.scheduleType === "hourly") return "Hourly";
    
    const formatTime = (timeStr?: string) => {
      if (!timeStr) return "";
      const [h, m] = timeStr.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const displayHour = h % 12 || 12;
      const displayMin = String(m).padStart(2, "0");
      return `${displayHour}:${displayMin} ${ampm}`;
    };

    if (task.scheduleType === "daily") {
      return `Daily around ${formatTime(task.scheduleTime)}`;
    }

    if (task.scheduleType === "weekly") {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = days[task.scheduleDay ?? 1] || "Monday";
      return `Weekly on ${dayName} around ${formatTime(task.scheduleTime)}`;
    }

    if (task.scheduleType === "cron") {
      return `Cron expression: ${task.cronExpression || "* * * * *"}`;
    }

    if (task.scheduleType === "trigger") {
      return "Manual / Remote Trigger";
    }

    return "Unknown schedule";
  };

  // -- Copy config to clipboard --
  const handleCopyConfig = (task: Task) => {
    setActiveMenuId(null);
    const configString = JSON.stringify({
      id: task.id,
      name: task.name,
      prompt: task.prompt,
      agent: task.agent,
      schedule: formatScheduleText(task),
      provider: task.provider,
      model: task.model,
    }, null, 2);

    navigator.clipboard.writeText(configString).then(() => {
      showToast("Task configuration copied to clipboard");
    }).catch(() => {
      showToast("Failed to copy configuration", "error");
    });
  };

  // -- Filtered tasks based on search query --
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q)
      );
    });
  }, [tasks, searchQuery]);

  return (
    <div className={styles.container}>
      <NavigationSidebarComponent mode="user" />
      
      <div className={styles.page}>
        {/* Sleek toast list */}
        <div className={styles.toastContainer}>
          {toasts.map((toast) => (
            <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
              <Check size={14} className={styles.toastIcon} />
              <span>{toast.message}</span>
            </div>
          ))}
        </div>

        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerTitleRow}>
            <Clock className={styles.headerIcon} />
            <h1 className={styles.headerTitle}>Scheduled Tasks</h1>
            <span className={styles.badge}>{filteredTasks.length} total</span>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.searchWrapper}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search tasks…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <button
              onClick={() => setShowNewModal(true)}
              className={styles.newBtn}
              title="Create Scheduled Task"
            >
              <Plus size={16} />
              <span>New</span>
            </button>
          </div>
        </header>

        {/* Task Cards Grid */}
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={32} className={styles.spin} />
              <p>Loading scheduled tasks…</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className={styles.emptyState}>
              <Clock size={48} className={styles.emptyIcon} />
              <h2>No scheduled tasks found</h2>
              <p>Create a background agent automation task to get started.</p>
              <button
                onClick={() => setShowNewModal(true)}
                className={styles.emptyBtn}
              >
                Create your first task
              </button>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredTasks.map((task) => {
                const isMenuOpen = activeMenuId === task.id;
                const isConfirming = confirmDeleteId === task.id;
                const isTriggering = triggeringId === task.id;
                const taskAgent = agents.find((a) => a.id === task.agent);

                return (
                  <div
                    key={task.id}
                    className={`${styles.card} ${!task.enabled ? styles.disabledCard : ""}`}
                  >
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleInfo}>
                        <h3 className={styles.cardTitle}>{task.name}</h3>
                        <p className={styles.cardSchedule}>
                          {formatScheduleText(task)}
                        </p>
                      </div>

                      <div className={styles.cardActions}>
                        {/* Custom sleek toggle switch */}
                        <button
                          onClick={() => handleToggleTask(task)}
                          className={`${styles.toggleSwitch} ${task.enabled ? styles.toggleSwitchOn : ""}`}
                          title={task.enabled ? "Disable task" : "Enable task"}
                        >
                          <span className={styles.toggleKnob} />
                        </button>

                        <div className={styles.menuContainer}>
                          <button
                            onClick={() => setActiveMenuId(isMenuOpen ? null : task.id)}
                            className={styles.menuBtn}
                            title="More Actions"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {/* Menu dropdown */}
                          {isMenuOpen && (
                            <>
                              <div
                                className={styles.menuBackdrop}
                                onClick={() => setActiveMenuId(null)}
                              />
                              <div className={styles.menuDropdown}>
                                <button onClick={() => handleCopyConfig(task)}>
                                  <Copy size={13} />
                                  <span>Copy Config Path</span>
                                </button>
                                <button
                                  onClick={() => handleTriggerTask(task)}
                                  disabled={isTriggering}
                                >
                                  {isTriggering ? (
                                    <Loader2 size={13} className={styles.spin} />
                                  ) : (
                                    <Play size={13} />
                                  )}
                                  <span>Restart Task</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setConfirmDeleteId(task.id);
                                    setActiveMenuId(null);
                                  }}
                                  className={styles.deleteBtnText}
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

                    <div className={styles.cardBody}>
                      <div className={styles.promptWrapper}>
                        <p className={styles.promptText}>{task.prompt}</p>
                      </div>

                      <div className={styles.tagsRow}>
                        <span className={styles.tag}>
                          <Bot size={11} />
                          <span>{taskAgent ? taskAgent.name : "Direct Chat"}</span>
                        </span>
                        <span className={styles.tag} title={`${task.provider}/${task.model}`}>
                          <Sparkles size={11} />
                          <span>{task.model.split("/").pop()}</span>
                        </span>
                        {task.project && (
                          <span className={styles.tag}>
                            <span>{task.project}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Inline Confirm Delete */}
                    {isConfirming && (
                      <div className={styles.confirmRow}>
                        <span>Delete task permanently?</span>
                        <div className={styles.confirmButtons}>
                          <button
                            onClick={() => handleDeleteTask(task)}
                            className={styles.confirmYes}
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className={styles.confirmNo}
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

        {/* Creative Glass Modal for New Scheduled Task */}
        {showNewModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalBackdrop} onClick={() => setShowNewModal(false)} />
            
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h2>New Scheduled Task</h2>
                <button
                  onClick={() => setShowNewModal(false)}
                  className={styles.modalClose}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitTask} className={styles.form}>
                {/* Task Name */}
                <div className={styles.formGroup}>
                  <label htmlFor="taskName">Name</label>
                  <input
                    id="taskName"
                    type="text"
                    required
                    placeholder="Enter task name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formRow}>
                  {/* Project / Workspace */}
                  <div className={styles.formGroup}>
                    <label htmlFor="taskProject">Project</label>
                    <select
                      id="taskProject"
                      value={formProject}
                      onChange={(e) => setFormProject(e.target.value)}
                      className={styles.formSelect}
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.name}>
                          📁 {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Agent Persona */}
                  <div className={styles.formGroup}>
                    <label htmlFor="taskAgent">Agent</label>
                    <select
                      id="taskAgent"
                      value={formAgent}
                      onChange={(e) => setFormAgent(e.target.value)}
                      className={styles.formSelect}
                    >
                      <option value="NONE">Direct Model (No Agent)</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          🤖 {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.formRow}>
                  {/* Model Provider */}
                  <div className={styles.formGroup}>
                    <label htmlFor="taskProvider">Provider</label>
                    <select
                      id="taskProvider"
                      value={formProvider}
                      onChange={(e) => setFormProvider(e.target.value)}
                      className={styles.formSelect}
                    >
                      {providers.map((p) => (
                        <option key={p} value={p}>
                          {p.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Model Selection */}
                  <div className={styles.formGroup}>
                    <label htmlFor="taskModel">Model</label>
                    <select
                      id="taskModel"
                      value={formModel}
                      onChange={(e) => setFormModel(e.target.value)}
                      className={styles.formSelect}
                    >
                      {(modelsMap[formProvider] || []).map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Prompt */}
                <div className={styles.formGroup}>
                  <label htmlFor="taskPrompt">Prompt</label>
                  <textarea
                    id="taskPrompt"
                    required
                    placeholder="Enter a prompt for the agent..."
                    value={formPrompt}
                    onChange={(e) => setFormPrompt(e.target.value)}
                    className={styles.formTextarea}
                    rows={4}
                  />
                </div>

                {/* Schedule Selector */}
                <div className={styles.scheduleBuilder}>
                  <div className={styles.formGroup}>
                    <label htmlFor="taskScheduleType">Schedule</label>
                    <select
                      id="taskScheduleType"
                      value={formScheduleType}
                      onChange={(e) => setFormScheduleType(e.target.value as any)}
                      className={styles.formSelect}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="cron">Cron Expression</option>
                      <option value="trigger">Trigger (Manual / Remote)</option>
                    </select>
                  </div>

                  {/* Custom Schedule Details based on type */}
                  {formScheduleType === "daily" && (
                    <div className={styles.timePickerRow}>
                      <span className={styles.pickerLabel}>around</span>
                      <select
                        value={formTimeHour}
                        onChange={(e) => setFormTimeHour(e.target.value)}
                        className={styles.timeSelect}
                      >
                        {Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i).padStart(2, "0")).map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <span className={styles.timeColon}>:</span>
                      <select
                        value={formTimeMinute}
                        onChange={(e) => setFormTimeMinute(e.target.value)}
                        className={styles.timeSelect}
                      >
                        {["00", "15", "30", "45"].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={formTimeAmpm}
                        onChange={(e) => setFormTimeAmpm(e.target.value)}
                        className={styles.timeSelect}
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  )}

                  {formScheduleType === "weekly" && (
                    <div className={styles.weeklyPickerRow}>
                      <select
                        value={formWeeklyDay}
                        onChange={(e) => setFormWeeklyDay(Number(e.target.value))}
                        className={styles.formSelect}
                      >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>
                      <span className={styles.pickerLabel}>around</span>
                      <select
                        value={formTimeHour}
                        onChange={(e) => setFormTimeHour(e.target.value)}
                        className={styles.timeSelect}
                      >
                        {Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i).padStart(2, "0")).map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <span className={styles.timeColon}>:</span>
                      <select
                        value={formTimeMinute}
                        onChange={(e) => setFormTimeMinute(e.target.value)}
                        className={styles.timeSelect}
                      >
                        {["00", "15", "30", "45"].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={formTimeAmpm}
                        onChange={(e) => setFormTimeAmpm(e.target.value)}
                        className={styles.timeSelect}
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  )}

                  {formScheduleType === "cron" && (
                    <div className={styles.formGroup}>
                      <label htmlFor="taskCron">Cron Expression</label>
                      <input
                        id="taskCron"
                        type="text"
                        required
                        placeholder="* * * * *"
                        value={formCron}
                        onChange={(e) => setFormCron(e.target.value)}
                        className={styles.formInput}
                      />
                    </div>
                  )}
                </div>

                {/* Submit Actions */}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className={styles.submitBtn}
                  >
                    {formSubmitting ? (
                      <Loader2 size={14} className={styles.spin} />
                    ) : (
                      <Check size={14} />
                    )}
                    <span>Add Scheduled Task</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
