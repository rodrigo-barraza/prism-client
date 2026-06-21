"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain,
  Heart,
  Network,
  RotateCcw,
  Check,
  FolderOpen,
  Lock,
  X,
  Plus,
  Plug,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Server,
  Wifi,
  WifiOff,
  FolderTree,
  Settings,
  Settings2,
  Cpu,
  Container,
  Terminal,
  ChevronRight,
  Copy,
  CheckCheck,
  Palette,
  Volume2,
  Download,
  HardDrive,
  Monitor,
  AppWindow,
  MemoryStick,
  Workflow,
} from "lucide-react";
import { FEEDBACK_STANDARD_MILLISECONDS } from "@rodrigo-barraza/utilities-library";
import PrismService from "../services/PrismService";
import WorkspaceService, {
  type WorkspaceValidateResponse,
} from "../services/WorkspaceService";
import { useWorkspace } from "./WorkspaceContextComponent";

import ModelPickerPopoverComponent from "./ModelPickerPopoverComponent";
import CustomThemeEditorComponent from "./CustomThemeEditorComponent";
import AvatarSelectorComponent from "./AvatarSelectorComponent";
import MCPServersPanel from "./MCPServersPanelComponent";
import {
  ButtonComponent,
  CardComponent,
  InputComponent,
  ToggleComponent,
  SelectComponent,
} from "@rodrigo-barraza/components-library";
import PanelLoadingSpinner from "./PanelLoadingSpinnerComponent";
import ToolLinkComponent from "./ToolLinkComponent";
import { buildTopologyOptions, buildThoughtStructureOptions } from "./AgentStrategyOptionsComponent";
import styles from "./SettingsPageComponent.module.css";

import type {
  PrismSettings,
  AgenticHarness,
  MCPServer,
  PrismConfig,
} from "../types/types";

interface HostInfo {
  hostname?: string;
  platform?: string;
  arch?: string;
  release?: string;
  username?: string;
  cpuModel?: string;
  cpuCores?: number;
  totalMemoryBytes?: number;
}

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
  hostInfo?: HostInfo;
}

/**
 * SettingsPageComponent — server-side settings management.
 *
 * Exposes:
 *   - "Workspaces" section with agent connection status + workspace management
 *   - "Memory Models" section for extraction, consolidation, and embedding
 *   - "Harness Models" section for sub-agent and critic model configuration
 */
