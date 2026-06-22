"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Bot,
  Wrench,
  FolderTree,
  BookOpen,
  AlertCircle,
  Globe2,
  Code2,
  ImageIcon,
  Skull,
  Sticker,
  Apple,
  Lightbulb,
  Flame,
  Zap,
  Shield,
  Swords,
  Palette,
  Music,
  Gamepad2,
  Camera,
  Telescope,
  Rocket,
  Atom,
  Brain,
  GraduationCap,
  Briefcase,
  Hammer,
  Microscope,
  Leaf,
  Dog,
  Cat,
  Bird,
  Bug,
  Fish,
  Crown,
  Gem,
  Star,
  Moon,
  Sun,
  Mountain,
  Anchor,
  Compass,
  Crosshair,
  Target,
  Trophy,
  Medal,
  Dumbbell,
  HeartPulse,
  Coffee,
  UtensilsCrossed,
  Wine,
  Cake,
  Paintbrush,
  Pen,
  Wand2,
  Hexagon,
  CircuitBoard,
  Cog,
  FlaskConical,
  Cpu,
  Sparkles,
  Heart,
  Upload,
} from "lucide-react";
import ImageCropperComponent from "./ImageCropperComponent";
import PrismService from "../services/PrismService";
import {
  ButtonComponent,
  ToggleComponent,
  InputComponent,
  TextAreaComponent,
  SelectComponent,
} from "@rodrigo-barraza/components-library";
import BadgeComponent from "./BadgeComponent";
import ToolSelectionComponent from "./ToolSelectionComponent";
import { useWorkspace } from "./WorkspaceContextComponent";
import { getErrorMessage } from "../utils/errorMessage";
import { deriveAgentId } from "@rodrigo-barraza/utilities-library";
import styles from "./CustomAgentsPanelComponent.module.css";
import type { LucideIcon } from "lucide-react";
import type { CustomAgent, SerializedPolicy } from "../types/types";

/** Extended agent shape used during editing — includes form fields
 *  that are sent to the backend but not defined on the shared CustomAgent type. */
interface EditableAgent extends CustomAgent {
  identity?: string;
  guidelines?: string;
  toolPolicy?: string;
  usesDirectoryTree?: boolean;
  usesCodingGuidelines?: boolean;
  policies?: SerializedPolicy[];
  agentId?: string;
}

interface IconOption {
  name: string;
  icon: LucideIcon;
}

interface ColorOption {
  hex: string;
  name: string;
}

export interface AvailableTool {
  name: string;
  description?: string;
  domain?: string;
  domainKey?: string;
}

interface CustomAgentsPanelProps {
  agents?: EditableAgent[];
  onAgentsChange?: () => void;
  availableTools?: AvailableTool[];
}

const EMPTY_AGENT: EditableAgent = {
  id: "",
  name: "",
  description: "",
  project: "coding",
  icon: "",
  color: "",
  backgroundImage: "",
  identity: "",
  guidelines: "",
  toolPolicy: "",
  enabledTools: [],
  enabledByDefaultTools: [],
  policies: [],
  usesDirectoryTree: false,
  usesCodingGuidelines: false,
};

