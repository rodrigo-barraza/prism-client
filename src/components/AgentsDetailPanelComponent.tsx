"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Wrench,
  X,
  Check,
  AlertCircle,
  PlusCircle,
  Copy,
  Upload,
} from "lucide-react";
import ImageCropperComponent from "./ImageCropperComponent";
import {
  ButtonComponent,
  ToggleComponent,
  InputComponent,
  TextAreaComponent,
  SelectComponent,
  IconButtonComponent,
} from "@rodrigo-barraza/components-library";
import type { AgentPersona, SerializedPolicy, ToolSchema } from "../types/types";
import type { EditableAgent } from "./AgentsPageComponent";
import styles from "./AgentsPageComponent.module.css";
import BadgeComponent from "./BadgeComponent";
import ToolSelectionComponent from "./ToolSelectionComponent";
import { useWorkspace } from "./WorkspaceContextComponent";
import InfoBannerComponent from "./InfoBannerComponent";



interface CuratedColorOption {
  hex: string;
  name: string;
}

interface CuratedIconOption {
  name: string;
  icon: React.ComponentType<{ size?: number }>;
}

import {
  Skull,
  Sticker,
  Apple,
  Brain,
  Lightbulb,
  Flame,
  Zap,
  Swords,
  Sparkles,
  Palette,
  Music,
  Gamepad2,
  Camera,
  Telescope,
  Rocket,
  Atom,
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
  Heart,
  Code2,
  Globe2,
  Cpu,
  Shield,
} from "lucide-react";

