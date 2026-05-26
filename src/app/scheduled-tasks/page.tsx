"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";

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
  Bot,
  Sparkles,
  Copy,
  LayoutGrid,
  List,
} from "lucide-react";
import PrismService from "../../services/PrismService";
import NavigationSidebarComponent from "../../components/NavigationSidebarComponent";
import {
  ModalComponent,
  SelectComponent,
  InputComponent,
  TextAreaComponent,
  FormGroupComponent,
  ButtonComponent,
  TableComponent,
  BadgeComponent,
} from "@rodrigo-barraza/components-library";
import { AgentPersona, PrismConfig } from "../../types/types";
import AgentPickerComponent from "../../components/AgentPickerComponent";
import ModelPickerPopoverComponent from "../../components/ModelPickerPopoverComponent";
import { ViewModeToggleComponent } from "../../components/FilterBarComponent";
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
  scheduleType: "hourly" | "daily" | "weekly" | "cron" | "trigger" | "once";
  scheduleTime?: string;
  scheduleDay?: number;
  scheduleDate?: string;
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

const NONE_AGENT = {
  id: "NONE",
  name: "No Agent",
  description: "Direct model conversations with no agentic loop.",
  project: "direct",
  toolCount: -1,
  custom: false,
  icon: "",
  color: "",
};