// -- Curated color palette for agent theming ---------------------
const COLOR_PALETTE = [
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#8b5cf6", name: "Violet" },
  { hex: "#a855f7", name: "Purple" },
  { hex: "#d946ef", name: "Fuchsia" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#f43f5e", name: "Rose" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#84cc16", name: "Lime" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#10b981", name: "Emerald" },
  { hex: "#14b8a6", name: "Teal" },
  { hex: "#06b6d4", name: "Cyan" },
  { hex: "#0ea5e9", name: "Sky" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#6d28d9", name: "Deep Violet" },
  { hex: "#78716c", name: "Stone" },
  { hex: "#64748b", name: "Slate" },
];

// -- Curated icon palette for the icon picker --------------------
// Stored as string name → component mapping.
const ICON_OPTIONS = [
  { name: "Bot", icon: Bot },
  { name: "Skull", icon: Skull },
  { name: "Sticker", icon: Sticker },
  { name: "Apple", icon: Apple },
  { name: "Brain", icon: Brain },
  { name: "Lightbulb", icon: Lightbulb },
  { name: "Flame", icon: Flame },
  { name: "Zap", icon: Zap },
  { name: "Shield", icon: Shield },
  { name: "Swords", icon: Swords },
  { name: "Sparkles", icon: Sparkles },
  { name: "Palette", icon: Palette },
  { name: "Music", icon: Music },
  { name: "Gamepad2", icon: Gamepad2 },
  { name: "Camera", icon: Camera },
  { name: "Telescope", icon: Telescope },
  { name: "Rocket", icon: Rocket },
  { name: "Atom", icon: Atom },
  { name: "GraduationCap", icon: GraduationCap },
  { name: "Briefcase", icon: Briefcase },
  { name: "Hammer", icon: Hammer },
  { name: "Microscope", icon: Microscope },
  { name: "Leaf", icon: Leaf },
  { name: "Dog", icon: Dog },
  { name: "Cat", icon: Cat },
  { name: "Bird", icon: Bird },
  { name: "Bug", icon: Bug },
  { name: "Fish", icon: Fish },
  { name: "Crown", icon: Crown },
  { name: "Gem", icon: Gem },
  { name: "Star", icon: Star },
  { name: "Moon", icon: Moon },
  { name: "Sun", icon: Sun },
  { name: "Mountain", icon: Mountain },
  { name: "Anchor", icon: Anchor },
  { name: "Compass", icon: Compass },
  { name: "Crosshair", icon: Crosshair },
  { name: "Target", icon: Target },
  { name: "Trophy", icon: Trophy },
  { name: "Medal", icon: Medal },
  { name: "Dumbbell", icon: Dumbbell },
  { name: "HeartPulse", icon: HeartPulse },
  { name: "Coffee", icon: Coffee },
  { name: "UtensilsCrossed", icon: UtensilsCrossed },
  { name: "Wine", icon: Wine },
  { name: "Cake", icon: Cake },
  { name: "Paintbrush", icon: Paintbrush },
  { name: "Pen", icon: Pen },
  { name: "Wand2", icon: Wand2 },
  { name: "Hexagon", icon: Hexagon },
  { name: "CircuitBoard", icon: CircuitBoard },
  { name: "Cog", icon: Cog },
  { name: "FlaskConical", icon: FlaskConical },
  { name: "Heart", icon: Heart },
  { name: "Code2", icon: Code2 },
  { name: "Globe2", icon: Globe2 },
  { name: "Cpu", icon: Cpu },
];

/** Resolve an icon name string to its lucide component. */
export function resolveIconComponent(name: string): LucideIcon {
  if (!name) return Bot;
  const found = ICON_OPTIONS.find((option: IconOption) => option.name === name);
  return found?.icon || Bot;
}

/**
 * CustomAgentsPanel — CRUD interface for user-defined agent personas.
 */
export default function CustomAgentsPanel({
  agents = [],
  onAgentsChange,
  availableTools = [],
}: CustomAgentsPanelProps) {
  const { currentWorkspace } = useWorkspace();

  const lockedOffTools = useMemo(() => {
    const lockedToolsMap = new Map<string, string>();
    const workspaceIsDown = !currentWorkspace || !currentWorkspace.isAgentServed;
    if (workspaceIsDown) {
      const reason = !currentWorkspace
        ? "No workspace set up — configure one in Settings to unlock"
        : "Workspace agent is down — make sure the workspace agent is running and connected";
      for (const tool of availableTools || []) {
        const isWorkspaceTool =
          tool.domainKey === "workspace" ||
          tool.domainKey === "core_workspace" ||
          tool.domain === "Workspace" ||
          tool.domain === "Core Workspace Tools" ||
          tool.name === "enter_worktree" ||
          tool.name === "exit_worktree";
        if (isWorkspaceTool) {
          lockedToolsMap.set(tool.name, reason);
        }
      }
    }
    return lockedToolsMap;
  }, [currentWorkspace, availableTools]);

  const [editingAgent, setEditingAgent] = useState<EditableAgent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);

  const fileInputReference = useRef<HTMLInputElement | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPendingImageFile(file);
    }
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    updateField("avatar", croppedDataUrl);
    setPendingImageFile(null);
    if (fileInputReference.current) {
      fileInputReference.current.value = "";
    }
  };

  const handleCropCancel = () => {
    setPendingImageFile(null);
    if (fileInputReference.current) {
      fileInputReference.current.value = "";
    }
  };

  // -- CRUD -----------------------------------------------------

  const handleCreate = useCallback(() => {
    setEditingAgent({ ...EMPTY_AGENT, enabledTools: [], enabledByDefaultTools: [] });
    setIsNew(true);
    setError(null);
  }, []);

  const handleEdit = useCallback((agent: EditableAgent) => {
    setEditingAgent({
      ...agent,
      enabledTools: agent.enabledTools || [],
      enabledByDefaultTools: agent.enabledByDefaultTools || [],
    });
    setIsNew(false);
    setError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingAgent(null);
    setIsNew(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingAgent?.name?.trim()) {
      setError("Agent name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await PrismService.createCustomAgent(editingAgent);
      } else {
        await PrismService.updateCustomAgent(
          String(editingAgent._id || ""),
          editingAgent,
        );
      }
      setEditingAgent(null);
      setIsNew(false);
      onAgentsChange?.();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [editingAgent, isNew, onAgentsChange]);

  const handleDelete = useCallback((id: string) => {
    setConfirmingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(
    async (id: string) => {
      try {
        await PrismService.deleteCustomAgent(id);
        setConfirmingDeleteId(null);
        onAgentsChange?.();
      } catch (error: unknown) {
        console.error("Failed to delete agent:", getErrorMessage(error));
      }
    },
    [onAgentsChange],
  );

  // -- Form field updaters --------------------------------------

  const updateField = useCallback(
    <K extends keyof EditableAgent>(field: K, value: EditableAgent[K]) => {
      setEditingAgent((agent) => (agent ? { ...agent, [field]: value } : agent));
    },
    [],
  );

  // -- Edit form ------------------------------------------------

  if (editingAgent) {
    return (
      <div className={styles['form-overlay']}>
        <div className={styles['form-header']}>
          <h3>{isNew ? "New Agent" : `Edit: ${editingAgent.name}`}</h3>
          <button className={styles['cancel-button']} onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        <div className={styles['form']}>
          {/* Name + Project */}
          <div className={styles['form-layout-row']}>
            <div className={styles['form-group']} style={{ flex: 2 }}>
              <label>Agent Name</label>
              <InputComponent
                type="text"
                value={editingAgent.name}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement>,
                ) => updateField("name", e.target.value)}
                placeholder="My Agent"
              />
              <span className={styles['hint']}>
                Display name — will generate ID:{" "}
                {editingAgent.name
                  ? deriveAgentId(editingAgent.name)
                  : "CUSTOM_..."}
              </span>
            </div>
            <div className={styles['form-group']} style={{ flex: 1 }}>
              <label>Project</label>
              <InputComponent
                type="text"
                value={editingAgent.project}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement>,
                ) => updateField("project", e.target.value)}
                placeholder="coding"
              />
              <span className={styles['hint']}>Project scope for conversations</span>
            </div>
          </div>

          {/* Description */}
          <div className={styles['form-group']}>
            <label>Description</label>
            <InputComponent
              type="text"
              value={editingAgent.description}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) => updateField("description", e.target.value)}
              placeholder="Short description for the agent picker..."
            />
          </div>

          {/* Icon Picker */}
          <div className={styles['form-group']}>
            <label>Icon</label>
            <div className={styles['icon-grid']}>
              {/* Custom Image Upload Button */}
              <button
                type="button"
                className={styles['icon-option']}
                onClick={() => fileInputReference.current?.click()}
                title="Upload Custom Image"
              >
                <Upload size={16} />
                <input
                  ref={fileInputReference}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </button>

              {/* Custom Image Preview Option */}
              {editingAgent.avatar &&
                (editingAgent.avatar.startsWith("data:") ||
                  editingAgent.avatar.startsWith("http")) && (
                  <button
                    type="button"
                    className={styles['icon-option']}
                    data-is-selected={true}
                    onClick={() => updateField("avatar", editingAgent.avatar)}
                    title="Custom Avatar Image"
                  >
                    <img
                      src={editingAgent.avatar}
                      alt="Custom Avatar"
                      className={styles['custom-icon-preview']}
                    />
                  </button>
                )}

              {ICON_OPTIONS.map(({ name, icon: IconComp }: IconOption) => (
                <button
                  key={name}
                  type="button"
                  className={styles['icon-option']}
                  data-is-selected={editingAgent.icon === name}
                  onClick={() => updateField("icon", name)}
                  title={name}
                  style={
                    editingAgent.color
                      ? ({
                          "--agent-color": editingAgent.color,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <IconComp size={16} />
                </button>
              ))}
            </div>
            <span className={styles['hint']}>
              {editingAgent.avatar
                ? editingAgent.avatar.startsWith("data:")
                  ? "Custom avatar uploaded"
                  : `Avatar: ${editingAgent.avatar}`
                : editingAgent.icon
                  ? `Selected: ${editingAgent.icon}`
                  : "Click an icon — defaults to Bot"}
            </span>
          </div>

          {/* Crop modal overlay */}
          {pendingImageFile && (
            <ImageCropperComponent
              imageFile={pendingImageFile}
              onCrop={handleCropComplete}
              onCancel={handleCropCancel}
            />
          )}

          {/* Color Picker */}
          <div className={styles['form-group']}>
            <label>
              <Palette
                size={12}
                style={{ marginRight: 4, verticalAlign: -1 }}
              />
              Accent Color
            </label>
            <div className={styles['color-grid']}>
              {COLOR_PALETTE.map(({ hex, name }: ColorOption) => (
                <button
                  key={hex}
                  type="button"
                  className={styles['color-swatch']}
                  data-is-selected={editingAgent.color === hex}
                  onClick={() =>
                    updateField("color", editingAgent.color === hex ? "" : hex)
                  }
                  title={name}
                  style={{ "--swatch-color": hex } as React.CSSProperties}
                />
              ))}
            </div>
            <span className={styles['hint']}>
              {editingAgent.color ? (
                <>
                  Selected:{" "}
                  <span
                    className={styles['color-preview-dot']}
                    style={{ background: editingAgent.color }}
                  />{" "}
                  {COLOR_PALETTE.find((color) => color.hex === editingAgent.color)
                    ?.name || editingAgent.color}
                </>
              ) : (
                "Click a color to brand your agent — used for icon backgrounds and UI accents"
              )}
            </span>
          </div>

          {/* Background Image */}
          <div className={styles['form-group']}>
            <label>
              <ImageIcon
                size={12}
                style={{ marginRight: 4, verticalAlign: -1 }}
              />
              Background Image
            </label>
            <InputComponent
              type="text"
              value={editingAgent.backgroundImage || ""}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>,
              ) => updateField("backgroundImage", e.target.value)}
              placeholder="https://example.com/background.jpg"
            />
            <span className={styles['hint']}>
              URL to a background image displayed behind the chat messages — use
              a subtle, dark image for best results
            </span>
            {editingAgent.backgroundImage && (
              <div className={styles['background-preview']}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={editingAgent.backgroundImage}
                  alt="Background preview"
                  className={styles['background-preview-img']}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <button
                  type="button"
                  className={styles['background-preview-clear']}
                  onClick={() => updateField("backgroundImage", "")}
                  title="Remove background image"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Identity Prompt */}
          <div className={styles['form-group']}>
            <label>Identity Prompt</label>
            <TextAreaComponent
              value={editingAgent.identity || ""}
              onChange={(
                e: React.ChangeEvent<HTMLTextAreaElement>,
              ) => updateField("identity", e.target.value)}
              placeholder="You are a senior backend engineer specializing in..."
              minRows={5}
            />
            <span className={styles['hint']}>
              Core personality and role — injected at the top of the system
              prompt
            </span>
          </div>

          {/* Guidelines */}
          <div className={styles['form-group']}>
            <label>Response Guidelines</label>
            <TextAreaComponent
              value={editingAgent.guidelines || ""}
              onChange={(
                e: React.ChangeEvent<HTMLTextAreaElement>,
              ) => updateField("guidelines", e.target.value)}
              placeholder={"## Guidelines\n- Always explain your reasoning...\n- Use bullet points for clarity..."}
              minRows={4}
            />
            <span className={styles['hint']}>
              Always injected into the system prompt — behavioral instructions
              for how the agent should respond
            </span>
          </div>

          {/* Tool Policy */}
          <div className={styles['form-group']}>
            <label>Tool Policy</label>
            <TextAreaComponent
              value={editingAgent.toolPolicy || ""}
              onChange={(
                e: React.ChangeEvent<HTMLTextAreaElement>,
              ) => updateField("toolPolicy", e.target.value)}
              placeholder={"# Tool Usage\n- Use read_file before editing...\n- Always run tests after changes..."}
              minRows={4}
            />
            <span className={styles['hint']}>
              Instructions for how the agent should use its tools
            </span>
          </div>

          {/* Toggles */}
          <div className={styles['form-group']}>
            <label>Context Injection</label>
            <div className={styles['toggle-layout-row']}>
              <div className={styles['toggle-label']}>
                <span className={styles['toggle-title']}>
                  <FolderTree
                    size={12}
                    style={{ marginRight: 4, verticalAlign: -1 }}
                  />
                  Directory Tree
                </span>
                <span className={styles['toggle-hint']}>
                  Inject workspace file structure into context
                </span>
              </div>
              <ToggleComponent
                checked={editingAgent.usesDirectoryTree}
                onChange={() =>
                  updateField(
                    "usesDirectoryTree",
                    !editingAgent.usesDirectoryTree,
                  )
                }
              />
            </div>
            <div className={styles['toggle-layout-row']}>
              <div className={styles['toggle-label']}>
                <span className={styles['toggle-title']}>
                  <BookOpen
                    size={12}
                    style={{ marginRight: 4, verticalAlign: -1 }}
                  />
                  Coding Defaults
                </span>
                <span className={styles['toggle-hint']}>
                  Inject generic coding conventions and coordinator
                  orchestration mode
                </span>
              </div>
              <ToggleComponent
                checked={editingAgent.usesCodingGuidelines}
                onChange={() =>
                  updateField(
                    "usesCodingGuidelines",
                    !editingAgent.usesCodingGuidelines,
                  )
                }
              />
            </div>
          </div>

          {/* Tool Picker */}
          <ToolSelectionComponent
            availableTools={availableTools}
            enabledTools={editingAgent.enabledTools}
            onEnabledToolsChange={(tools: string[]) =>
              updateField("enabledTools", tools)
            }
            coreToolsLocked={true}
            lockedOffTools={lockedOffTools}
            triStateMode={true}
            enabledByDefaultTools={editingAgent.enabledByDefaultTools || []}
            onEnabledByDefaultToolsChange={(tools: string[]) =>
              updateField("enabledByDefaultTools", tools)
            }
          />

          {/* Policy Editor */}
          <div className={styles['form-group']}>
            <label>
              <Shield size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              Tool Policies
            </label>
            <span className={styles['hint']}>
              Define allow/deny/ask rules for specific tools. Policies are
              evaluated before the default approval tier system — deny rules
              take highest priority.
            </span>

            {(editingAgent.policies || []).map(
              (policy: SerializedPolicy, index: number) => (
                <div key={index} className={styles['policy-layout-row']}>
                  <SelectComponent
                    value={policy.decision}
                    options={[
                      { value: "DENY", label: "Deny" },
                      { value: "ASK_USER", label: "Ask User" },
                      { value: "APPROVE", label: "Allow" },
                    ]}
                    onChange={(value: string) => {
                      const updated = [...(editingAgent.policies || [])];
                      updated[index] = {
                        ...updated[index],
                        decision: value as SerializedPolicy["decision"],
                      };
                      updateField("policies", updated);
                    }}
                  />

                  <InputComponent
                    type="text"
                    value={policy.tool}
                    placeholder="Tool name or *"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const updated = [...(editingAgent.policies || [])];
                      updated[index] = { ...updated[index], tool: e.target.value };
                      updateField("policies", updated);
                    }}
                  />

                  <InputComponent
                    type="text"
                    value={policy.pattern || ""}
                    placeholder="Regex pattern (optional)"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const updated = [...(editingAgent.policies || [])];
                      updated[index] = {
                        ...updated[index],
                        pattern: e.target.value || undefined,
                      };
                      updateField("policies", updated);
                    }}
                  />

                  <InputComponent
                    type="text"
                    value={policy.field || ""}
                    placeholder="Field (default: command)"
                    style={{ maxWidth: 140 }}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const updated = [...(editingAgent.policies || [])];
                      updated[index] = {
                        ...updated[index],
                        field: e.target.value || undefined,
                      };
                      updateField("policies", updated);
                    }}
                  />

                  <button
                    type="button"
                    className={styles['policy-remove-button']}
                    onClick={() => {
                      const updated = (editingAgent.policies || []).filter(
                        (_: SerializedPolicy, i: number) => i !== index,
                      );
                      updateField("policies", updated);
                    }}
                    title="Remove policy"
                  >
                    <X size={12} />
                  </button>
                </div>
              ),
            )}

            <button
              type="button"
              className={styles['policy-add-button']}
              onClick={() => {
                const newPolicy: SerializedPolicy = {
                  tool: "*",
                  decision: "ASK_USER",
                };
                updateField("policies", [
                  ...(editingAgent.policies || []),
                  newPolicy,
                ]);
              }}
            >
              <Plus size={12} />
              Add Policy Rule
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--color-danger)",
                fontSize: 12,
              }}
            >
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles['form-footer']}>
          <ButtonComponent variant="disabled" onClick={handleCancel}>
            Cancel
          </ButtonComponent>
          <ButtonComponent
            variant="primary"
            icon={Save}
            onClick={handleSave}
            disabled={saving || !editingAgent.name?.trim()}
          >
            {saving ? "Saving…" : isNew ? "Create Agent" : "Save Changes"}
          </ButtonComponent>
        </div>
      </div>
    );
  }

  // -- Agent list view ------------------------------------------

  return (
    <div className={`custom-agents-panel-component ${styles['container']}`}>
      {agents.length > 0 && (
        <div className={styles['panel-header']}>
          <ButtonComponent
            variant="disabled"
            icon={Plus}
            onClick={handleCreate}
          >
            New Agent
          </ButtonComponent>
        </div>
      )}

      {agents.length === 0 ? (
        <div className={styles['empty-state']}>
          <div className={styles['empty-icon']}>
            <Bot size={24} />
          </div>
          <span className={styles['empty-title']}>No custom agents yet</span>
          <span className={styles['empty-hint']}>
            Create your own agent persona with a custom system prompt and
            hand-picked tools from the full tool suite.
          </span>
          <ButtonComponent variant="primary" icon={Plus} onClick={handleCreate}>
            Create Agent
          </ButtonComponent>
        </div>
      ) : (
        <div className={styles['agent-list']}>
          {(agents || []).map((agent: EditableAgent) => {
            const isConfirming = confirmingDeleteId === agent._id;

            return (
              <div key={agent._id} className={styles['agent-card']}>
                <BadgeComponent
                  type="agent"
                  agent={{
                    id: agent.agentId,
                    icon: agent.icon,
                    avatar: agent.avatar,
                    color: agent.color,
                  }}
                />
                <div className={styles['agent-info']}>
                  <span className={styles['agent-name']}>{agent.name}</span>
                  {agent.description && (
                    <span className={styles['agent-desc']}>
                      {agent.description}
                    </span>
                  )}
                  <div className={styles['agent-meta']}>
                    <span className={styles['agent-badge']}>
                      <Wrench size={9} />
                      {agent.enabledTools?.length || 0} tools
                    </span>
                    <span className={styles['agent-badge']}>{agent.agentId}</span>
                  </div>
                </div>

                <div className={styles['agent-actions']}>
                  {isConfirming ? (
                    <div className={styles['confirm-layout-row']}>
                      <span className={styles['confirm-text']}>Delete?</span>
                      <ButtonComponent
                        variant="destructive"
                        onClick={() => confirmDelete(String(agent._id))}
                      >
                        Yes
                      </ButtonComponent>
                      <ButtonComponent
                        variant="disabled"
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        No
                      </ButtonComponent>
                    </div>
                  ) : (
                    <>
                      <button
                        className={styles['action-button']}
                        onClick={() => handleEdit(agent)}
                        title="Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className={`${styles['action-button']} ${styles['action-button-element-danger']}`}
                        onClick={() => handleDelete(String(agent._id))}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