const curatedAccentColors: CuratedColorOption[] = [
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

const curatedIconOptions: CuratedIconOption[] = [
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

interface AgentsDetailPanelComponentProps {
  editingAgent: EditableAgent | null;
  selectedBuiltInAgent: AgentPersona | undefined;
  selectedCustomAgent: EditableAgent | undefined;
  isCreateMode: boolean;
  isSaving: boolean;
  isConfirmingDelete: boolean;
  errorMessage: string | null;
  availableTools: ToolSchema[];
  builtInAgentTools?: ToolSchema[] | null;
  onUpdateField: <K extends keyof EditableAgent>(field: K, value: EditableAgent[K]) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDeleteAgent: () => void;
  onConfirmDeleteToggle: (confirming: boolean) => void;
  onDuplicateAgent: (sourceAgent: AgentPersona) => void;
}

export default function AgentsDetailPanelComponent({
  editingAgent,
  selectedBuiltInAgent,
  selectedCustomAgent,
  isCreateMode,
  isSaving,
  isConfirmingDelete,
  errorMessage,
  availableTools,
  builtInAgentTools,
  onUpdateField,
  onSave,
  onCancelEdit,
  onDeleteAgent,
  onConfirmDeleteToggle,
  onDuplicateAgent,
}: AgentsDetailPanelComponentProps) {
  const router = useRouter();
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

  const currentAccentColor = editingAgent?.color || selectedBuiltInAgent?.color || "#6366f1";

  const fileInputReference = useRef<HTMLInputElement | null>(null);
  const heroAvatarInputReference = useRef<HTMLInputElement | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [isIdentifierCopied, setIsIdentifierCopied] = useState(false);

  const toolsCount = useMemo(() => {
    if (!editingAgent && selectedBuiltInAgent) {
      return selectedBuiltInAgent.toolCount;
    }
    const coreToolsCount = availableTools.filter((tool) => tool.system === true).length;
    const enabledConfigurableToolsCount = ((editingAgent || selectedCustomAgent)?.enabledTools || [])
      .filter((toolName) => {
        const foundTool = availableTools.find((availableTool) => availableTool.name === toolName);
        return foundTool ? !foundTool.system : true;
      }).length;
    return coreToolsCount + enabledConfigurableToolsCount;
  }, [editingAgent, selectedBuiltInAgent, selectedCustomAgent, availableTools]);

  const handleCopyIdentifier = useCallback((identifierValue: string) => {
    if (!identifierValue) return;
    navigator.clipboard.writeText(identifierValue).then(() => {
      setIsIdentifierCopied(true);
      setTimeout(() => setIsIdentifierCopied(false), 1800);
    });
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPendingImageFile(file);
    }
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    onUpdateField("avatar", croppedDataUrl);
    setPendingImageFile(null);
    if (fileInputReference.current) {
      fileInputReference.current.value = "";
    }
    if (heroAvatarInputReference.current) {
      heroAvatarInputReference.current.value = "";
    }
  };

  const handleCropCancel = () => {
    setPendingImageFile(null);
    if (fileInputReference.current) {
      fileInputReference.current.value = "";
    }
    if (heroAvatarInputReference.current) {
      heroAvatarInputReference.current.value = "";
    }
  };

  const handleRemoveCustomAvatar = useCallback(() => {
    onUpdateField("avatar", "");
  }, [onUpdateField]);

  return (
    <div className={`agents-detail-panel-component ${styles["page-content-area"]}`}>
      {/* -- Hero Profile Banner -- */}
      <section
        className={styles["content-hero-banner"]}
        style={
          {
            "--agent-accent-color": currentAccentColor,
          } as React.CSSProperties
        }
      >
        <div className={styles["content-hero-content"]}>
          <div className={`${styles["agent-avatar-wrapper"]} ${editingAgent ? styles["agent-avatar-wrapper--editable"] : ""}`}>
            {editingAgent ? (
              <>
                <button
                  type="button"
                  className={styles["avatar-upload-trigger"]}
                  onClick={() => heroAvatarInputReference.current?.click()}
                  title={editingAgent.avatar ? "Change custom avatar" : "Upload custom avatar"}
                >
                  <BadgeComponent
                    type="agent"
                    agent={{
                      id: editingAgent.agentId || "NEW",
                      icon: editingAgent.icon || "Bot",
                      avatar: editingAgent.avatar || "",
                      color: currentAccentColor,
                    }}
                    size={64}
                  />
                  <div className={styles["avatar-upload-overlay"]}>
                    <Camera size={20} />
                    <span className={styles["avatar-upload-overlay-label"]}>
                      {editingAgent.avatar ? "Change" : "Upload"}
                    </span>
                  </div>
                </button>
                <input
                  ref={heroAvatarInputReference}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className={styles["avatar-hidden-file-input"]}
                />
                {editingAgent.avatar &&
                  (editingAgent.avatar.startsWith("data:") ||
                    editingAgent.avatar.startsWith("http")) && (
                  <button
                    type="button"
                    className={styles["avatar-remove-button"]}
                    onClick={handleRemoveCustomAvatar}
                    title="Remove custom avatar"
                  >
                    <X size={12} />
                  </button>
                )}
              </>
            ) : (
              <BadgeComponent
                type="agent"
                agent={{
                  id: selectedBuiltInAgent?.id || "NEW",
                  icon: selectedBuiltInAgent?.icon || "Bot",
                  avatar: selectedBuiltInAgent?.avatar || "",
                  color: currentAccentColor,
                }}
                size={64}
              />
            )}
          </div>
          <div className={styles["profile-text-content-container"]}>
            <h2 className={styles["profile-title-text"]}>
              {editingAgent
                ? editingAgent.name || (isCreateMode ? "New Custom Persona" : "")
                : selectedCustomAgent?.name || selectedBuiltInAgent?.name || ""}
            </h2>
            <p className={styles["profile-subtitle-text"]}>
              {editingAgent
                ? editingAgent.description || (isCreateMode ? "Define system prompt overrides and capabilities" : "")
                : selectedCustomAgent?.description || selectedBuiltInAgent?.description || ""}
            </p>
            <div className={styles["profile-badge-and-actions-container"]}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={styles["profile-badge-label"]}>
                  <Bot size={12} style={{ marginRight: 4 }} />
                  {isCreateMode
                    ? "Custom Draft"
                    : selectedCustomAgent
                      ? "Custom Agent"
                      : "System Built-In"}
                </span>
                <BadgeComponent
                  type="tools"
                  count={toolsCount}
                />
              </div>
              {!isCreateMode && (selectedBuiltInAgent || selectedCustomAgent || (editingAgent && editingAgent._id)) && (
                <ButtonComponent
                  variant="primary"
                  icon={Bot}
                  onClick={() => {
                    const agentIdentifier = selectedBuiltInAgent?.id || selectedCustomAgent?.agentId || editingAgent?.agentId;
                    if (agentIdentifier) {
                      router.push(`/chat?agent=${encodeURIComponent(String(agentIdentifier))}`);
                    }
                  }}
                >
                  Use in Chat
                </ButtonComponent>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* -- Main Profile Body (Form/Info) -- */}
      {editingAgent ? (
        <form
          className={styles["form-layout-container"]}
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          {/* Agent Identifier (Read Only) */}
          <div className={styles["form-group-container"]}>
            <label htmlFor="input-agent-identifier">Identifier</label>
            <div className={styles["identifier-input-layout-row"]}>
              <InputComponent
                id="input-agent-identifier"
                type="text"
                value={editingAgent.agentId || ""}
                readOnly={true}
                placeholder="Generated on save"
              />
              {editingAgent.agentId && (
                <IconButtonComponent
                  icon={isIdentifierCopied ? <Check size={13} /> : <Copy size={13} />}
                  onClick={() => handleCopyIdentifier(editingAgent.agentId || "")}
                  tooltip={isIdentifierCopied ? "Copied!" : "Copy Identifier"}
                  className={styles["identifier-copy-button"]}
                  data-is-copied-state={isIdentifierCopied}
                />
              )}
            </div>
          </div>

          {/* Identity prompt block */}
          <div className={styles["form-group-container"]}>
            <label htmlFor="input-agent-name">Agent Name</label>
            <InputComponent
              id="input-agent-name"
              type="text"
              value={editingAgent.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onUpdateField("name", event.target.value)
              }
              placeholder="Senior Architect"
              required
            />
            <span className={styles["hint-text-label"]}>
              Unique display name identifier.
            </span>
          </div>

          <div className={styles["form-layout-row"]}>
            <div className={styles["form-group-container"]} style={{ flex: 1 }}>
              <label htmlFor="input-agent-project">Scope Project</label>
              <InputComponent
                id="input-agent-project"
                type="text"
                value={editingAgent.project || ""}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateField("project", event.target.value)
                }
                placeholder="coding"
              />
            </div>
            <div className={styles["form-group-container"]} style={{ flex: 2 }}>
              <label htmlFor="input-agent-description">Short Description</label>
              <InputComponent
                id="input-agent-description"
                type="text"
                value={editingAgent.description || ""}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateField("description", event.target.value)
                }
                placeholder="Specialized developer persona optimized for..."
              />
            </div>
          </div>

          {/* Icon Picker */}
          <div className={styles["form-group-container"]}>
            <label>Icon</label>
            <div className={styles["icon-grid-layout"]}>
              {/* Custom Image Upload Button */}
              <button
                type="button"
                className={styles["icon-option-button"]}
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
                    className={styles["icon-option-button"]}
                    data-is-selected={true}
                    onClick={() => onUpdateField("avatar", editingAgent.avatar)}
                    title="Custom Avatar Image"
                  >
                    <img
                      src={editingAgent.avatar}
                      alt="Custom Avatar"
                      className={styles["custom-icon-preview"]}
                    />
                  </button>
                )}

              {curatedIconOptions.map((iconOption) => {
                const IconComp = iconOption.icon;
                const isSelected = editingAgent.icon === iconOption.name;
                return (
                  <button
                    key={iconOption.name}
                    type="button"
                    className={styles["icon-option-button"]}
                    data-is-selected={isSelected}
                    onClick={() => onUpdateField("icon", iconOption.name)}
                    title={iconOption.name}
                    style={
                      editingAgent.color
                        ? ({
                            "--agent-accent-color": editingAgent.color,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <IconComp size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Crop modal overlay */}
          {pendingImageFile && (
            <ImageCropperComponent
              imageFile={pendingImageFile}
              onCrop={handleCropComplete}
              onCancel={handleCropCancel}
            />
          )}

          {/* Accent Color picker */}
          <div className={styles["form-group-container"]}>
            <label>Accent Color Brand</label>
            <div className={styles["color-grid-layout"]}>
              {curatedAccentColors.map((colorOption) => {
                const isSelected = editingAgent.color === colorOption.hex;
                return (
                  <button
                    key={colorOption.hex}
                    type="button"
                    className={styles["color-swatch-button"]}
                    data-is-selected={isSelected}
                    onClick={() => onUpdateField("color", isSelected ? "" : colorOption.hex)}
                    title={colorOption.name}
                    style={{ "--swatch-color": colorOption.hex } as React.CSSProperties}
                  />
                );
              })}
            </div>
          </div>

          {/* Background Image Input */}
          <div className={styles["form-group-container"]}>
            <label htmlFor="input-agent-background">Custom Chat Background Image URL</label>
            <InputComponent
              id="input-agent-background"
              type="text"
              value={editingAgent.backgroundImage || ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onUpdateField("backgroundImage", event.target.value)
              }
              placeholder="https://example.com/subtle-dark-pattern.png"
            />
          </div>

          {/* Identity Prompts */}
          <div className={styles["form-group-container"]}>
            <label htmlFor="textarea-agent-identity">System Persona Prompt (Identity)</label>
            <TextAreaComponent
              id="textarea-agent-identity"
              value={editingAgent.identity || ""}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                onUpdateField("identity", event.target.value)
              }
              placeholder="You are an expert backend API engineer..."
              minRows={5}
            />
          </div>

          {/* Response Guidelines */}
          <div className={styles["form-group-container"]}>
            <label htmlFor="textarea-agent-guidelines">Response Guidelines</label>
            <TextAreaComponent
              id="textarea-agent-guidelines"
              value={editingAgent.guidelines || ""}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                onUpdateField("guidelines", event.target.value)
              }
              placeholder="- Always write clean types\n- Format logic steps using mermaid charts"
              minRows={4}
            />
          </div>

          {/* Tool Guidelines */}
          <div className={styles["form-group-container"]}>
            <label htmlFor="textarea-agent-tool-policy">Tool Execution Policy Prompts</label>
            <TextAreaComponent
              id="textarea-agent-tool-policy"
              value={editingAgent.toolPolicy || ""}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                onUpdateField("toolPolicy", event.target.value)
              }
              placeholder="Use the search tool before making code changes..."
              minRows={4}
            />
          </div>

          {/* Context Toggles */}
          <div className={styles["form-group-container"]}>
            <label>System Context Controls</label>
            <div className={styles["toggle-layout-row-container"]}>
              <div className={styles["toggle-info-panel"]}>
                <span className={styles["toggle-title-text"]}>Workspace Directory Tree</span>
                <span className={styles["toggle-hint-text"]}>
                  Pre-inject the workspace folder file layout directly into the system context.
                </span>
              </div>
              <ToggleComponent
                checked={editingAgent.usesDirectoryTree ?? false}
                onChange={(checked: boolean) => onUpdateField("usesDirectoryTree", checked)}
              />
            </div>

            <div className={styles["toggle-layout-row-container"]}>
              <div className={styles["toggle-info-panel"]}>
                <span className={styles["toggle-title-text"]}>Coding Default Policies</span>
                <span className={styles["toggle-hint-text"]}>
                  Inject standard workspace coding guidelines and command defaults.
                </span>
              </div>
              <ToggleComponent
                checked={editingAgent.usesCodingGuidelines ?? false}
                onChange={(checked: boolean) => onUpdateField("usesCodingGuidelines", checked)}
              />
            </div>
          </div>

          {/* Tool Selection block */}
          <ToolSelectionComponent
            availableTools={availableTools}
            enabledTools={editingAgent.enabledTools || []}
            onEnabledToolsChange={(selectedTools: string[]) =>
              onUpdateField("enabledTools", selectedTools)
            }
            coreToolsLocked={true}
            lockedOffTools={lockedOffTools}
            triStateMode={true}
            enabledByDefaultTools={editingAgent.enabledByDefaultTools || []}
            onEnabledByDefaultToolsChange={(tools: string[]) =>
              onUpdateField("enabledByDefaultTools", tools)
            }
          />

          {/* Policies block */}
          <div className={styles["form-group-container"]}>
            <label>Execution Authorization Guardrails</label>
            <span className={styles["hint-text-label"]}>
              Specify regex pattern checks and prompt confirmation overrides per tool call.
            </span>
            {(editingAgent.policies || []).map((policy, index) => (
              <div key={index} className={styles["policy-layout-row-container"]}>
                <SelectComponent
                  value={policy.decision}
                  options={[
                    { value: "DENY", label: "Deny Execution" },
                    { value: "ASK_USER", label: "Prompt User" },
                    { value: "APPROVE", label: "Auto-Approve" },
                  ]}
                  onChange={(value: string) => {
                    const updatedPolicies = [...(editingAgent.policies || [])];
                    updatedPolicies[index] = {
                      ...updatedPolicies[index],
                      decision: value as SerializedPolicy["decision"],
                    };
                    onUpdateField("policies", updatedPolicies);
                  }}
                />
                <InputComponent
                  type="text"
                  value={policy.tool}
                  placeholder="Tool identifier (e.g. execute_command or *)"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const updatedPolicies = [...(editingAgent.policies || [])];
                    updatedPolicies[index] = {
                      ...updatedPolicies[index],
                      tool: event.target.value,
                    };
                    onUpdateField("policies", updatedPolicies);
                  }}
                />
                <InputComponent
                  type="text"
                  value={policy.pattern || ""}
                  placeholder="Regex match (optional)"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    const updatedPolicies = [...(editingAgent.policies || [])];
                    updatedPolicies[index] = {
                      ...updatedPolicies[index],
                      pattern: event.target.value || undefined,
                    };
                    onUpdateField("policies", updatedPolicies);
                  }}
                />
                <IconButtonComponent
                  icon={<X size={13} />}
                  onClick={() => {
                    const updatedPolicies = (editingAgent.policies || []).filter(
                      (_, policyIndex) => policyIndex !== index,
                    );
                    onUpdateField("policies", updatedPolicies);
                  }}
                  tooltip="Delete Policy Row"
                />
              </div>
            ))}

            <ButtonComponent
              variant="outlined"
              size="small"
              icon={PlusCircle}
              onClick={() => {
                const newPolicy: SerializedPolicy = {
                  tool: "*",
                  decision: "ASK_USER",
                };
                onUpdateField("policies", [...(editingAgent.policies || []), newPolicy]);
              }}
            >
              Add Policy Guardrail
            </ButtonComponent>
          </div>

          {/* Error notifications */}
          {errorMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--color-danger)",
                fontSize: "0.8125rem",
                background: "color-mix(in srgb, var(--color-danger) 8%, transparent)",
                padding: "8px 16px",
                borderRadius: 4,
              }}
            >
              <AlertCircle size={14} />
              {errorMessage}
            </div>
          )}

          {/* Sticky Save/Cancel footer */}
          <div className={styles["form-actions-sticky-footer"]}>
            <ButtonComponent
              variant="disabled"
              onClick={onCancelEdit}
              disabled={isSaving}
              style={{ marginInlineStart: "auto" }}
            >
              Cancel
            </ButtonComponent>
            <ButtonComponent
              id="button-save-agent"
              variant="primary"
              onClick={onSave}
              disabled={isSaving || !editingAgent.name?.trim()}
            >
              {isSaving ? "Saving..." : isCreateMode ? "Create Persona" : "Save Changes"}
            </ButtonComponent>
          </div>

          {/* Delete zone (non-sticky, stays at bottom of form) */}
          {!isCreateMode && (
            <div className={styles["form-actions-danger-zone"]}>
              {isConfirmingDelete ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--color-danger)",
                      fontWeight: 600,
                    }}
                  >
                    Confirm Delete?
                  </span>
                  <ButtonComponent
                    id="button-confirm-delete"
                    variant="destructive"
                    onClick={onDeleteAgent}
                    disabled={isSaving}
                  >
                    Yes, Delete
                  </ButtonComponent>
                  <ButtonComponent
                    variant="disabled"
                    onClick={() => onConfirmDeleteToggle(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </ButtonComponent>
                </div>
              ) : (
                <ButtonComponent
                  id="button-delete-agent"
                  variant="destructive"
                  onClick={() => onConfirmDeleteToggle(true)}
                  disabled={isSaving}
                >
                  Delete Agent
                </ButtonComponent>
              )}
            </div>
          )}
        </form>
      ) : selectedBuiltInAgent ? (
        /* -- Built-In Profile Presentation (Info panel) -- */
        <div className={styles["form-layout-container"]}>
          {/* Agent Identifier (Read Only) */}
          <div className={styles["form-group-container"]}>
            <label htmlFor="input-agent-identifier-builtin">Identifier</label>
            <div className={styles["identifier-input-layout-row"]}>
              <InputComponent
                id="input-agent-identifier-builtin"
                type="text"
                value={selectedBuiltInAgent.id || ""}
                readOnly={true}
                placeholder="No identifier available"
              />
              {selectedBuiltInAgent.id && (
                <IconButtonComponent
                  icon={isIdentifierCopied ? <Check size={13} /> : <Copy size={13} />}
                  onClick={() => handleCopyIdentifier(selectedBuiltInAgent.id || "")}
                  tooltip={isIdentifierCopied ? "Copied!" : "Copy Identifier"}
                  className={styles["identifier-copy-button"]}
                  data-is-copied-state={isIdentifierCopied}
                />
              )}
            </div>
          </div>

          <InfoBannerComponent variant="info">
            This is a built-in system agent persona. To customize it, click the duplicate button
            below to clone its toolset configuration into a new custom persona.
          </InfoBannerComponent>

          {/* Specs detail metadata */}
          <div className={styles["form-group-container"]}>
            <label>System Configuration Settings</label>
            <div className={styles["toggle-layout-row-container"]}>
              <div className={styles["toggle-info-panel"]}>
                <span className={styles["toggle-title-text"]}>Workspace Directory Tree</span>
                <span className={styles["toggle-hint-text"]}>
                  Pre-inject the workspace folder file layout directly into the system context.
                </span>
              </div>
              <ToggleComponent checked={selectedBuiltInAgent.usesDirectoryTree} onChange={() => {}} disabled />
            </div>

            <div className={styles["toggle-layout-row-container"]}>
              <div className={styles["toggle-info-panel"]}>
                <span className={styles["toggle-title-text"]}>Coding Default Policies</span>
                <span className={styles["toggle-hint-text"]}>
                  Inject standard workspace coding guidelines and command defaults.
                </span>
              </div>
              <ToggleComponent checked={selectedBuiltInAgent.usesCodingGuidelines} onChange={() => {}} disabled />
            </div>
          </div>

          {/* Allowed tools list */}
          <ToolSelectionComponent
            availableTools={builtInAgentTools || availableTools}
            enabledTools={
              selectedBuiltInAgent.enabledToolNames?.includes("*")
                ? (builtInAgentTools || availableTools).map((tool) => tool.name)
                : selectedBuiltInAgent.enabledToolNames || []
            }
            coreToolsLocked={true}
            readOnly={true}
            lockedOffTools={lockedOffTools}
          />

          {/* Duplicate button element */}
          <div className={styles["form-actions-footer"]}>
            <ButtonComponent
              id="button-duplicate-agent"
              variant="primary"
              className={styles["duplicate-button-element"]}
              onClick={() => onDuplicateAgent(selectedBuiltInAgent)}
            >
              <Copy size={12} style={{ marginRight: 6 }} />
              Duplicate as Custom Agent
            </ButtonComponent>
          </div>
        </div>
      ) : (
        <div className={styles["empty-state-view"]}>
          <Bot size={48} />
          <h3>Select an Agent Persona</h3>
          <p>Choose an agent from the sidebar or create a new custom agent persona.</p>
        </div>
      )}
    </div>
  );
}