export default function SettingsPageComponent() {
  const [config, setConfig] = useState<PrismConfig | null>(null);
  const [settings, setSettings] = useState<PrismSettings | null>(null);
  const [defaults, setDefaults] = useState<PrismSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [harnesses, setHarnesses] = useState<AgenticHarness[]>([]);
  const [expandedGuide, setExpandedGuide] = useState<
    "desktop" | "tray" | "download" | "docker" | "local" | null
  >(null);
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  // -- MCP Servers state -----------------------------------------------
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);

  // -- Workspace state ------------------------------------------------
  const { refreshWorkspaces } = useWorkspace();
  const [wsWorkspaces, setWsWorkspaces] = useState<LocalWorkspace[]>([]);
  const [wsAgents, setWsAgents] = useState<LocalAgent[]>([]);
  const [wsAddPath, setWsAddPath] = useState("");
  const [wsValidation, setWsValidation] =
    useState<WorkspaceValidateResponse | null>(null);
  const [wsAdding, setWsAdding] = useState(false);
  const wsValidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Detect Windows-style path for instant client-side preview */
  const isWindowsPath = (pathString: string) =>
    /^[A-Za-z]:[/\\]/.test(pathString);
  const windowsToWslPreview = (pathString: string) => {
    const pathMatch = pathString.match(/^([A-Za-z]):[/\\](.*)/);
    if (!pathMatch) return null;
    return `/mnt/${pathMatch[1].toLowerCase()}/${pathMatch[2].replace(/\\/g, "/")}`;
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

    // Fetch available harnesses
    PrismService.getHarnesses().then(setHarnesses).catch(console.error);

    // Fetch MCP servers
    PrismService.getMCPServers()
      .then((servers: MCPServer[]) => setMcpServers(servers))
      .catch(console.error);

    // Fetch full workspace config (workspaces + agents)
    WorkspaceService.listFull()
      .then(
        ({
          workspaces,
          agents,
        }: {
          workspaces: LocalWorkspace[];
          agents: LocalAgent[];
        }) => {
          setWsWorkspaces(workspaces || []);
          setWsAgents(agents || []);
        },
      )
      .catch(console.error);
  }, []);

  // -- Persist changes ------------------------------------------------
  const persistSettings = useCallback(
    async (updatedSettings: Partial<PrismSettings>) => {
      setSaving(true);
      try {
        const result = await PrismService.updateSettings(updatedSettings);
        setSettings(result);
        setSaved(true);
        clearTimeout(savedTimerRef.current!);
        savedTimerRef.current = setTimeout(
          () => setSaved(false),
          FEEDBACK_STANDARD_MILLISECONDS,
        );
      } catch (error: unknown) {
        console.error("Failed to save settings:", error);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

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
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
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
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
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
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
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
          subAgentProvider: provider || "",
          subAgentModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleCriticModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        agents: {
          ...settings?.agents,
          criticProvider: provider || "",
          criticModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleReminderModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        agents: {
          ...settings?.agents,
          reminderProvider: provider || "",
          reminderModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
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
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  // -- Topology change handler -----------------------------------------
  const handleTopologySelect = useCallback(
    (topologyId: string) => {
      const updated = {
        agents: {
          ...settings?.agents,
          topology: topologyId,
        },
      };
      setSettings((previousSettings: PrismSettings | null) => ({
        ...previousSettings,
        ...updated,
      }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  // -- Thought structure change handler --------------------------------
  const handleThoughtStructureSelect = useCallback(
    (structureId: string) => {
      const updated = {
        agents: {
          ...settings?.agents,
          thoughtStructure: structureId,
        },
      };
      setSettings((previousSettings: PrismSettings | null) => ({
        ...previousSettings,
        ...updated,
      }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  // -- Reset to defaults ----------------------------------------------
  const handleResetMemory = useCallback(async () => {
    if (!defaults?.memory) return;
    const updated = { memory: { ...(defaults?.memory || {}) } };
    setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
    await persistSettings(updated);
  }, [defaults, persistSettings]);

  const handleEmotionModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        somatic: {
          ...settings?.somatic,
          emotionProvider: provider || "",
          emotionModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleResetSomatic = useCallback(async () => {
    const updated = { somatic: { emotionProvider: "", emotionModel: "" } };
    setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
    await persistSettings(updated);
  }, [persistSettings]);

  // -- Workspace handlers ---------------------------------------------
  const handleWsPathChange = useCallback((value: string) => {
    setWsAddPath(value);
    setWsValidation(null);
    if (wsValidateTimer.current) clearTimeout(wsValidateTimer.current);
    if (!value.trim()) return;
    wsValidateTimer.current = setTimeout(async () => {
      try {
        const result = await WorkspaceService.validate(value);
        setWsValidation(result);
      } catch {
        setWsValidation({
          valid: false,
          error: "Validation failed",
          resolvedPath: "",
          originalPath: value,
          isWsl: false,
          exists: false,
          isDirectory: false,
          alreadyRegistered: false,
        });
      }
    }, 400);
  }, []);

  const handleAddWorkspace = useCallback(async () => {
    if (!wsAddPath.trim() || wsAdding) return;
    setWsAdding(true);
    try {
      const currentUserRoots = wsWorkspaces
        .filter((workspace: LocalWorkspace) => !workspace.isPinned)
        .map((workspace: LocalWorkspace) => workspace.path);
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
      setWsValidation({
        valid: false,
        error: "Failed to add workspace",
        resolvedPath: "",
        originalPath: wsAddPath,
        isWsl: false,
        exists: false,
        isDirectory: false,
        alreadyRegistered: false,
      });
    } finally {
      setWsAdding(false);
    }
  }, [wsAddPath, wsAdding, wsWorkspaces, refreshWorkspaces]);

  const handleRemoveWorkspace = useCallback(
    async (pathToRemove: string) => {
      try {
        const remainingUserRoots = wsWorkspaces
          .filter(
            (workspace: LocalWorkspace) =>
              !workspace.isPinned && workspace.path !== pathToRemove,
          )
          .map((workspace: LocalWorkspace) => workspace.path);
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
    setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
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
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleResetSecurity = useCallback(async () => {
    if (!defaults?.security) return;
    const updated = { security: { ...(defaults?.security || {}) } };
    setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
    await persistSettings(updated);
  }, [defaults, persistSettings]);

  const handleImageModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        creative: {
          ...settings?.creative,
          imageProvider: provider || "",
          imageModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleVisionModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        creative: {
          ...settings?.creative,
          visionProvider: provider || "",
          visionModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleResetCreative = useCallback(async () => {
    if (!defaults?.creative) return;
    const updated = {
      creative: {
        ...settings?.creative,
        imageProvider: defaults.creative.imageProvider || "google",
        imageModel:
          defaults.creative.imageModel || "gemini-3-pro-image-preview",
        visionProvider: defaults.creative.visionProvider || "google",
        visionModel: defaults.creative.visionModel || "gemini-3.5-flash",
      },
    };
    setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
    await persistSettings(updated);
  }, [settings, defaults, persistSettings]);

  const handleTextToSpeechModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        creative: {
          ...settings?.creative,
          textToSpeechProvider: provider || "",
          textToSpeechModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleSpeechToTextModelSelect = useCallback(
    (provider: string, model: string) => {
      const updated = {
        creative: {
          ...settings?.creative,
          speechToTextProvider: provider || "",
          speechToTextModel: model || "",
        },
      };
      setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
      persistSettings(updated);
    },
    [settings, persistSettings],
  );

  const handleResetAudio = useCallback(async () => {
    if (!defaults?.creative) return;
    const updated = {
      creative: {
        ...settings?.creative,
        textToSpeechProvider:
          defaults.creative.textToSpeechProvider || "elevenlabs",
        textToSpeechModel: defaults.creative.textToSpeechModel || "",
        speechToTextProvider:
          defaults.creative.speechToTextProvider || "openai",
        speechToTextModel: defaults.creative.speechToTextModel || "",
      },
    };
    setSettings((state: PrismSettings | null) => ({ ...state, ...updated }));
    await persistSettings(updated);
  }, [settings, defaults, persistSettings]);

  // -- MCP servers refresh --------------------------------------------
  const loadMCPServers = useCallback(async () => {
    try {
      const servers = await PrismService.getMCPServers();
      setMcpServers(servers);
    } catch (error: unknown) {
      console.error("Failed to load MCP servers:", error);
    }
  }, []);

  // -- Derived workspace data -----------------------------------------
  const localStaticRoots = wsWorkspaces.filter(
    (workspace: LocalWorkspace) =>
      workspace.isPinned &&
      !workspace.isAgentServed &&
      workspace.path !== "/workspace",
  );
  const userRoots = wsWorkspaces.filter(
    (workspace: LocalWorkspace) =>
      !workspace.isPinned && !workspace.isAgentServed,
  );
  const agentServedRoots = wsWorkspaces.filter(
    (workspace: LocalWorkspace) => workspace.isAgentServed,
  );

  const findAgentForRoot = (rootPath: string): LocalAgent | undefined => {
    return wsAgents.find((agent: LocalAgent) =>
      agent.roots?.some((agentRoot) => {
        const agentRootPath =
          typeof agentRoot === "string" ? agentRoot : agentRoot.path;
        return (
          rootPath.startsWith(agentRootPath + "/") || rootPath === agentRootPath
        );
      }),
    );
  };

  const formatMemorySize = (totalBytes: number): string => {
    const gigabytes = totalBytes / 1024 ** 3;
    return gigabytes >= 1
      ? `${gigabytes.toFixed(gigabytes >= 10 ? 0 : 1)} GB`
      : `${(totalBytes / 1024 ** 2).toFixed(0)} MB`;
  };

  const formatPlatformLabel = (hostInfo: HostInfo): string => {
    const platformLabels: Record<string, string> = {
      win32: "Windows",
      darwin: "macOS",
      linux: "Linux",
      freebsd: "FreeBSD",
    };
    const platformLabel =
      platformLabels[hostInfo.platform || ""] || hostInfo.platform || "Unknown";
    return hostInfo.arch ? `${platformLabel} ${hostInfo.arch}` : platformLabel;
  };

  // -- Loading state --------------------------------------------------
  if (!config || !settings) {
    return (
      <div className={styles["container"]}>
        <div className={styles["header"]}>
          <div className={styles["header-left"]}>
            <h1 className={styles["title"]}>
              <Settings className={styles["title-icon"]} size={22} />
              Settings
            </h1>
            <p className={styles["subtitle"]}>
              Configure system-wide preferences
            </p>
          </div>
        </div>
        <div className={styles["is-loading-state"]}>
          <PanelLoadingSpinner size="medium" />
        </div>
      </div>
    );
  }

  const memorySettings = settings?.memory || {} || {};
  const agentDefaults = settings?.agents || {} || {};
  const creativeSettings = settings?.creative || {} || {};
  const somaticSettings = settings?.somatic || {};
  const hasAgents = wsAgents.length > 0;
  const hasAnyWorkspaces = wsWorkspaces.length > 0;

  return (
    <div className={`settings-page-component ${styles["container"]}`}>
      <div className={styles["header"]}>
        <div className={styles["header-left"]}>
          <h1 className={styles["title"]}>
            <Settings className={styles["title-icon"]} size={22} />
            Settings
          </h1>
          <p className={styles["subtitle"]}>
            Configure system-wide preferences
          </p>
        </div>
        <div className={styles["header-right"]}>
          <span
            className={`${styles["saved-indicator"]} ${saved ? styles["is-visible-state"] : ""}`}
          >
            <Check size={14} />
            Saved
          </span>
        </div>
      </div>

      {/* -- Memory Models Section ------------------------------------ */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="memory-models"
      >
        <CardComponent.Header
          icon={Brain}
          title="Memory Models"
          subtitle="Models used for memory extraction, consolidation, and embedding"
        />

        <CardComponent.Body>
          {/* Extraction Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Extraction Model</span>
              <span className={styles["layout-row-description"]}>
                Extracts personal facts and knowledge from conversations
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
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
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Consolidation Model</span>
              <span className={styles["layout-row-description"]}>
                Merges, deduplicates, and prunes stored memories
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
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
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Embedding Model</span>
              <span className={styles["layout-row-description"]}>
                Generates vector embeddings for semantic memory search
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
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

      {/* -- Emotion Models Section ----------------------------------- */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="emotion-models"
      >
        <CardComponent.Header
          icon={Heart}
          title="Emotion Models"
          subtitle="Model used for somatic state emotion analysis on incoming messages"
        />

        <CardComponent.Body>
          {/* Emotion Analysis Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>
                Emotion Analysis Model
              </span>
              <span className={styles["layout-row-description"]}>
                Classifies user message emotion to drive the agent&apos;s
                somatic state (Plutchik wheel). Runs on every incoming message
                for agents with somatic state enabled.
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: somaticSettings.emotionProvider || "",
                  model: somaticSettings.emotionModel || "",
                }}
                onSelectModel={handleEmotionModelSelect}
                modelTypeFilter="conversation"
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
            onClick={handleResetSomatic}
            disabled={saving}
          >
            Reset to Defaults
          </ButtonComponent>
        </CardComponent.Footer>
      </CardComponent>

      {/* -- Creative Models Section ------------------------------------ */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="creative-models"
      >
        <CardComponent.Header
          icon={Palette}
          title="Creative Models"
          subtitle="Models used for image generation and image description"
        />

        <CardComponent.Body>
          {/* Image Generation Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>
                Image Generation Model
              </span>
              <span className={styles["layout-row-description"]}>
                Model used by the{" "}
                <ToolLinkComponent toolName="generate_image" /> tool to create
                native illustrations
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: creativeSettings.imageProvider || "",
                  model: creativeSettings.imageModel || "",
                }}
                onSelectModel={handleImageModelSelect}
                modelTypeFilter="image"
                allowDeselect
              />
            </div>
          </div>

          {/* Image Description (Vision) Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Vision Model</span>
              <span className={styles["layout-row-description"]}>
                Model used by the{" "}
                <ToolLinkComponent toolName="describe_image" /> tool to analyze
                user-attached or reference images
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: creativeSettings.visionProvider || "",
                  model: creativeSettings.visionModel || "",
                }}
                onSelectModel={handleVisionModelSelect}
                modelTypeFilter="conversation"
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
            onClick={handleResetCreative}
            disabled={saving}
          >
            Reset to Defaults
          </ButtonComponent>
        </CardComponent.Footer>
      </CardComponent>

      {/* -- Audio Models Section -------------------------------------- */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="audio-models"
      >
        <CardComponent.Header
          icon={Volume2}
          title="Audio Models"
          subtitle="Models used for speech synthesis (text-to-speech) and transcription (speech-to-text)"
        />

        <CardComponent.Body>
          {/* Text-to-Speech Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>
                Speech Synthesis Model
              </span>
              <span className={styles["layout-row-description"]}>
                Model used by the{" "}
                <ToolLinkComponent toolName="synthesize_speech" /> tool to
                generate audio files from written text
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: creativeSettings.textToSpeechProvider || "",
                  model: creativeSettings.textToSpeechModel || "",
                }}
                onSelectModel={handleTextToSpeechModelSelect}
                modelTypeFilter="tts"
                allowDeselect
              />
            </div>
          </div>

          {/* Speech-to-Text (Transcription) Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Transcription Model</span>
              <span className={styles["layout-row-description"]}>
                Model used by the{" "}
                <ToolLinkComponent toolName="transcribe_audio" /> tool to
                transcribe spoken audio recordings into text
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: creativeSettings.speechToTextProvider || "",
                  model: creativeSettings.speechToTextModel || "",
                }}
                onSelectModel={handleSpeechToTextModelSelect}
                modelTypeFilter="transcribe"
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
            onClick={handleResetAudio}
            disabled={saving}
          >
            Reset to Defaults
          </ButtonComponent>
        </CardComponent.Footer>
      </CardComponent>

      {/* -- Harness Models Section ------------------------------------ */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="harness-models"
      >
        <CardComponent.Header
          icon={Workflow}
          title="Harness Models"
          subtitle="Models used by the agentic harness for sub-agents and critic safety gates"
        />

        <CardComponent.Body>
          {/* Sub-Agent Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Sub-Agent Model</span>
              <span className={styles["layout-row-description"]}>
                Pick a default sub-agent model for Prism to use when it spawns
                sub-agents. If not set, it will use the current active model.
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: agentDefaults.subAgentProvider || "",
                  model: agentDefaults.subAgentModel || "",
                }}
                onSelectModel={handleSubagentModelSelect}
                modelTypeFilter="conversation"
                allowDeselect
                placeholderLabel="Uses agent model"
              />
            </div>
          </div>

          {/* Critic Gate Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Critic Gate Model</span>
              <span className={styles["layout-row-description"]}>
                A fast reviewer model that evaluates dangerous tool calls before
                execution. When set, high-risk actions (shell, code execution)
                are reviewed by this model for safety before running. Leave
                empty to disable the critic gate entirely.
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: agentDefaults.criticProvider || "",
                  model: agentDefaults.criticModel || "",
                }}
                onSelectModel={handleCriticModelSelect}
                modelTypeFilter="conversation"
                allowDeselect
                placeholderLabel="Disabled"
              />
            </div>
          </div>

          {/* System Reminder Model */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>System Reminder Model</span>
              <span className={styles["layout-row-description"]}>
                Distills the system prompt into key behavioral constraints and
                re-injects them periodically to counteract instruction fade-out
                on long conversations. When set, runs a one-time extraction on the
                first reminder interval. Leave empty to disable.
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ModelPickerPopoverComponent
                config={config}
                settings={{
                  provider: agentDefaults.reminderProvider || "",
                  model: agentDefaults.reminderModel || "",
                }}
                onSelectModel={handleReminderModelSelect}
                modelTypeFilter="conversation"
                allowDeselect
                placeholderLabel="Disabled"
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

      {/* -- Agent Defaults Section ----------------------------------- */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="agent-defaults"
      >
        <CardComponent.Header
          icon={Network}
          title="Agent Defaults"
          subtitle="Execution strategy and coordination settings for the agent loop"
        />

        <CardComponent.Body>
          {/* Harness Selector */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Agentic Harness</span>
              <span className={styles["layout-row-description"]}>
                The execution strategy used by the agent loop. Different
                harnesses define how the model interacts with tools.
              </span>
            </div>
          </div>
          <div className={styles["harness-grid"]}>
            {harnesses
              .filter((handler: AgenticHarness) => handler.id === "standard")
              .map((handler: AgenticHarness) => {
                const isActive = (agentDefaults.harness || "standard") === handler.id;
              return (
                <button
                  key={handler.id}
                  className={`${styles["harness-card"]} ${isActive ? styles["harness-is-active-state"] : ""}`}
                  onClick={() => handleHarnessSelect(handler.id)}
                >
                  <div className={styles["harness-card-header"]}>
                    <Cpu size={16} className={styles["harness-icon"]} />
                    <span className={styles["harness-label"]}>{handler.label}</span>
                    {isActive && (
                      <span className={styles["harness-badge"]}>Current</span>
                    )}
                  </div>
                  <span className={styles["harness-description"]}>
                    {handler.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles["harness-divider"]} />

          {/* Thought Structure */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Thought Structure</span>
              <span className={styles["layout-row-description"]}>
                Controls how the agent reasons within each iteration. Chain of
                Thought uses sequential single-pass reasoning. Tree of Thoughts
                generates parallel branches, scores them, and backtracks on
                failure.
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <SelectComponent
                value={(agentDefaults.thoughtStructure as string) || "chain_of_thought"}
                options={buildThoughtStructureOptions()}
                onChange={handleThoughtStructureSelect}
              />
            </div>
          </div>

          <div className={styles["harness-divider"]} />

          {/* Subagent Topology */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>Subagent Topology</span>
              <span className={styles["layout-row-description"]}>
                Defines how sub-agents coordinate. Each topology maps to a
                thought structure: Chain of Thought (sequential, hierarchical),
                Graph of Thoughts (aggregation), DAG mesh (peer-to-peer),
                Best-of-N (tournament), Actor-Critic (critic loop),
                task decomposition (divide &amp; conquer), or iterative
                tree search (MCTS).
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <SelectComponent
                value={agentDefaults.topology || "hierarchical"}
                options={buildTopologyOptions()}
                onChange={handleTopologySelect}
              />
            </div>
          </div>

          <div className={styles["harness-divider"]} />

          {/* Dynamic Tool Activation */}
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>
                Dynamic Tool Activation
              </span>
              <span className={styles["layout-row-description"]}>
                Allow the agent to discover, enable, and disable tools
                mid-conversation using{" "}
                <ToolLinkComponent toolName="search_tools" />,{" "}
                <ToolLinkComponent toolName="enable_tools" />,{" "}
                <ToolLinkComponent toolName="disable_tools" />, and{" "}
                <ToolLinkComponent toolName="discover_and_enable_tools" />.
                This reduces token usage and tool interference by loading only
                the tools the agent needs for the current task.
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ToggleComponent
                checked={agentDefaults.dynamicToolActivation ?? true}
                onChange={(checked: boolean) => {
                  const updated = {
                    agents: {
                      ...settings?.agents,
                      dynamicToolActivation: checked,
                    },
                  };
                  setSettings((state: PrismSettings | null) => ({
                    ...state,
                    ...updated,
                  }));
                  persistSettings(updated);
                }}
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
            onClick={handleResetAgents}
            disabled={saving}
          >
            Reset to Defaults
          </ButtonComponent>
        </CardComponent.Footer>
      </CardComponent>

      {/* -- Workspaces Section ---------------------------------------- */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="workspaces"
      >
        <CardComponent.Header
          icon={FolderOpen}
          title="Workspaces"
          subtitle="Directories accessible to the agent for file operations"
        />

        <CardComponent.Body>
          {/* Agent status banner */}
          <div className={styles["agent-status-banner"]}>
            <div
              className={`${styles["agent-status-dot"]} ${hasAgents ? styles["connected"] : styles["disconnected"]}`}
            />
            <span className={styles["agent-status-text"]}>
              {hasAgents ? (
                <>
                  <strong>{wsAgents.length}</strong> workspace agent
                  {wsAgents.length !== 1 ? "s" : ""} connected
                </>
              ) : (
                "No workspace agents connected"
              )}
            </span>
            <span className={styles["agent-status-meta"]}>
              {wsWorkspaces.length} root{wsWorkspaces.length !== 1 ? "s" : ""}{" "}
              total
            </span>
          </div>

          {/* Connected Agents */}
          {hasAgents && (
            <>
              <div className={styles["section-label"]}>
                <Server size={10} />
                Remote Agents
              </div>
              {wsAgents.map((agent: LocalAgent) => (
                <div key={agent.id} className={styles["agent-card"]}>
                  <div className={styles["agent-card-header"]}>
                    <div className={styles["agent-icon"]}>
                      <Wifi size={16} />
                    </div>
                    <div className={styles["agent-info"]}>
                      <div className={styles["agent-name-layout-row"]}>
                        <span className={styles["agent-name"]}>
                          {agent.hostInfo?.hostname || agent.name}
                        </span>
                        {agent.version && (
                          <span className={styles["agent-version"]}>
                            v{agent.version}
                          </span>
                        )}
                      </div>
                      <div className={styles["agent-meta"]}>
                        <span className={styles["agent-meta-item"]}>
                          {agent.clientIp}
                        </span>
                        {agent.hostInfo?.platform && (
                          <>
                            <span className={styles["agent-meta-separator"]} />
                            <span className={styles["agent-meta-item"]}>
                              {formatPlatformLabel(agent.hostInfo)}
                            </span>
                          </>
                        )}
                        <span className={styles["agent-meta-separator"]} />
                        {agent.connectedAt && (
                          <span className={styles["agent-meta-item"]}>
                            up {formatUptime(agent.connectedAt)}
                          </span>
                        )}
                        {(agent.pendingRpcs ?? 0) > 0 && (
                          <>
                            <span className={styles["agent-meta-separator"]} />
                            <span className={styles["agent-meta-item"]}>
                              {agent.pendingRpcs} pending
                            </span>
                          </>
                        )}
                      </div>
                      {agent.hostInfo && (
                        <div className={styles["workspace-host-info"]}>
                          {agent.hostInfo.username && (
                            <span className={styles["host-info-tag"]}>
                              {agent.hostInfo.username}
                            </span>
                          )}
                          {agent.hostInfo.cpuModel && (
                            <span className={styles["host-info-tag"]}>
                              <Cpu size={9} />
                              {agent.hostInfo.cpuModel}
                              {agent.hostInfo.cpuCores
                                ? ` (${agent.hostInfo.cpuCores}c)`
                                : ""}
                            </span>
                          )}
                          {agent.hostInfo.totalMemoryBytes && (
                            <span className={styles["host-info-tag"]}>
                              <MemoryStick size={9} />
                              {formatMemorySize(
                                agent.hostInfo.totalMemoryBytes,
                              )}
                            </span>
                          )}
                          {agent.hostInfo.release && (
                            <span className={styles["host-info-tag"]}>
                              {agent.hostInfo.release}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={styles["agent-capabilities"]}>
                      {(agent.capabilities || []).map((cap: string) => (
                        <span key={cap} className={styles["capability-tag"]}>
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Roots served by this agent */}
                  {agent.roots && agent.roots.length > 0 && (
                    <div className={styles["agent-roots"]}>
                      {agent.roots.map(
                        (root: { path: string; isAgentServed?: boolean }) => (
                          <div
                            key={root.path}
                            className={styles["agent-root-item"]}
                          >
                            <FolderOpen size={13} />
                            {root.path}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Agent-served workspace roots (managed by connected agents) */}
          {agentServedRoots.length > 0 && (
            <>
              <div className={styles["workspace-divider"]} />
              <div className={styles["section-label"]}>
                <FolderTree size={10} />
                Agent Workspaces
              </div>
              {agentServedRoots.map((workspace: LocalWorkspace) => {
                const servingAgent = findAgentForRoot(workspace.path);
                const hostInfo = servingAgent?.hostInfo;
                return (
                  <div key={workspace.id} className={styles["workspace-item"]}>
                    <div className={styles["workspace-item-info"]}>
                      <FolderOpen
                        size={16}
                        className={styles["workspace-item-icon"]}
                      />
                      <div className={styles["workspace-item-details"]}>
                        <span className={styles["workspace-item-name"]}>
                          {workspace.name}
                          <span className={styles["static-badge"]}>
                            <Wifi size={8} />
                            Agent
                          </span>
                        </span>
                        <span className={styles["workspace-item-path"]}>
                          {workspace.path}
                        </span>
                        {hostInfo && (
                          <div className={styles["workspace-host-info"]}>
                            {hostInfo.hostname && (
                              <span className={styles["host-info-tag"]}>
                                <Monitor size={9} />
                                {hostInfo.hostname}
                              </span>
                            )}
                            {hostInfo.platform && (
                              <span className={styles["host-info-tag"]}>
                                <HardDrive size={9} />
                                {formatPlatformLabel(hostInfo)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Local static roots (from env config, not agent-served) */}
          {localStaticRoots.length > 0 && (
            <>
              <div className={styles["workspace-divider"]} />
              <div className={styles["section-label"]}>
                <Settings2 size={10} />
                Static Roots
              </div>
              {localStaticRoots.map((ws: LocalWorkspace) => (
                <div key={ws.id} className={styles["workspace-item"]}>
                  <div className={styles["workspace-item-info"]}>
                    <FolderOpen
                      size={16}
                      className={styles["workspace-item-icon"]}
                    />
                    <div className={styles["workspace-item-details"]}>
                      <span className={styles["workspace-item-name"]}>
                        {ws.name}
                        <span className={styles["static-badge"]}>
                          <Lock size={8} />
                          Static
                        </span>
                      </span>
                      <span className={styles["workspace-item-path"]}>
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
              <div className={styles["workspace-divider"]} />
              <div className={styles["section-label"]}>
                <FolderOpen size={10} />
                User Workspaces
              </div>
              {userRoots.map((ws: LocalWorkspace) => {
                const servingAgent = findAgentForRoot(ws.path);
                const hostInfo = servingAgent?.hostInfo;
                return (
                  <div key={ws.id} className={styles["workspace-item"]}>
                    <div className={styles["workspace-item-info"]}>
                      <FolderOpen
                        size={16}
                        className={styles["workspace-item-icon"]}
                      />
                      <div className={styles["workspace-item-details"]}>
                        <span className={styles["workspace-item-name"]}>
                          {ws.name}
                        </span>
                        <span className={styles["workspace-item-path"]}>
                          {ws.path}
                        </span>
                        {hostInfo && (
                          <div className={styles["workspace-host-info"]}>
                            {hostInfo.hostname && (
                              <span className={styles["host-info-tag"]}>
                                <Monitor size={9} />
                                {hostInfo.hostname}
                              </span>
                            )}
                            {hostInfo.platform && (
                              <span className={styles["host-info-tag"]}>
                                <HardDrive size={9} />
                                {formatPlatformLabel(hostInfo)}
                              </span>
                            )}
                            {hostInfo.username && (
                              <span className={styles["host-info-tag"]}>
                                {hostInfo.username}
                              </span>
                            )}
                            {hostInfo.cpuModel && (
                              <span className={styles["host-info-tag"]}>
                                <Cpu size={9} />
                                {hostInfo.cpuModel}
                                {hostInfo.cpuCores
                                  ? ` (${hostInfo.cpuCores}c)`
                                  : ""}
                              </span>
                            )}
                            {hostInfo.totalMemoryBytes && (
                              <span className={styles["host-info-tag"]}>
                                <MemoryStick size={9} />
                                {formatMemorySize(hostInfo.totalMemoryBytes)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      className={styles["remove-button"]}
                      onClick={() => handleRemoveWorkspace(ws.path)}
                      title="Remove workspace"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* Onboarding when nothing is configured */}
          {!hasAnyWorkspaces && !hasAgents && (
            <div className={styles["onboarding-card"]}>
              <WifiOff
                size={24}
                style={{ color: "var(--text-muted)", margin: "0 auto" }}
              />
              <span className={styles["onboarding-title"]}>
                No workspaces configured
              </span>
              <span className={styles["onboarding-description"]}>
                Deploy the{" "}
                <span className={styles["onboarding-code"]}>
                  workspace-service
                </span>{" "}
                on a device to give the agent remote file, git, and shell
                access. Or add a local workspace path below.
              </span>
            </div>
          )}

          {/* Add workspace input */}
          <div className={styles["add-workspace-layout-row"]}>
            <InputComponent
              type="text"
              className={`${wsValidation ? (wsValidation.valid ? styles["valid"] : styles["invalid"]) : ""}`}
              placeholder="Add workspace path (e.g. /home/user/projects or C:\Users\...)"
              value={wsAddPath}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleWsPathChange(e.target.value)
              }
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter" && wsValidation?.valid)
                  handleAddWorkspace();
              }}
            />
            <button
              className={styles["add-button"]}
              disabled={!wsValidation?.valid || wsAdding}
              onClick={handleAddWorkspace}
            >
              <Plus size={14} />
              Add
            </button>
          </div>

          {/* Validation feedback */}
          {wsAddPath.trim() && wsValidation && (
            <div
              className={`${styles["validation-layout-row"]} ${wsValidation.valid ? styles["success"] : styles["error"]}`}
            >
              {wsValidation.valid ? (
                <>
                  <CheckCircle2 size={12} /> Valid directory
                </>
              ) : (
                <>
                  <XCircle size={12} /> {wsValidation.error}
                </>
              )}
            </div>
          )}

          {/* Windows → WSL translation preview */}
          {wsAddPath.trim() && isWindowsPath(wsAddPath.trim()) && (
            <div className={`${styles["validation-layout-row"]} ${styles["info"]}`}>
              <ArrowRight size={12} />
              <span>Translates to: </span>
              <span className={styles["wsl-translation"]}>
                {windowsToWslPreview(wsAddPath.trim())}
              </span>
            </div>
          )}

          {/* -- Workspace Setup Guide ------------------------------- */}
          <div className={styles["setup-guide"]}>
            <div className={styles["setup-guide-header"]}>
              <span className={styles["setup-guide-title"]}>
                Workspace Setup Guide
              </span>
              <span className={styles["setup-guide-subtitle"]}>
                Connect a workspace agent to give Prism file, git, and shell
                access
              </span>
            </div>

            {/* Desktop App — one-click standalone executable */}
            <button
              className={`${styles["guide-toggle"]} ${expandedGuide === "desktop" ? styles["guide-expanded"] : ""}`}
              onClick={() =>
                setExpandedGuide(expandedGuide === "desktop" ? null : "desktop")
              }
            >
              <Monitor size={16} className={styles["guide-toggle-icon"]} />
              <div className={styles["guide-toggle-label"]}>
                <span className={styles["guide-toggle-title"]}>
                  Desktop App
                </span>
                <span className={styles["guide-toggle-hint"]}>
                  One-click standalone executable — no Node.js, no dependencies
                </span>
              </div>
              <ChevronRight size={14} className={styles["guide-chevron"]} />
            </button>

            {expandedGuide === "desktop" && (
              <div className={styles["guide-content"]}>
                <div className={styles["single-file-explainer"]}>
                  <div className={styles["single-file-explainer-icon"]}>
                    <Monitor size={20} />
                  </div>
                  <div className={styles["single-file-explainer-text"]}>
                    <span className={styles["single-file-explainer-headline"]}>
                      Pre-configured standalone executable
                    </span>
                    <span
                      className={styles["single-file-explainer-description"]}
                    >
                      Downloads a single binary with your backend URL and
                      credentials pre-baked. Just run it — no setup, no
                      dependencies, no Node.js required. Works on Windows,
                      macOS, and Linux.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>1</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Download for your platform
                    </span>
                    <div className={styles["platform-download-grid"]}>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentPlatformDownloadUrl(
                          "win-x64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            Windows
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            x64
                          </span>
                        </span>
                      </a>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Linux/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentPlatformDownloadUrl(
                          "linux-x64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            Linux
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            x64
                          </span>
                        </span>
                      </a>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) && !/arm|aarch/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentPlatformDownloadUrl(
                          "mac-x64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            macOS
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            Intel
                          </span>
                        </span>
                      </a>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) && /arm|aarch/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentPlatformDownloadUrl(
                          "mac-arm64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            macOS
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            Apple Silicon
                          </span>
                        </span>
                      </a>
                    </div>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>2</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Run it from your project directory
                    </span>
                    <div className={styles["code-block"]}>
                      <code>
                        {typeof navigator !== "undefined" &&
                        /Win/i.test(navigator.userAgent)
                          ? ".\\workspace-agent.exe --workspace C:\\path\\to\\project"
                          : "./workspace-agent --workspace /path/to/project"}
                      </code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            typeof navigator !== "undefined" &&
                              /Win/i.test(navigator.userAgent)
                              ? ".\\workspace-agent.exe --workspace C:\\path\\to\\project"
                              : "./workspace-agent --workspace /path/to/project",
                          );
                          setCopiedBlock("desktop-2");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
                          );
                        }}
                      >
                        {copiedBlock === "desktop-2" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    <span className={styles["step-hint"]}>
                      Backend URL and credentials are already compiled in. Just
                      point it at your workspace directory. On macOS/Linux, you
                      may need to{" "}
                      <code className={styles["inline-code"]}>
                        chmod +x workspace-agent
                      </code>{" "}
                      first.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>3</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Verify connection
                    </span>
                    <span className={styles["step-hint"]}>
                      Look for{" "}
                      <code className={styles["inline-code"]}>
                        Connected to ws://…
                      </code>{" "}
                      and{" "}
                      <code className={styles["inline-code"]}>
                        Server confirmed registration
                      </code>{" "}
                      in the output. The agent will appear in this settings
                      panel under Remote Agents.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* System Tray App — Electron-based with setup wizard */}
            <button
              className={`${styles["guide-toggle"]} ${expandedGuide === "tray" ? styles["guide-expanded"] : ""}`}
              onClick={() =>
                setExpandedGuide(expandedGuide === "tray" ? null : "tray")
              }
            >
              <AppWindow size={16} className={styles["guide-toggle-icon"]} />
              <div className={styles["guide-toggle-label"]}>
                <span className={styles["guide-toggle-title"]}>
                  System Tray App
                </span>
                <span className={styles["guide-toggle-hint"]}>
                  Installs to system tray with setup wizard — auto-launches on
                  login
                </span>
              </div>
              <ChevronRight size={14} className={styles["guide-chevron"]} />
            </button>

            {expandedGuide === "tray" && (
              <div className={styles["guide-content"]}>
                <div className={styles["single-file-explainer"]}>
                  <div className={styles["single-file-explainer-icon"]}>
                    <AppWindow size={20} />
                  </div>
                  <div className={styles["single-file-explainer-text"]}>
                    <span className={styles["single-file-explainer-headline"]}>
                      Always-on agent in your system tray
                    </span>
                    <span
                      className={styles["single-file-explainer-description"]}
                    >
                      A full desktop application that lives in your system tray.
                      Includes a setup wizard, settings panel, log viewer, and
                      auto-launch on login. Runs silently in the background — no
                      terminal window needed.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>1</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Download the installer
                    </span>
                    <div className={styles["platform-download-grid"]}>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentTrayAppDownloadUrl(
                          "win-x64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            Windows
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            Installer
                          </span>
                        </span>
                      </a>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) && !/arm|aarch/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentTrayAppDownloadUrl(
                          "mac-x64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            macOS
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            Intel
                          </span>
                        </span>
                      </a>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent) && /arm|aarch/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentTrayAppDownloadUrl(
                          "mac-arm64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            macOS
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            Apple Silicon
                          </span>
                        </span>
                      </a>
                      <a
                        className={`${styles["platform-download-button"]} ${typeof navigator !== "undefined" && /Linux/i.test(navigator.userAgent) ? styles["platform-recommended"] : ""}`}
                        href={PrismService.getWorkspaceAgentTrayAppDownloadUrl(
                          "linux-x64",
                        )}
                        download
                      >
                        <Download size={14} />
                        <span className={styles["platform-download-label"]}>
                          <span className={styles["platform-download-name"]}>
                            Linux
                          </span>
                          <span className={styles["platform-download-arch"]}>
                            AppImage
                          </span>
                        </span>
                      </a>
                    </div>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>2</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Run the installer
                    </span>
                    <span className={styles["step-hint"]}>
                      On Windows, run the installer — it installs to your user
                      profile and launches automatically. On macOS, open the DMG
                      and drag to Applications. On Linux, make the AppImage
                      executable and run it.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>3</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Complete the setup wizard
                    </span>
                    <span className={styles["step-hint"]}>
                      On first launch, the app opens a setup wizard where you
                      select your workspace directory. The backend URL and
                      credentials are pre-configured — just pick your folder and
                      click connect. The agent starts automatically and appears
                      in your system tray.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>4</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Verify connection
                    </span>
                    <span className={styles["step-hint"]}>
                      Right-click the system tray icon to see the connection
                      status. The agent will appear in this settings panel under
                      Remote Agents. Enable{" "}
                      <code className={styles["inline-code"]}>
                        Launch at login
                      </code>{" "}
                      in the tray menu to keep the agent running across
                      restarts.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Single-file download (simplest path) */}
            <button
              className={`${styles["guide-toggle"]} ${expandedGuide === "download" ? styles["guide-expanded"] : ""}`}
              onClick={() =>
                setExpandedGuide(
                  expandedGuide === "download" ? null : "download",
                )
              }
            >
              <Download size={16} className={styles["guide-toggle-icon"]} />
              <div className={styles["guide-toggle-label"]}>
                <span className={styles["guide-toggle-title"]}>
                  Single File
                </span>
                <span className={styles["guide-toggle-hint"]}>
                  Download one file, run it anywhere — zero dependencies except
                  Node.js 22+
                </span>
              </div>
              <ChevronRight size={14} className={styles["guide-chevron"]} />
            </button>

            {expandedGuide === "download" && (
              <div className={styles["guide-content"]}>
                <div className={styles["single-file-explainer"]}>
                  <div className={styles["single-file-explainer-icon"]}>
                    <HardDrive size={20} />
                  </div>
                  <div className={styles["single-file-explainer-text"]}>
                    <span className={styles["single-file-explainer-headline"]}>
                      Connect your local machine to Prism
                    </span>
                    <span
                      className={styles["single-file-explainer-description"]}
                    >
                      The Workspace Agent is a single file that bridges your
                      local project files to Prism&apos;s AI tools over
                      WebSocket. Nothing is uploaded — all file access stays on
                      your device. Works on Windows, macOS, and Linux.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>1</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Download the agent
                    </span>
                    <a
                      className={styles["single-file-download-button"]}
                      href={PrismService.getWorkspaceAgentDownloadUrl()}
                      download="workspace-agent.mjs"
                    >
                      <Download size={14} />
                      workspace-agent.mjs
                    </a>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>2</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Run it from your terminal
                    </span>
                    <div className={styles["code-block"]}>
                      <code>
                        node workspace-agent.mjs{"\n"}
                        {"  "}--backend ws://YOUR_SERVER:5590{"\n"}
                        {"  "}--workspace /path/to/your/project{"\n"}
                        {"  "}--secret YOUR_API_SECRET
                      </code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "node workspace-agent.mjs \\\n  --backend ws://YOUR_SERVER:5590 \\\n  --workspace /path/to/your/project \\\n  --secret YOUR_API_SECRET",
                          );
                          setCopiedBlock("download-2");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
                          );
                        }}
                      >
                        {copiedBlock === "download-2" ? (
                          <CheckCheck size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                    <span className={styles["step-hint"]}>
                      Replace the backend URL, workspace path, and secret with
                      your own values. Leave the terminal running — the agent
                      reconnects automatically if interrupted.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>3</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Verify connection
                    </span>
                    <span className={styles["step-hint"]}>
                      Look for{" "}
                      <code className={styles["inline-code"]}>
                        Connected to ws://…
                      </code>{" "}
                      and{" "}
                      <code className={styles["inline-code"]}>
                        Server confirmed registration
                      </code>{" "}
                      in the output. The agent will appear in this settings
                      panel under Remote Agents.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Docker setup */}
            <button
              className={`${styles["guide-toggle"]} ${expandedGuide === "docker" ? styles["guide-expanded"] : ""}`}
              onClick={() =>
                setExpandedGuide(expandedGuide === "docker" ? null : "docker")
              }
            >
              <Container size={16} className={styles["guide-toggle-icon"]} />
              <div className={styles["guide-toggle-label"]}>
                <span className={styles["guide-toggle-title"]}>Docker</span>
                <span className={styles["guide-toggle-hint"]}>
                  Headless servers, NAS, always-on deployments
                </span>
              </div>
              <ChevronRight size={14} className={styles["guide-chevron"]} />
            </button>

            {expandedGuide === "docker" && (
              <div className={styles["guide-content"]}>
                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>1</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Clone the repository
                    </span>
                    <div className={styles["code-block"]}>
                      <code>
                        git clone
                        https://github.com/rodrigo-barraza/workspace-service.git
                        {"\n"}cd workspace-service
                      </code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "git clone https://github.com/rodrigo-barraza/workspace-service.git\ncd workspace-service",
                          );
                          setCopiedBlock("docker-1");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>2</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Create your{" "}
                      <code className={styles["inline-code"]}>.env</code> file
                    </span>
                    <div className={styles["code-block"]}>
                      <code>cp .env.example .env</code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("cp .env.example .env");
                          setCopiedBlock("docker-2");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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
                    <span className={styles["step-hint"]}>
                      Edit <code className={styles["inline-code"]}>.env</code>{" "}
                      and set your{" "}
                      <code className={styles["inline-code"]}>
                        WORKSPACE_SERVICE_SECRET
                      </code>{" "}
                      to match your tools-service agent secret.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>3</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Build and start the container
                    </span>
                    <div className={styles["code-block"]}>
                      <code>docker compose up -d</code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("docker compose up -d");
                          setCopiedBlock("docker-3");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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
                    <span className={styles["step-hint"]}>
                      The container exposes{" "}
                      <code className={styles["inline-code"]}>/workspace</code>{" "}
                      as the root. Mount your project directories via{" "}
                      <code className={styles["inline-code"]}>volumes</code> in{" "}
                      <code className={styles["inline-code"]}>
                        docker-compose.yml
                      </code>
                      .
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>4</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Verify connection
                    </span>
                    <div className={styles["code-block"]}>
                      <code>docker logs workspace-service</code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "docker logs workspace-service",
                          );
                          setCopiedBlock("docker-4");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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
                    <span className={styles["step-hint"]}>
                      Look for{" "}
                      <code className={styles["inline-code"]}>
                        Connected to ws://…
                      </code>{" "}
                      and{" "}
                      <code className={styles["inline-code"]}>
                        Server confirmed registration
                      </code>
                      .
                    </span>
                  </div>
                </div>

                <div className={styles["guide-env-table"]}>
                  <span className={styles["environment-table-title"]}>
                    Environment Variables
                  </span>
                  <div className={styles["environment-layout-row"]}>
                    <code className={styles["environment-key"]}>
                      WORKSPACE_BACKEND
                    </code>
                    <span className={styles["environment-description"]}>
                      WebSocket URL of tools-service (e.g.{" "}
                      <code className={styles["inline-code"]}>
                        ws://192.168.86.2:5590
                      </code>
                      )
                    </span>
                  </div>
                  <div className={styles["environment-layout-row"]}>
                    <code className={styles["environment-key"]}>
                      WORKSPACE_ROOTS
                    </code>
                    <span className={styles["environment-description"]}>
                      Comma-separated root directories (default:{" "}
                      <code className={styles["inline-code"]}>/workspace</code>)
                    </span>
                  </div>
                  <div className={styles["environment-layout-row"]}>
                    <code className={styles["environment-key"]}>
                      WORKSPACE_SERVICE_SECRET
                    </code>
                    <span className={styles["environment-description"]}>
                      Must match your tools-service agent secret
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Local (Node) setup */}
            <button
              className={`${styles["guide-toggle"]} ${expandedGuide === "local" ? styles["guide-expanded"] : ""}`}
              onClick={() =>
                setExpandedGuide(expandedGuide === "local" ? null : "local")
              }
            >
              <Terminal size={16} className={styles["guide-toggle-icon"]} />
              <div className={styles["guide-toggle-label"]}>
                <span className={styles["guide-toggle-title"]}>
                  Local (Node.js)
                </span>
                <span className={styles["guide-toggle-hint"]}>
                  WSL2, Linux, macOS — native filesystem performance
                </span>
              </div>
              <ChevronRight size={14} className={styles["guide-chevron"]} />
            </button>

            {expandedGuide === "local" && (
              <div className={styles["guide-content"]}>
                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>1</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Clone and install dependencies
                    </span>
                    <div className={styles["code-block"]}>
                      <code>
                        git clone
                        https://github.com/rodrigo-barraza/workspace-service.git
                        {"\n"}cd workspace-service{"\n"}npm install
                      </code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "git clone https://github.com/rodrigo-barraza/workspace-service.git\ncd workspace-service\nnpm install",
                          );
                          setCopiedBlock("local-1");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>2</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Create your{" "}
                      <code className={styles["inline-code"]}>.env</code> file
                    </span>
                    <div className={styles["code-block"]}>
                      <code>cp .env.example .env</code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("cp .env.example .env");
                          setCopiedBlock("local-2");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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
                    <span className={styles["step-hint"]}>
                      Fill in your values:
                    </span>
                    <div className={styles["code-block"]}>
                      <code>
                        WORKSPACE_BACKEND=ws://192.168.86.2:5590{"\n"}
                        WORKSPACE_ROOTS=/home/you/development{"\n"}
                        WORKSPACE_SERVICE_SECRET=your-agent-secret
                      </code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            "WORKSPACE_BACKEND=ws://192.168.86.2:5590\nWORKSPACE_ROOTS=/home/you/development\nWORKSPACE_SERVICE_SECRET=your-agent-secret",
                          );
                          setCopiedBlock("local-2b");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>3</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Start the service
                    </span>
                    <div className={styles["code-block"]}>
                      <code>npm run dev:local</code>
                      <button
                        className={styles["copy-button"]}
                        title="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText("npm run dev:local");
                          setCopiedBlock("local-3");
                          setTimeout(
                            () => setCopiedBlock(null),
                            FEEDBACK_STANDARD_MILLISECONDS,
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
                    <span className={styles["step-hint"]}>
                      This loads{" "}
                      <code className={styles["inline-code"]}>.env</code>{" "}
                      automatically and starts with file-watch reload. You can
                      also pass env vars inline or use CLI flags — see the
                      README for details.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-step"]}>
                  <span className={styles["step-number"]}>4</span>
                  <div className={styles["step-body"]}>
                    <span className={styles["step-title"]}>
                      Verify connection
                    </span>
                    <span className={styles["step-hint"]}>
                      Look for{" "}
                      <code className={styles["inline-code"]}>
                        Connected to ws://…
                      </code>{" "}
                      and{" "}
                      <code className={styles["inline-code"]}>
                        Server confirmed registration
                      </code>{" "}
                      in the output. The agent will appear in this settings
                      panel under Remote Agents.
                    </span>
                  </div>
                </div>

                <div className={styles["guide-compare-table"]}>
                  <span className={styles["environment-table-title"]}>
                    Docker vs. Local
                  </span>
                  <div className={styles["compare-layout-row"]}>
                    <span className={styles["compare-label"]}>Filesystem</span>
                    <span className={styles["compare-docker"]}>
                      Volume-mounted
                    </span>
                    <span className={styles["compare-local"]}>
                      Native — no mount overhead
                    </span>
                  </div>
                  <div className={styles["compare-layout-row"]}>
                    <span className={styles["compare-label"]}>Performance</span>
                    <span className={styles["compare-docker"]}>
                      Container + I/O
                    </span>
                    <span className={styles["compare-local"]}>
                      Faster grep, glob, git
                    </span>
                  </div>
                  <div className={styles["compare-layout-row"]}>
                    <span className={styles["compare-label"]}>Git / Shell</span>
                    <span className={styles["compare-docker"]}>
                      Inside container
                    </span>
                    <span className={styles["compare-local"]}>
                      Host environment
                    </span>
                  </div>
                  <div className={styles["compare-layout-row"]}>
                    <span className={styles["compare-label"]}>Use case</span>
                    <span className={styles["compare-docker"]}>
                      Servers, NAS
                    </span>
                    <span className={styles["compare-local"]}>
                      Dev machines, WSL2
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className={styles["guide-footnote"]}>
              <span>
                Multiple agents can run simultaneously — each registers with a
                unique ID and routes automatically.
              </span>
            </div>
          </div>
        </CardComponent.Body>
      </CardComponent>

      {/* -- Security & Sandboxing Section ---------------------------- */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="security-sandboxing"
      >
        <CardComponent.Header
          icon={Lock}
          title="Security & Sandboxing"
          subtitle="Configure file system policies, environment variable isolation, and credentials access"
        />

        <CardComponent.Body>
          <div className={styles["settings-layout-row"]}>
            <div className={styles["layout-row-label"]}>
              <span className={styles["layout-row-title"]}>
                Allow `.env` & Sensitive Files Access
              </span>
              <span className={styles["layout-row-description"]}>
                Allow the agent to view, search, or edit `.env` environment
                configurations, `.pem` certificates, `.key` private keys, and
                SSH credentials inside the workspace. When disabled, these files
                are strictly isolated from the agent's file tools to prevent
                credential leakage.
              </span>
            </div>
            <div className={styles["layout-row-control"]}>
              <ToggleComponent
                checked={settings?.security?.allowEnvFiles ?? false}
                onChange={(checked: boolean) =>
                  handleSecurityToggle("allowEnvFiles", checked)
                }
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

      {/* -- MCP Servers Section ---------------------------------------- */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="mcp-servers"
      >
        <CardComponent.Header
          icon={Plug}
          title="MCP Servers"
          subtitle="Connect external tool providers via the Model Context Protocol"
        />

        <MCPServersPanel
          servers={mcpServers}
          onServersChange={loadMCPServers}
        />
      </CardComponent>

      {/* -- Custom Themes Section ------------------------------------ */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="custom-themes"
      >
        <CardComponent.Header
          icon={Palette}
          title="Custom Themes"
          subtitle="Create, edit, and manage your own color themes"
        />

        <CardComponent.Body>
          <CustomThemeEditorComponent />
        </CardComponent.Body>
      </CardComponent>

      {/* -- Avatar Selection Section --------------------------------- */}
      <CardComponent
        className={styles["section"]}
        data-settings-section="avatar-selection"
      >
        <CardComponent.Header
          icon={Palette}
          title="Avatar Selection"
          subtitle="Choose the static avatar image displayed next to the navigation bar"
        />

        <CardComponent.Body>
          <AvatarSelectorComponent />
        </CardComponent.Body>
      </CardComponent>
    </div>
  );
}
