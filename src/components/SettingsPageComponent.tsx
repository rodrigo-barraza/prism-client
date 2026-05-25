"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain,
  Network,
  Bot,
  RotateCcw,
  Loader2,
  Check,
  FolderOpen,
  Lock,
  X,
  Plus,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Server,
  Wifi,
  WifiOff,
  FolderTree,
  Settings2,
  Cpu,
  Container,
  Terminal,
  ChevronRight,
  Copy,
  CheckCheck,
} from "lucide-react";
import { FEEDBACK_STANDARD_MS } from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import WorkspaceService from "../services/WorkspaceService";
import { useWorkspace } from "./WorkspaceContextComponent";

import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import CustomAgentsPanel from "./CustomAgentsPanelComponent";
import {
  ButtonComponent,
  CardComponent,
  PageHeaderComponent,
  ToggleComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./SettingsPageComponent.module.css";

import { PrismSettings, AgenticHarness } from "../types/types";

interface LocalWorkspace {
  id?: string;
  name?: string;
  path: string;
  isPinned?: boolean;
  isAgentServed?: boolean;
}

interface LocalAgent {
  id: string;
  name: string;
  project?: string;
  path?: string;
  capabilities?: string[];
  roots?: { path: string; isAgentServed?: boolean }[];
  version?: string;
  clientIp?: string;
  connectedAt?: string;
  pendingRpcs?: number;
}


/**
 * SettingsPageComponent — server-side settings management.
 *
 * Exposes:
 *   - "Workspaces" section with agent connection status + workspace management
 *   - "Custom Agents" section for user-defined personas
 *   - "Memory Models" section for extraction, consolidation, and embedding
 *   - "Agent Defaults" section for subagent/worker model configuration
 */
export default function SettingsPageComponent() {
  const [config, setConfig] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customAgents, setCustomAgents] = useState<any[]>([]);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [harnesses, setHarnesses] = useState<any[]>([]);
  const [expandedGuide, setExpandedGuide] = useState<any>(null); // 'docker' | 'local' | null
  const [copiedBlock, setCopiedBlock] = useState<any>(null);

  // -- Workspace state ------------------------------------------------
  const { refreshWorkspaces } = useWorkspace();
  const [wsWorkspaces, setWsWorkspaces] = useState<any[]>([]);
  const [wsAgents, setWsAgents] = useState<any[]>([]);
  const [wsAddPath, setWsAddPath] = useState("");
  const [wsValidation, setWsValidation] = useState<any>(null);
  const [wsAdding, setWsAdding] = useState(false);
  const wsValidateTimer = useRef<any>(null);

  /** Detect Windows-style path for instant client-side preview */
  const isWindowsPath = (p: string) => /^[A-Za-z]:[/\\]/.test(p);
  const windowsToWslPreview = (p: string) => {
    const m = p.match(/^([A-Za-z]):[/\\](.*)/);
    if (!m) return null;
    return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
  };

  /** Format uptime duration from ISO date */
  const formatUptime = (isoDate: string) => {
    if (!isoDate) return "";
    const ms = Date.now() - new Date(isoDate).getTime();
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  // -- Load config + settings on mount --------------------------------
  useEffect(() => {
    PrismService.getConfigWithLocalModels({
      onConfig: setConfig,
      onLocalMerge: setConfig,
    }).catch(console.error);

    PrismService.getSettings().then(setSettings).catch(console.error);

    PrismService.getSettingsDefaults().then(setDefaults).catch(console.error);

    // Fetch custom agents
    PrismService.getCustomAgents().then(setCustomAgents).catch(console.error);

    // Fetch all available tools (unfiltered) for the tool picker
    PrismService.getBuiltInToolSchemas()
      .then(setAvailableTools)
      .catch(console.error);

    // Fetch available harnesses
    PrismService.getHarnesses().then(setHarnesses).catch(console.error);

    // Fetch full workspace config (workspaces + agents)
    WorkspaceService.listFull()
      .then(({ workspaces, agents }: { workspaces: LocalWorkspace[]; agents: LocalAgent[] }) => {
        setWsWorkspaces(workspaces || []);
        setWsAgents(agents || []);
      })
      .catch(console.error);
  }, []);

  // -- Persist changes ------------------------------------------------
  const persistSettings = useCallback(async (updatedSettings: Partial<PrismSettings>) => {
    setSaving(true);
    try {
      const result = await PrismService.updateSettings(updatedSettings);
      setSettings(result);
      setSaved(true);
      clearTimeout(savedTimerRef.current!);
      savedTimerRef.current = setTimeout(
        () => setSaved(false),
        FEEDBACK_STANDARD_MS,
      );
    } catch (error: unknown) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  }, []);

  // -- Memory model change handlers -----------------------------------
  const handleExtractionModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        memory: {
          ...settings?.memory,
          extractionProvider: provider || "",
          extractionModel: model || "",
        },
      };
      setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleConsolidationModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        memory: {
          ...settings?.memory,
          consolidationProvider: provider || "",
          consolidationModel: model || "",
        },
      };
      setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleEmbeddingModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        memory: {
          ...settings?.memory,
          embeddingProvider: provider || "",
          embeddingModel: model || "",
        },
      };
      setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  // -- Agent model change handlers ------------------------------------
  const handleSubagentModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        agents: {
          ...settings?.agents,
          subagentProvider: provider || "",
          subagentModel: model || "",
        },
      };
      setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  // -- Harness change handler -----------------------------------------
  const handleHarnessSelect = useCallback(
    (harnessId: string) => {
      const updated = {
        agents: {
          ...settings?.agents,
          harness: harnessId,
        },
      };
      setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  // -- Reset to defaults ----------------------------------------------
  const handleResetMemory = useCallback(async () => {
    if (!defaults?.memory) return;
    const updated = { memory: { ...(defaults?.memory || {}) } };
    setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
    await persistSettings(updated);
  }, [defaults, persistSettings]);

  // -- Workspace handlers ---------------------------------------------
  const handleWsPathChange = useCallback((value: string) => {
    setWsAddPath(value);
    setWsValidation(null);
    clearTimeout(wsValidateTimer.current);
    if (!value.trim()) return;
    wsValidateTimer.current = setTimeout(async () => {
      try {
        const result = await WorkspaceService.validate(value);
        setWsValidation(result);
      } catch {
        setWsValidation({ valid: false, error: "Validation failed" });
      }
    }, 400);
  }, []);

  const handleAddWorkspace = useCallback(async () => {
    if (!wsAddPath.trim() || wsAdding) return;
    setWsAdding(true);
    try {
      const currentUserRoots = wsWorkspaces
        .filter((w: LocalWorkspace) => !w.isPinned)
        .map((w: LocalWorkspace) => w.path);
      // Resolve the new path — if Windows, the backend will translate
      const newPath = wsAddPath.trim();
      await WorkspaceService.update([...currentUserRoots, newPath]);
      // Refresh full config
      const { workspaces, agents } = await WorkspaceService.listFull();
      setWsWorkspaces(workspaces || []);
      setWsAgents(agents || []);
      setWsAddPath("");
      setWsValidation(null);
      await refreshWorkspaces();
    } catch (error: unknown) {
      console.error("Failed to add workspace:", error);
      setWsValidation({ valid: false, error: "Failed to add workspace" });
    } finally {
      setWsAdding(false);
    }
  }, [wsAddPath, wsAdding, wsWorkspaces, refreshWorkspaces]);

  const handleRemoveWorkspace = useCallback(
    async (pathToRemove: string) => {
      try {
        const remainingUserRoots = wsWorkspaces
          .filter((w: LocalWorkspace) => !w.isPinned && w.path !== pathToRemove)
          .map((w: LocalWorkspace) => w.path);
        await WorkspaceService.update(remainingUserRoots);
        const { workspaces, agents } = await WorkspaceService.listFull();
        setWsWorkspaces(workspaces || []);
        setWsAgents(agents || []);
        await refreshWorkspaces();
      } catch (error: unknown) {
        console.error("Failed to remove workspace:", error);
      }
    },
    [wsWorkspaces, refreshWorkspaces],
  );

  const handleResetAgents = useCallback(async () => {
    if (!defaults?.agents) return;
    const updated = { agents: { ...(defaults?.agents || {}) } };
    setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
    await persistSettings(updated);
  }, [defaults, persistSettings]);

  const handleSecurityToggle = useCallback(
    (key: string, enabled: boolean) => {
      const updated = {
        security: {
          ...settings?.security,
          [key]: enabled,
        },
      };
      setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleResetSecurity = useCallback(async () => {
    if (!defaults?.security) return;
    const updated = { security: { ...(defaults?.security || {}) } };
    setSettings((s: PrismSettings | null) => ({ ...s, ...updated }));
    await persistSettings(updated);
  }, [defaults, persistSettings]);

  // -- Custom agents refresh ------------------------------------------
  const loadCustomAgents = useCallback(async () => {
    try {
      const list = await PrismService.getCustomAgents();
      setCustomAgents(list);
    } catch (error: unknown) {
      console.error("Failed to load custom agents:", error);
    }
  }, []);

  // -- Derived workspace data -----------------------------------------
  const localStaticRoots = wsWorkspaces.filter(
    (w: LocalWorkspace) => w.isPinned && !w.isAgentServed,
  );
  const userRoots = wsWorkspaces.filter(
    (w: LocalWorkspace) => !w.isPinned && !w.isAgentServed,
  );

  // -- Loading state --------------------------------------------------
  if (!config || !settings) {
    return (
      <div className={styles.container}>
        <PageHeaderComponent
          title="Settings"
          subtitle="Configure system-wide preferences"
        />
        <div className={styles.loading}>
          <Loader2 size={20} className={styles.spinning} />
          <span>Loading settings…</span>
        </div>
      </div>
    );
  }

  const memorySettings = (settings?.memory || {}) || {};
  const agentDefaults = (settings?.agents || {}) || {};
  const hasAgents = wsAgents.length > 0;
  const hasAnyWorkspaces = wsWorkspaces.length > 0;

  return (
    <div className={styles.container}>
      <PageHeaderComponent
        title="Settings"
        subtitle="Configure system-wide preferences"
      >
        <span
          className={`${styles.savedIndicator} ${saved ? styles.visible : ""}`}
        >
          <Check size={14} />
          Saved
        </span>
      </PageHeaderComponent>

      {/* -- Workspaces Section ---------------------------------------- */}
      <CardComponent className={styles.section}>
        <CardComponent.Header
          icon={FolderOpen}
          title="Workspaces"
          subtitle="Directories accessible to the agent for file operations"
        />

        <CardComponent.Body>
          {/* Agent status banner */}
          <div className={styles.agentStatusBanner}>
            <div
              className={`${styles.agentStatusDot} ${hasAgents ? styles.connected : styles.disconnected}`}
            />
            <span className={styles.agentStatusText}>
              {hasAgents ? (
                <>
                  <strong>{wsAgents.length}</strong> workspace agent
                  {wsAgents.length !== 1 ? "s" : ""} connected
                </>
              ) : (
                "No workspace agents connected"
              )}
            </span>
            <span className={styles.agentStatusMeta}>
              {wsWorkspaces.length} root{wsWorkspaces.length !== 1 ? "s" : ""}{" "}
              total
            </span>
          </div>

          {/* Connected Agents */}
          {hasAgents && (
            <>
              <div className={styles.sectionLabel}>
                <Server size={10} />
                Remote Agents
              </div>
              {wsAgents.map((agent: LocalAgent) => (
                <div key={agent.id} className={styles.agentCard}>
                  <div className={styles.agentCardHeader}>
                    <div className={styles.agentIcon}>
                      <Wifi size={16} />
                    </div>
                    <div className={styles.agentInfo}>
                      <div className={styles.agentNameRow}>
                        <span className={styles.agentName}>{agent.name}</span>
                        {agent.version && (
                          <span className={styles.agentVersion}>
                            v{agent.version}
                          </span>
                        )}
                      </div>
                      <div className={styles.agentMeta}>
                        <span className={styles.agentMetaItem}>
                          {agent.clientIp}
                        </span>
                        <span className={styles.agentMetaSeparator} />
                        {agent.connectedAt && (
                          <span className={styles.agentMetaItem}>
                            up {formatUptime(agent.connectedAt)}
                          </span>
                        )}
                        {(agent.pendingRpcs ?? 0) > 0 && (
                          <>
                            <span className={styles.agentMetaSeparator} />
                            <span className={styles.agentMetaItem}>
                              {agent.pendingRpcs} pending
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={styles.agentCapabilities}>
                      {(agent.capabilities || []).map((cap: string) => (
                        <span key={cap} className={styles.capabilityTag}>
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Roots served by this agent */}
                  {agent.roots && agent.roots.length > 0 && (
                    <div className={styles.agentRoots}>
                      {agent.roots.map((root: { path: string; isAgentServed?: boolean }) => (
                        <div key={root.path} className={styles.agentRootItem}>
                          <FolderOpen size={13} className={styles.dimIcon} />
                          {root.path}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Local static roots (from env config, not agent-served) */}
          {localStaticRoots.length > 0 && (
            <>
              <div className={styles.workspaceDivider} />
              <div className={styles.sectionLabel}>
                <Settings2 size={10} />
                Static Roots
              </div>
              {localStaticRoots.map((ws: LocalWorkspace) => (
                <div key={ws.id} className={styles.workspaceItem}>
                  <div className={styles.workspaceItemInfo}>
                    <FolderOpen
                      size={16}
                      className={styles.workspaceItemIcon}
                    />
                    <div className={styles.workspaceItemDetails}>
                      <span className={styles.workspaceItemName}>
                        {ws.name}
                        <span className={styles.staticBadge}>
                          <Lock size={8} />
                          Static
                        </span>
                      </span>
                      <span className={styles.workspaceItemPath}>
                        {ws.path}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* User-configured workspace roots */}
          {userRoots.length > 0 && (
            <>
              <div className={styles.workspaceDivider} />
              <div className={styles.sectionLabel}>
                <FolderOpen size={10} />
                User Workspaces
              </div>
              {userRoots.map((ws: LocalWorkspace) => (
                <div key={ws.id} className={styles.workspaceItem}>
                  <div className={styles.workspaceItemInfo}>
                    <FolderOpen
                      size={16}
                      className={styles.workspaceItemIcon}
                    />
                    <div className={styles.workspaceItemDetails}>
                      <span className={styles.workspaceItemName}>
                        {ws.name}
                      </span>
                      <span className={styles.workspaceItemPath}>
                        {ws.path}
                      </span>
                    </div>
                  </div>
                  <button
                    className={styles.removeButton}
                    onClick={() => handleRemoveWorkspace(ws.path)}
                    title="Remove workspace"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Onboarding when nothing is configured */}
          {!hasAnyWorkspaces && !hasAgents && (
            <div className={styles.onboardingCard}>
              <WifiOff
                size={24}
                style={{ color: "var(--text-muted)", margin: "0 auto" }}
              />
              <span className={styles.onboardingTitle}>
                No workspaces configured
              </span>
              <span className={styles.onboardingDescription}>
                Deploy the{" "}
                <span className={styles.onboardingCode}>workspace-service</span>{" "}
                on a device to give the agent remote file, git, and shell
                access. Or add a local workspace path below.
              </span>
            </div>
          )}

          {/* Add workspace input */}
          <div className={styles.addWorkspaceRow}>
            <input
              type="text"
              className={`${styles.addWorkspaceInput} ${wsValidation ? ((wsValidation as { valid: boolean; error?: string }).valid ? styles.valid : styles.invalid) : ""}`}
              placeholder="Add workspace path (e.g. /home/user/projects or C:\Users\...)"
              value={wsAddPath}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => handleWsPathChange(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter" && (wsValidation as { valid: boolean; error?: string })?.valid)
                  handleAddWorkspace();
              }}
            />
            <button
              className={styles.addButton}
              disabled={!(wsValidation as { valid: boolean; error?: string })?.valid || wsAdding}
              onClick={handleAddWorkspace}
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          {/* Validation feedback */}
          {wsAddPath.trim() && wsValidation && (
            <div
              className={`${styles.validationRow} ${(wsValidation as { valid: boolean; error?: string }).valid ? styles.success : styles.error}`}
            >
              {(wsValidation as { valid: boolean; error?: string }).valid ? (
                <>
                  <CheckCircle2 size={12} /> Valid directory
                </>
              ) : (
                <>
                  <XCircle size={12} /> {(wsValidation as { valid: boolean; error?: string }).error}
                </>
              )}
            </div>
          )}

          {/* Windows → WSL translation preview */}
          {wsAddPath.trim() && isWindowsPath(wsAddPath.trim()) && (
            <div className={`${styles.validationRow} ${styles.info}`}>
              <ArrowRight size={12} />
              <span>Translates to: </span>
              <span className={styles.wslTranslation}>
                {windowsToWslPreview(wsAddPath.trim())}
              </span>
            </div>
          )}

          {/* ── Workspace Setup Guide ─────────────────────────────── */}
          <div className={styles.setupGuide}>
            <div className={styles.setupGuideHeader}>
              <span className={styles.setupGuideTitle}>
                Workspace Setup Guide
              </span>
              <span className={styles.setupGuideSubtitle}>
                Connect a workspace agent to give Prism file, git, and shell
                access
              </span>
            </div>

            {/* Docker setup */}
            <button
              className={`${styles.guideToggle} ${expandedGuide === "docker" ? styles.guideExpanded : ""}`}
              onClick={() =>
                setExpandedGuide(expandedGuide === "docker" ? null : "docker")
              }
            >
              <Container size={16} className={styles.guideToggleIcon} />
              <div className={styles.guideToggleLabel}>
                <span className={styles.guideToggleTitle}>Docker</span>
                <span className={styles.guideToggleHint}>
                  Headless servers, NAS, always-on deployments
                </span>
              </div>
              <ChevronRight size={14} className={styles.guideChevron} />
            </button>

            {expandedGuide === "docker" && (
              <div className={styles.guideContent}>
                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>1</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>
                      Clone the repository
                    </span>
                    <div className={styles.codeBlock}>
                      <code>
                        git clone
                        https://github.com/rodrigo-barraza/workspace-service.git
                        {"\n"}cd workspace-service
                      </code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "git clone https://github.com/rodrigo-barraza/workspace-service.git\ncd workspace-service",
                          );
                          setCopiedBlock("docker-1");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "docker-1" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>2</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>
                      Create your{" "}
                      <code className={styles.inlineCode}>.env</code> file
                    </span>
                    <div className={styles.codeBlock}>
                      <code>cp .env.example .env</code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("cp .env.example .env");
                          setCopiedBlock("docker-2");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "docker-2" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    <span className={styles.stepHint}>
                      Edit <code className={styles.inlineCode}>.env</code> and
                      set your{" "}
                      <code className={styles.inlineCode}>
                        WORKSPACE_SERVICE_SECRET
                      </code>{" "}
                      to match your tools-service agent secret.
                    </span>
                  </div>
                </div>

                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>3</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>
                      Build and start the container
                    </span>
                    <div className={styles.codeBlock}>
                      <code>docker compose up -d</code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("docker compose up -d");
                          setCopiedBlock("docker-3");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "docker-3" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    <span className={styles.stepHint}>
                      The container exposes{" "}
                      <code className={styles.inlineCode}>/workspace</code> as
                      the root. Mount your project directories via{" "}
                      <code className={styles.inlineCode}>volumes</code> in{" "}
                      <code className={styles.inlineCode}>
                        docker-compose.yml
                      </code>
                      .
                    </span>
                  </div>
                </div>

                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>4</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>Verify connection</span>
                    <div className={styles.codeBlock}>
                      <code>docker logs workspace-service</code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "docker logs workspace-service",
                          );
                          setCopiedBlock("docker-4");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "docker-4" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    <span className={styles.stepHint}>
                      Look for{" "}
                      <code className={styles.inlineCode}>
                        Connected to ws://…
                      </code>{" "}
                      and{" "}
                      <code className={styles.inlineCode}>
                        Server confirmed registration
                      </code>
                      .
                    </span>
                  </div>
                </div>

                <div className={styles.guideEnvTable}>
                  <span className={styles.envTableTitle}>
                    Environment Variables
                  </span>
                  <div className={styles.envRow}>
                    <code className={styles.envKey}>WORKSPACE_BACKEND</code>
                    <span className={styles.envDesc}>
                      WebSocket URL of tools-service (e.g.{" "}
                      <code className={styles.inlineCode}>
                        ws://192.168.86.2:5590
                      </code>
                      )
                    </span>
                  </div>
                  <div className={styles.envRow}>
                    <code className={styles.envKey}>WORKSPACE_ROOTS</code>
                    <span className={styles.envDesc}>
                      Comma-separated root directories (default:{" "}
                      <code className={styles.inlineCode}>/workspace</code>)
                    </span>
                  </div>
                  <div className={styles.envRow}>
                    <code className={styles.envKey}>
                      WORKSPACE_SERVICE_SECRET
                    </code>
                    <span className={styles.envDesc}>
                      Must match your tools-service agent secret
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Local (Node) setup */}
            <button
              className={`${styles.guideToggle} ${expandedGuide === "local" ? styles.guideExpanded : ""}`}
              onClick={() =>
                setExpandedGuide(expandedGuide === "local" ? null : "local")
              }
            >
              <Terminal size={16} className={styles.guideToggleIcon} />
              <div className={styles.guideToggleLabel}>
                <span className={styles.guideToggleTitle}>Local (Node.js)</span>
                <span className={styles.guideToggleHint}>
                  WSL2, Linux, macOS — native filesystem performance
                </span>
              </div>
              <ChevronRight size={14} className={styles.guideChevron} />
            </button>

            {expandedGuide === "local" && (
              <div className={styles.guideContent}>
                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>1</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>
                      Clone and install dependencies
                    </span>
                    <div className={styles.codeBlock}>
                      <code>
                        git clone
                        https://github.com/rodrigo-barraza/workspace-service.git
                        {"\n"}cd workspace-service{"\n"}npm install
                      </code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "git clone https://github.com/rodrigo-barraza/workspace-service.git\ncd workspace-service\nnpm install",
                          );
                          setCopiedBlock("local-1");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "local-1" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>2</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>
                      Create your{" "}
                      <code className={styles.inlineCode}>.env</code> file
                    </span>
                    <div className={styles.codeBlock}>
                      <code>cp .env.example .env</code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("cp .env.example .env");
                          setCopiedBlock("local-2");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "local-2" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    <span className={styles.stepHint}>
                      Fill in your values:
                    </span>
                    <div className={styles.codeBlock}>
                      <code>
                        WORKSPACE_BACKEND=ws://192.168.86.2:5590{"\n"}
                        WORKSPACE_ROOTS=/home/you/development{"\n"}
                        WORKSPACE_SERVICE_SECRET=your-agent-secret
                      </code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "WORKSPACE_BACKEND=ws://192.168.86.2:5590\nWORKSPACE_ROOTS=/home/you/development\nWORKSPACE_SERVICE_SECRET=your-agent-secret",
                          );
                          setCopiedBlock("local-2b");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "local-2b" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>3</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>Start the service</span>
                    <div className={styles.codeBlock}>
                      <code>npm run dev:local</code>
                      <button
                        className={styles.copyBtn}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("npm run dev:local");
                          setCopiedBlock("local-3");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MS,
                          );
                        }}
                      >
                        {copiedBlock === "local-3" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    <span className={styles.stepHint}>
                      This loads <code className={styles.inlineCode}>.env</code>{" "}
                      automatically and starts with file-watch reload. You can
                      also pass env vars inline or use CLI flags — see the
                      README for details.
                    </span>
                  </div>
                </div>

                <div className={styles.guideStep}>
                  <span className={styles.stepNumber}>4</span>
                  <div className={styles.stepBody}>
                    <span className={styles.stepTitle}>Verify connection</span>
                    <span className={styles.stepHint}>
                      Look for{" "}
                      <code className={styles.inlineCode}>
                        Connected to ws://…
                      </code>{" "}
                      and{" "}
                      <code className={styles.inlineCode}>
                        Server confirmed registration
                      </code>{" "}
                      in the output. The agent will appear in this settings
                      panel under Remote Agents.
                    </span>
                  </div>
                </div>

                <div className={styles.guideCompareTable}>
                  <span className={styles.envTableTitle}>Docker vs. Local</span>
                  <div className={styles.compareRow}>
                    <span className={styles.compareLabel}>Filesystem</span>
                    <span className={styles.compareDocker}>Volume-mounted</span>
                    <span className={styles.compareLocal}>
                      Native — no mount overhead
                    </span>
                  </div>
                  <div className={styles.compareRow}>
                    <span className={styles.compareLabel}>Performance</span>
                    <span className={styles.compareDocker}>
                      Container + I/O
                    </span>
                    <span className={styles.compareLocal}>
                      Faster grep, glob, git
                    </span>
                  </div>
                  <div className={styles.compareRow}>
                    <span className={styles.compareLabel}>Git / Shell</span>
                    <span className={styles.compareDocker}>
                      Inside container
                    </span>
                    <span className={styles.compareLocal}>
                      Host environment
                    </span>
                  </div>
                  <div className={styles.compareRow}>
                    <span className={styles.compareLabel}>Use case</span>
                    <span className={styles.compareDocker}>Servers, NAS</span>
                    <span className={styles.compareLocal}>
                      Dev machines, WSL2
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.guideFootnote}>
              <span>
                Multiple agents can run simultaneously — each registers with a
                unique ID and routes automatically.
              </span>
            </div>
          </div>
        </CardComponent.Body>
      </CardComponent>

      {/* -- Custom Agents Section ------------------------------------ */}
      <CardComponent className={styles.section}>
        <CardComponent.Header
          icon={Bot}
          title="Custom Agents"
          subtitle="Create your own agent personas with custom prompts and tools"
        />

        <CustomAgentsPanel
          agents={customAgents}
          onAgentsChange={loadCustomAgents}
          availableTools={availableTools}
        />
      </CardComponent>

      {/* -- Memory Models Section ------------------------------------ */}
      <CardComponent className={styles.section}>
        <CardComponent.Header
          icon={Brain}
          title="Memory Models"
          subtitle="Models used for memory extraction, consolidation, and embedding"
        />

        <CardComponent.Body>
          {/* Extraction Model */}
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span className={styles.rowTitle}>Extraction Model</span>
              <span className={styles.rowDescription}>
                Extracts personal facts and knowledge from conversations
              </span>
            </div>
            <div className={styles.rowControl}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: memorySettings.extractionProvider || "",
                  model: memorySettings.extractionModel || "",
                }}
                onSelectModel={handleExtractionModelSelect}
                modelTypeFilter="conversation"
                allowDeselect
              />
            </div>
          </div>

          {/* Consolidation Model */}
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span className={styles.rowTitle}>Consolidation Model</span>
              <span className={styles.rowDescription}>
                Merges, deduplicates, and prunes stored memories
              </span>
            </div>
            <div className={styles.rowControl}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: memorySettings.consolidationProvider || "",
                  model: memorySettings.consolidationModel || "",
                }}
                onSelectModel={handleConsolidationModelSelect}
                modelTypeFilter="conversation"
                allowDeselect
              />
            </div>
          </div>

          {/* Embedding Model */}
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span className={styles.rowTitle}>Embedding Model</span>
              <span className={styles.rowDescription}>
                Generates vector embeddings for semantic memory search
              </span>
            </div>
            <div className={styles.rowControl}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: memorySettings.embeddingProvider || "",
                  model: memorySettings.embeddingModel || "",
                }}
                onSelectModel={handleEmbeddingModelSelect}
                modelTypeFilter="embed"
                allowDeselect
              />
            </div>
          </div>
        </CardComponent.Body>

        {/* Reset */}
        <CardComponent.Footer>
          <ButtonComponent
            variant="disabled"
            icon={RotateCcw}
            onClick={handleResetMemory}
            disabled={saving}
          >
            Reset to Defaults
          </ButtonComponent>
        </CardComponent.Footer>
      </CardComponent>

      {/* -- Agent Defaults Section ----------------------------------- */}
      <CardComponent className={styles.section}>
        <CardComponent.Header
          icon={Network}
          title="Agent Defaults"
          subtitle="Default model for subagent workers spawned by the coordinator"
        />

        <CardComponent.Body>
          {/* Harness Selector */}
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span className={styles.rowTitle}>Agentic Harness</span>
              <span className={styles.rowDescription}>
                The execution strategy used by the agent loop. Different
                harnesses define how the model interacts with tools.
              </span>
            </div>
          </div>
          <div className={styles.harnessGrid}>
            {harnesses.map((h: AgenticHarness) => {
              const isActive = (agentDefaults.harness || "standard") === h.id;
              return (
                <button
                  key={h.id}
                  className={`${styles.harnessCard} ${isActive ? styles.harnessActive : ""}`}
                  onClick={() => handleHarnessSelect(h.id)}
                >
                  <div className={styles.harnessCardHeader}>
                    <Cpu size={16} className={styles.harnessIcon} />
                    <span className={styles.harnessLabel}>{h.label}</span>
                    {isActive && (
                      <span className={styles.harnessBadge}>Current</span>
                    )}
                  </div>
                  <span className={styles.harnessDescription}>
                    {h.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.harnessDivider} />

          {/* Subagent Model */}
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span className={styles.rowTitle}>Subagent Model</span>
              <span className={styles.rowDescription}>
                Pick a default subagent model for Prism to use when it spawns
                subagents. If not set, it will use the current active model.
              </span>
            </div>
            <div className={styles.rowControl}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: agentDefaults.subagentProvider || "",
                  model: agentDefaults.subagentModel || "",
                }}
                onSelectModel={handleSubagentModelSelect}
                modelTypeFilter="conversation"
                allowDeselect
                placeholderLabel="Uses agent model"
              />
            </div>
          </div>
        </CardComponent.Body>

        {/* Reset */}
        <CardComponent.Footer>
          <ButtonComponent
            variant="disabled"
            icon={RotateCcw}
            onClick={handleResetAgents}
            disabled={saving}
          >
            Reset to Defaults
          </ButtonComponent>
        </CardComponent.Footer>
      </CardComponent>

      {/* -- Security & Sandboxing Section ---------------------------- */}
      <CardComponent className={styles.section}>
        <CardComponent.Header
          icon={Lock}
          title="Security & Sandboxing"
          subtitle="Configure file system policies, environment variable isolation, and credentials access"
        />

        <CardComponent.Body>
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              <span className={styles.rowTitle}>Allow `.env` & Sensitive Files Access</span>
              <span className={styles.rowDescription}>
                Allow the agent to view, search, or edit `.env` environment configurations, `.pem` certificates, `.key` private keys, and SSH credentials inside the workspace. When disabled, these files are strictly isolated from the agent's file tools to prevent credential leakage.
              </span>
            </div>
            <div className={styles.rowControl}>
              <ToggleComponent
                checked={settings?.security?.allowEnvFiles ?? false}
                onChange={(checked: boolean) => handleSecurityToggle("allowEnvFiles", checked)}
                size="mini"
              />
            </div>
          </div>
        </CardComponent.Body>

        {/* Reset */}
        <CardComponent.Footer>
          <ButtonComponent
            variant="disabled"
            icon={RotateCcw}
            onClick={handleResetSecurity}
            disabled={saving}
          >
            Reset to Defaults
          </ButtonComponent>
        </CardComponent.Footer>
      </CardComponent>
    </div>
  );
}