export default function ScheduledTasksPage() {


  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [modelsMap, setModelsMap] = useState<Record<string, Model[]>>({});
  const [providers, setProviders] = useState<string[]>([]);
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  
  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewMode, setViewMode] = useState("card");

  // New task form state
  const [formName, setFormName] = useState("");
  const [formProject, setFormProject] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formAgent, setFormAgent] = useState("CODING");
  const [formProvider, setFormProvider] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<"hourly" | "daily" | "weekly" | "cron" | "trigger" | "once">("daily");
  const [formTimeHour, setFormTimeHour] = useState("09");
  const [formTimeMinute, setFormTimeMinute] = useState("00");
  const [formTimeAmpm, setFormTimeAmpm] = useState("AM");
  const [formWeeklyDay, setFormWeeklyDay] = useState(1); // Monday
  const [formCron, setFormCron] = useState("0 9 * * *");
  const [formOnceDate, setFormOnceDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
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
      setAgents([NONE_AGENT, ...fetchedAgents]);

      // 4. Fetch config for providers and models
      const config = await PrismService.getConfig();
      setConfig(config);
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

      // 5. Fetch favorites
      try {
        const favs = await PrismService.getFavorites("model");
        setFavoriteKeys(favs.map((f) => f.key as string));
      } catch (err) {
        console.error("Failed to load favorite models", err);
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

  // -- Favorites -------------------------------------------------
  const handleToggleFavorite = useCallback(
    async (key: string) => {
      if (favoriteKeys.includes(key)) {
        setFavoriteKeys((prev) => prev.filter((k) => k !== key));
        try {
          await PrismService.removeFavorite("model", key);
        } catch {}
      } else {
        setFavoriteKeys((prev) => [...prev, key]);
        try {
          await PrismService.addFavorite("model", key, { type: "model" });
        } catch {}
      }
    },
    [favoriteKeys]
  );

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
  const handleSubmitTask = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPrompt.trim() || !formProvider || !formModel) {
      showToast("Please fill all required fields", "error");
      return;
    }

    setFormSubmitting(true);

    // Calculate time format
    let scheduleTime = "";
    if (formScheduleType === "daily" || formScheduleType === "weekly" || formScheduleType === "once") {
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
        scheduleDate: formScheduleType === "once" ? formOnceDate : undefined,
        cronExpression: formScheduleType === "cron" ? formCron.trim() : undefined,
      });

      setTasks((prev) => [created, ...prev]);
      showToast(`Agentic Cron "${formName}" created successfully!`);
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

    if (task.scheduleType === "once") {
      return `One-time on ${task.scheduleDate || ""} around ${formatTime(task.scheduleTime)}`;
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
    <div className="page-wrapper">
      <NavigationSidebarComponent mode="user" />
      
      <div className={styles.page}>
        <div className={styles.content}>
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

            <ViewModeToggleComponent
              mode={viewMode}
              onChange={setViewMode}
              modes={[
                { key: "card", icon: LayoutGrid, title: "Card view" },
                { key: "table", icon: List, title: "Table view" },
              ]}
            />

            <button
              onClick={() => setShowNewModal(true)}
              className={styles.newBtn}
              title="Create Agentic Cron"
            >
              <Plus size={16} />
              <span>New</span>
            </button>
          </div>
        </header>

        {/* Task Content */}
        <div>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={32} className={styles.spin} />
              <p>Loading Scheduled Tasks…</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className={styles.emptyState}>
              <Clock size={48} className={styles.emptyIcon} />
              <h2>No Scheduled Tasks found</h2>
              <p>Create a background agent automation task to get started.</p>
              <button
                onClick={() => setShowNewModal(true)}
                className={styles.emptyBtn}
              >
                Create your first task
              </button>
            </div>
          ) : viewMode === "table" ? (
            /* ── Table View ── */
            <TableComponent
              columns={[
                {
                  key: "name",
                  label: "Name",
                  render: (row: any) => (
                    <span className={styles.tableNameCell}>{row.name}</span>
                  ),
                },
                {
                  key: "schedule",
                  label: "Schedule",
                  sortable: false,
                  render: (row: any) => (
                    <span className={styles.tableScheduleCell}>{formatScheduleText(row)}</span>
                  ),
                },
                {
                  key: "agent",
                  label: "Agent",
                  sortable: false,
                  render: (row: any) => {
                    const taskAgent = agents.find((a) => a.id === row.agent);
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
                  render: (row: any) => (
                    <BadgeComponent variant="provider" mini>
                      <Sparkles size={10} />
                      {row.model?.split("/").pop()}
                    </BadgeComponent>
                  ),
                },
                {
                  key: "project",
                  label: "Project",
                  render: (row: any) => row.project
                    ? <BadgeComponent variant="info" mini>{row.project}</BadgeComponent>
                    : <span className={styles.tableDash}>—</span>,
                },
                {
                  key: "enabled",
                  label: "Status",
                  sortValue: (row: any) => (row.enabled ? 1 : 0),
                  render: (row: any) => (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleTask(row); }}
                      className={`${styles.toggleSwitch} ${styles.toggleSwitchSmall} ${row.enabled ? styles.toggleSwitchOn : ""}`}
                      title={row.enabled ? "Disable task" : "Enable task"}
                    >
                      <span className={styles.toggleKnob} />
                    </button>
                  ),
                },
                {
                  key: "createdAt",
                  label: "Created",
                  sortable: true,
                  align: "right",
                  render: (row: any) => row.createdAt
                    ? <BadgeComponent type="dateTime" date={row.createdAt} />
                    : <span className={styles.tableDash}>—</span>,
                },
                {
                  key: "actions",
                  label: "",
                  sortable: false,
                  align: "right",
                  render: (row: any) => {
                    const isMenuOpen = activeMenuId === row.id;
                    const isTriggering = triggeringId === row.id;
                    return (
                      <div className={styles.tableActionsCell}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTriggerTask(row); }}
                          className={styles.tableActionBtn}
                          disabled={isTriggering}
                          title="Trigger task"
                        >
                          {isTriggering ? <Loader2 size={13} className={styles.spin} /> : <Play size={13} />}
                        </button>
                        <div className={styles.menuContainer}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : row.id); }}
                            className={styles.menuBtn}
                            title="More Actions"
                          >
                            <MoreVertical size={14} />
                          </button>
                          {isMenuOpen && (
                            <>
                              <div className={styles.menuBackdrop} onClick={() => setActiveMenuId(null)} />
                              <div className={styles.menuDropdown}>
                                <button onClick={() => handleCopyConfig(row)}>
                                  <Copy size={13} /><span>Copy Config</span>
                                </button>
                                <button
                                  onClick={() => { setConfirmDeleteId(row.id); setActiveMenuId(null); }}
                                  className={styles.deleteBtnText}
                                >
                                  <Trash2 size={13} /><span>Delete</span>
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
              getRowKey={(t: any) => t.id}
              emptyText="No Scheduled Tasks found"
              storageKey="scheduled-tasks"
            />
          ) : (
            /* ── Card View ── */
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

        {/* Modal for New Agentic Cron — using ModalComponent from components-library */}
        {showNewModal && (
          <ModalComponent
            title="New Agentic Cron"
            onClose={() => setShowNewModal(false)}
            size="md"
            footer={
              <div className={styles.modalActions}>
                <ButtonComponent
                  variant="disabled"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </ButtonComponent>
                <ButtonComponent
                  variant="submit"
                  icon={Check}
                  loading={formSubmitting}
                  disabled={formSubmitting}
                  onClick={handleSubmitTask}
                >
                  Add Agentic Cron
                </ButtonComponent>
              </div>
            }
          >
            <form onSubmit={handleSubmitTask} className={styles.form}>
              {/* Task Name */}
              <FormGroupComponent label="Name">
                <InputComponent
                  id="taskName"
                  required
                  placeholder="Enter task name"
                  value={formName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormName(e.target.value)}
                />
              </FormGroupComponent>

              <div className={styles.formRow}>
                {/* Project / Workspace */}
                <FormGroupComponent label="Project">
                  <SelectComponent
                    value={formProject}
                    onChange={(val: string) => setFormProject(val)}
                    options={workspaces.map((w) => ({
                      value: w.name,
                      label: w.name,
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
                  id="taskPrompt"
                  required
                  placeholder="Enter a prompt for the agent..."
                  value={formPrompt}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormPrompt(e.target.value)}
                  minRows={4}
                  maxRows={10}
                />
              </FormGroupComponent>

              {/* Schedule Selector */}
              <div className={styles.scheduleBuilder}>
                <FormGroupComponent label="Schedule">
                  <SelectComponent
                    value={formScheduleType}
                    onChange={(val: string) => setFormScheduleType(val as typeof formScheduleType)}
                    options={[
                      { value: "once", label: "One-time" },
                      { value: "hourly", label: "Hourly" },
                      { value: "daily", label: "Daily" },
                      { value: "weekly", label: "Weekly" },
                      { value: "cron", label: "Cron Expression" },
                      { value: "trigger", label: "Trigger (Manual / Remote)" },
                    ]}
                  />
                </FormGroupComponent>

                {/* Time picker for daily */}
                {formScheduleType === "daily" && (
                  <div className={styles.timePickerRow}>
                    <span className={styles.pickerLabel}>around</span>
                    <SelectComponent
                      value={formTimeHour}
                      onChange={(val: string) => setFormTimeHour(val)}
                      options={Array.from({ length: 12 }, (_, i) => {
                        const h = String(i === 0 ? 12 : i).padStart(2, "0");
                        return { value: h, label: h };
                      })}
                    />
                    <span className={styles.timeColon}>:</span>
                    <SelectComponent
                      value={formTimeMinute}
                      onChange={(val: string) => setFormTimeMinute(val)}
                      options={["00", "15", "30", "45"].map((m) => ({ value: m, label: m }))}
                    />
                    <SelectComponent
                      value={formTimeAmpm}
                      onChange={(val: string) => setFormTimeAmpm(val)}
                      options={[
                        { value: "AM", label: "AM" },
                        { value: "PM", label: "PM" },
                      ]}
                    />
                  </div>
                )}

                {/* Day + time picker for weekly */}
                {formScheduleType === "weekly" && (
                  <div className={styles.weeklyPickerRow}>
                    <SelectComponent
                      value={String(formWeeklyDay)}
                      onChange={(val: string) => setFormWeeklyDay(Number(val))}
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
                    <span className={styles.pickerLabel}>around</span>
                    <SelectComponent
                      value={formTimeHour}
                      onChange={(val: string) => setFormTimeHour(val)}
                      options={Array.from({ length: 12 }, (_, i) => {
                        const h = String(i === 0 ? 12 : i).padStart(2, "0");
                        return { value: h, label: h };
                      })}
                    />
                    <span className={styles.timeColon}>:</span>
                    <SelectComponent
                      value={formTimeMinute}
                      onChange={(val: string) => setFormTimeMinute(val)}
                      options={["00", "15", "30", "45"].map((m) => ({ value: m, label: m }))}
                    />
                    <SelectComponent
                      value={formTimeAmpm}
                      onChange={(val: string) => setFormTimeAmpm(val)}
                      options={[
                        { value: "AM", label: "AM" },
                        { value: "PM", label: "PM" },
                      ]}
                    />
                  </div>
                )}

                {/* Date + time picker for once */}
                {formScheduleType === "once" && (
                  <div className={styles.weeklyPickerRow}>
                    <InputComponent
                      type="date"
                      value={formOnceDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormOnceDate(e.target.value)}
                    />
                    <span className={styles.pickerLabel}>around</span>
                    <SelectComponent
                      value={formTimeHour}
                      onChange={(val: string) => setFormTimeHour(val)}
                      options={Array.from({ length: 12 }, (_, i) => {
                        const h = String(i === 0 ? 12 : i).padStart(2, "0");
                        return { value: h, label: h };
                      })}
                    />
                    <span className={styles.timeColon}>:</span>
                    <SelectComponent
                      value={formTimeMinute}
                      onChange={(val: string) => setFormTimeMinute(val)}
                      options={["00", "15", "30", "45"].map((m) => ({ value: m, label: m }))}
                    />
                    <SelectComponent
                      value={formTimeAmpm}
                      onChange={(val: string) => setFormTimeAmpm(val)}
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
                      id="taskCron"
                      required
                      placeholder="* * * * *"
                      value={formCron}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormCron(e.target.value)}
                    />
                  </FormGroupComponent>
                )}
              </div>
            </form>
          </ModalComponent>
        )}
        </div>
      </div>
    </div>
  );
}
