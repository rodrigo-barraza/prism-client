"use client";

import { useState, useRef, useEffect } from "react";
import { TextAreaComponent } from "@rodrigo-barraza/components-library";
import {
  X,
  Upload,
  Eye,
  Loader2,
  Check,
  Paperclip,
  MessageSquare,
  Plus,
  Minus,
  Wrench,
} from "lucide-react";
import ProviderLogo from "./ProviderLogosComponent";
import AudioPlayerRecorderComponent from "./AudioPlayerRecorderComponent";
import AssetInputOptions from "./AssetInputOptionsComponent";
import PrismService from "../services/PrismService";
import { renderToolName } from "@rodrigo-barraza/utilities-library";
import { MODALITY_ICONS } from "./WorkflowNodeConstantsComponent";
import {
  MODALITY_COLORS,
  ASSET_ICONS,
  ROLE_LABELS,
  HEADER_HEIGHT,
  PORT_SECTION_HEIGHT,
  CONFIG_AREA_HEIGHT,
  PORT_RADIUS,
  MODALITY_ICON_WIDTH,
  parseCompoundPort,
  getBaseModality,
  getNodeWidth,
  getAssetContentHeight,
} from "./WorkflowNodeConstantsComponent";
import styles from "./WorkflowNodeComponent.module.css";
import type { WorkflowNode, WorkflowConnection, Message } from "../types/types";

export interface NodePortsProps {
  node: WorkflowNode;
  inputTypes: string[];
  outputTypes: string[];
  configOffset?: number;
  isNodeRunning?: boolean;
  nodeStatusGradient?: string;
  connecting?: {
    sourceNodeId: string;
    sourceModality: string;
  } | null;
  hoveredPort?: {
    nodeId: string;
    type: "input" | "output";
    modality: string;
  } | null;
  connections: WorkflowConnection[];
  nodeStatuses: Record<string, string>;
  onInputPortClick: (
    e: React.MouseEvent,
    nodeId: string,
    portId: string,
  ) => void;
  onOutputPortClick: (
    e: React.MouseEvent,
    nodeId: string,
    modality: string,
    index: number,
  ) => void;
  onPortHover: (port: {
    nodeId: string;
    type: "input" | "output";
    modality: string;
  }) => void;
  onPortLeave: () => void;
}

/**
 * Renders input and output ports for a node.
 */
function NodePorts({
  node,
  inputTypes,
  outputTypes,
  configOffset = 0,
  isNodeRunning = false,
  nodeStatusGradient = "url(#prism-gradient)",
  connecting,
  hoveredPort,
  connections,
  nodeStatuses,
  onInputPortClick,
  onOutputPortClick,
  onPortHover,
  onPortLeave,
}: NodePortsProps) {
  const nodeWidth = getNodeWidth(node);
  const portStartY = HEADER_HEIGHT + configOffset + 8;
  const isConversationNode =
    node.nodeType === "input" && node.modality === "conversation";
  const nodeMessages = node.messages || [];

  return (
    <>
      {/* Input ports */}
      {inputTypes.map((portId: string, i: number) => {
        const compound = parseCompoundPort(portId);
        const baseModality = compound ? compound.modality : portId;
        const portY =
          portStartY + i * PORT_SECTION_HEIGHT + PORT_SECTION_HEIGHT / 2;
        const color =
          (MODALITY_COLORS as Record<string, string>)[baseModality] || "#888";
        const isCompatible =
          connecting &&
          getBaseModality(connecting.sourceModality) === baseModality &&
          connecting.sourceNodeId !== node.id;
        const isHovered =
          hoveredPort?.nodeId === node.id &&
          hoveredPort?.type === "input" &&
          hoveredPort?.modality === portId;
        const Icon = (
          MODALITY_ICONS as Record<
            string,
            {
              icon: React.ComponentType<{
                size?: number;
                style?: React.CSSProperties;
              }>;
              label?: string;
            }
          >
        )[baseModality]?.icon;
        const hasPrismSource = connections.some(
          (connection) =>
            connection.targetNodeId === node.id &&
            connection.targetModality === portId &&
            (nodeStatuses[connection.sourceNodeId] === "running" ||
              nodeStatuses[connection.sourceNodeId] === "done"),
        );
        const hasDoneSource =
          hasPrismSource &&
          connections.some(
            (connection) =>
              connection.targetNodeId === node.id &&
              connection.targetModality === portId &&
              nodeStatuses[connection.sourceNodeId] === "done",
          ) &&
          !connections.some(
            (connection) =>
              connection.targetNodeId === node.id &&
              connection.targetModality === portId &&
              nodeStatuses[connection.sourceNodeId] === "running",
          );

        let label =
          (
            MODALITY_ICONS as Record<
              string,
              {
                icon: React.ComponentType<{
                  size?: number;
                  style?: React.CSSProperties;
                }>;
                label?: string;
              }
            >
          )[baseModality]?.label || baseModality;
        if (compound && isConversationNode) {
          const message = nodeMessages[compound.index];
          const roleLabel =
            (ROLE_LABELS as Record<string, string>)[message?.role || ""] ||
            message?.role ||
            `#${compound.index}`;
          const roleCount = nodeMessages
            .slice(0, compound.index)
            .filter((messageItem) => messageItem.role === message?.role).length;
          const numberedRole =
            roleCount > 0 ? `${roleLabel} ${roleCount + 1}` : roleLabel;
          if (message?.role === "system") {
            label = numberedRole;
          } else {
            const modalityLabel = baseModality !== "text" ? `${label}s` : label;
            label = `${numberedRole} ${modalityLabel}`;
          }
        }

        return (
          <g key={`in-${portId}-${i}`}>
            <circle
              cx={0}
              cy={portY}
              r={
                isHovered && isCompatible
                  ? PORT_RADIUS + 2
                  : hasPrismSource
                    ? PORT_RADIUS + 2
                    : PORT_RADIUS
              }
              fill={
                hasPrismSource
                  ? hasDoneSource
                    ? "url(#done-gradient)"
                    : "url(#prism-gradient)"
                  : isCompatible
                    ? color
                    : "var(--background-elevated)"
              }
              stroke={
                hasPrismSource
                  ? hasDoneSource
                    ? "url(#done-gradient)"
                    : "url(#prism-gradient)"
                  : color
              }
              strokeWidth={2}
              className={`${styles['port']} ${isCompatible ? styles['port-compatible'] : ""}`}
              data-node-identifier={node.id}
              data-port-type="input"
              data-port-modality={portId}
              onClick={(e: React.MouseEvent) =>
                onInputPortClick(e, node.id, portId)
              }
              onMouseEnter={() =>
                onPortHover({
                  nodeId: node.id,
                  type: "input",
                  modality: portId,
                })
              }
              onMouseLeave={onPortLeave}
            >
              <title>{`IN · ${label} · ${node.id}`}</title>
            </circle>
            {Icon && (
              <foreignObject
                x={8}
                y={portY - 7}
                width={14}
                height={14}
                style={{ pointerEvents: "none" }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Icon size={11} style={{ color }} />
                </div>
              </foreignObject>
            )}
            <text
              x={24}
              y={portY + 1}
              dominantBaseline="middle"
              className={styles['port-label']}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Output ports */}
      {outputTypes.map((modality: string, i: number) => {
        const portY =
          portStartY + i * PORT_SECTION_HEIGHT + PORT_SECTION_HEIGHT / 2;
        const color =
          (MODALITY_COLORS as Record<string, string>)[modality] || "#888";
        const Icon = (
          MODALITY_ICONS as Record<
            string,
            {
              icon: React.ComponentType<{
                size?: number;
                style?: React.CSSProperties;
              }>;
              label?: string;
            }
          >
        )[modality]?.icon;
        const isActive =
          connecting?.sourceNodeId === node.id &&
          connecting?.sourceModality === modality;

        return (
          <g key={`out-${modality}-${i}`}>
            <circle
              cx={nodeWidth}
              cy={portY}
              r={isActive || isNodeRunning ? PORT_RADIUS + 2 : PORT_RADIUS}
              fill={
                isNodeRunning
                  ? nodeStatusGradient
                  : isActive
                    ? color
                    : "var(--background-elevated)"
              }
              stroke={isNodeRunning ? nodeStatusGradient : color}
              strokeWidth={2}
              className={`${styles['port']} ${styles['port-output']}`}
              data-node-identifier={node.id}
              data-port-type="output"
              data-port-modality={modality}
              onClick={(e: React.MouseEvent) =>
                onOutputPortClick(e, node.id, modality, i)
              }
              onMouseEnter={() =>
                onPortHover({ nodeId: node.id, type: "output", modality })
              }
              onMouseLeave={onPortLeave}
            >
              <title>{`OUT · ${(MODALITY_ICONS as Record<string, { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; label?: string }>)[modality]?.label || modality} · ${node.id}`}</title>
            </circle>
            {Icon && (
              <foreignObject
                x={nodeWidth - 22}
                y={portY - 7}
                width={14}
                height={14}
                style={{ pointerEvents: "none" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                  }}
                >
                  <Icon size={11} style={{ color }} />
                </div>
              </foreignObject>
            )}
            <text
              x={nodeWidth - 24}
              y={portY + 1}
              dominantBaseline="middle"
              textAnchor="end"
              className={styles['port-label']}
            >
              {(
                MODALITY_ICONS as Record<
                  string,
                  {
                    icon: React.ComponentType<{
                      size?: number;
                      style?: React.CSSProperties;
                    }>;
                    label?: string;
                  }
                >
              )[modality]?.label || modality}
            </text>
          </g>
        );
      })}
    </>
  );
}

/**
 * Shared port props builder to avoid repeating in both node types.
 */
function usePortProps(props: NodePortsProps) {
  return {
    connecting: props.connecting,
    hoveredPort: props.hoveredPort,
    connections: props.connections,
    nodeStatuses: props.nodeStatuses,
    onInputPortClick: props.onInputPortClick,
    onOutputPortClick: props.onOutputPortClick,
    onPortHover: props.onPortHover,
    onPortLeave: props.onPortLeave,
  };
}

export interface NodeShellProps {
  node: WorkflowNode;
  width: number;
  height: number;
  status: string;
  isSelected: boolean;
  accentColor: string;
  headerFillStyle?: React.SVGAttributes<SVGRectElement>;
  headerContent: React.ReactNode;
  headerActions: React.ReactNode;
  headerActionsWidth?: number;
  typeBadge: string | null;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onTouchStart?: (e: React.TouchEvent, nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  inputTypes: string[];
  outputTypes: string[];
  configOffset?: number;
  isPrism?: boolean;
  statusGradient?: string | null;
  portProps: Omit<
    NodePortsProps,
    | "node"
    | "inputTypes"
    | "outputTypes"
    | "isNodeRunning"
    | "nodeStatusGradient"
  >;
  children?: React.ReactNode;
  className?: string;
}

/**
 * NodeShell — shared structural wrapper for ALL node types.
 *
 * Provides: body rect, header rects, drag area, delete button, ports,
 * selection flash, hover effects. Node-type-specific content is passed
 * via props (headerContent, headerActions, typeBadge, children).
 */
function NodeShell({
  node,
  width,
  height,
  status,
  isSelected,
  accentColor,
  headerFillStyle,
  headerContent,
  headerActions,
  headerActionsWidth = 26,
  typeBadge,
  onMouseDown,
  onTouchStart,
  onDelete,
  // Port props
  inputTypes,
  outputTypes,
  configOffset = 0,
  isPrism = false,
  statusGradient,
  portProps,
  children,
  className,
}: NodeShellProps) {
  const isRunning = status === "running";
  const isDone = status === "done";
  const statusBorder = isRunning
    ? "url(#prism-gradient)"
    : isDone
      ? "url(#done-gradient)"
      : status === "error"
        ? "#f43f5e"
        : null;
  const borderWidth = statusBorder ? 2 : 0;

  // Body style: status border overrides resting accent
  const bodyStyle = statusBorder
    ? { stroke: statusBorder, strokeWidth: borderWidth, strokeOpacity: 1 }
    : { stroke: accentColor, strokeOpacity: 0.4 };

  // Header fill — default to bg-tertiary if not provided
  const headerStyle = headerFillStyle || { fill: "var(--background-elevated)" };

  return (
    <g
      key={node.id}
      transform={`translate(${node.position?.x ?? 0}, ${node.position?.y ?? 0})`}
      className={`${styles['node-group']} ${className || ""}`}
      data-workflow-node
      data-node-identifier={node.id}
      onMouseDown={(e: React.MouseEvent) => onMouseDown(e, node.id)}
      onTouchStart={(e: React.TouchEvent) => onTouchStart?.(e, node.id)}
    >
      {/* Body */}
      <rect
        width={width}
        height={height}
        rx="3"
        ry="3"
        className={styles['node-body']}
        style={bodyStyle}
      />

      {/* Header background */}
      <rect
        width={width}
        height={HEADER_HEIGHT}
        rx="3"
        ry="3"
        className={styles['node-header']}
        {...headerStyle}
      />
      <rect
        x={0}
        y={HEADER_HEIGHT - 3}
        width={width}
        height={3}
        className={styles['node-header']}
        {...headerStyle}
      />

      {/* Drag area with header content */}
      <g
        className={styles['node-drag-area']}
        onMouseDown={(e: React.MouseEvent) => onMouseDown(e, node.id)}
        onTouchStart={(e: React.TouchEvent) => onTouchStart?.(e, node.id)}
        style={{ cursor: "grab" }}
      >
        <rect
          x={0}
          y={0}
          width={width - headerActionsWidth - 8}
          height={HEADER_HEIGHT}
          fill="transparent"
        />
        <foreignObject
          x={8}
          y={0}
          width={width - headerActionsWidth - 16}
          height={HEADER_HEIGHT}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: "100%",
              paddingTop: 1,
            }}
          >
            {headerContent}
            {status === "done" && (
              <Check size={12} style={{ color: "#10b981", flexShrink: 0 }} />
            )}
            {status === "error" && (
              <X size={12} style={{ color: "#f43f5e", flexShrink: 0 }} />
            )}
          </div>
        </foreignObject>
      </g>

      {/* Header right-side actions (modality icons, type badge, info, delete) */}
      <foreignObject
        x={width - headerActionsWidth}
        y={0}
        width={headerActionsWidth}
        height={HEADER_HEIGHT}
      >
        <div className={styles['header-actions']}>
          {headerActions}
          {typeBadge && (
            <>
              <span className={styles['header-separator']} />
              <span
                className={styles['header-type-badge']}
                style={{ color: accentColor }}
              >
                {typeBadge}
              </span>
            </>
          )}
          {headerActions && onDelete && (
            <span className={styles['header-separator']} />
          )}
          {!headerActions && typeBadge && onDelete && (
            <span className={styles['header-separator']} />
          )}
          {onDelete && (
            <button
              className={styles['delete-node-button']}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              title="Remove node"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </foreignObject>

      {/* Type-specific content (config, asset content, error, etc.) */}
      {children}

      {/* Ports */}
      <g transform={`translate(0, ${configOffset})`}>
        <NodePorts
          node={node}
          inputTypes={inputTypes}
          outputTypes={outputTypes}
          isNodeRunning={isPrism}
          nodeStatusGradient={statusGradient || "url(#prism-gradient)"}
          {...portProps}
        />
      </g>

      {/* Selection flash — rendered LAST so it's on top */}
      {isSelected && (
        <rect
          width={width}
          height={height}
          rx="3"
          ry="3"
          className={styles['selected-flash']}
          strokeWidth={2}
        />
      )}
    </g>
  );
}

export interface ModelNodeProps extends NodePortsProps {
  node: WorkflowNode;
  status: string;
  results?: { error?: string };
  isSelected: boolean;
  isExpanded: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onTouchStart?: (e: React.TouchEvent, nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onUpdateConfig?: (nodeId: string, key: string, value: unknown) => void;
}

/**
 * Renders a model node (AI model step).
 */
function ModelNode(props: ModelNodeProps) {
  const {
    node,
    status,
    results,
    isSelected,
    isExpanded,
    onMouseDown,
    onTouchStart,
    onDelete,
    onUpdateConfig,
  } = props;

  const portProps = usePortProps(props);
  const inputTypes = node.inputTypes || [];
  const outputTypes = node.outputTypes || [];
  const width = getNodeWidth(node);

  const modalityIcons = (node.rawInputTypes || node.inputTypes || []).filter(
    (modalityType: string) => modalityType !== "conversation",
  );
  const modalityAreaWidth = modalityIcons.length * MODALITY_ICON_WIDTH;

  const portRows = Math.max(inputTypes.length, outputTypes.length, 1);
  const portsHeight = portRows * PORT_SECTION_HEIGHT + 12;
  const configHeight = isExpanded ? CONFIG_AREA_HEIGHT : 0;
  const errorHeight = results?.error ? 28 : 0;
  const nodeHeight = HEADER_HEIGHT + configHeight + portsHeight + errorHeight;

  const isRunning = status === "running";
  const isDone = status === "done";
  const isPrism = isRunning || isDone;
  const statusGradient = isRunning
    ? "url(#prism-gradient)"
    : isDone
      ? "url(#done-gradient)"
      : null;

  const headerContent = (
    <>
      <ProviderLogo provider={node.provider || ""} size={16} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {(node.displayName as string) || node.modelName}
      </span>
    </>
  );

  const headerActions = (
    <>
      {/* Running spinner */}
      {status === "running" && (
        <Loader2
          size={12}
          style={{
            color: "#f59e0b",
            animation: "spin 1s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
      {/* Modality icons from model's input types */}
      {modalityIcons.map((modality: string) => {
        const modalityEntry = (
          MODALITY_ICONS as Record<
            string,
            {
              icon: React.ComponentType<{
                size?: number;
                style?: React.CSSProperties;
                title?: string;
              }>;
              label?: string;
              color?: string;
            }
          >
        )[modality];
        if (!modalityEntry) return null;
        const Icon = modalityEntry.icon;
        return (
          <Icon
            key={modality}
            size={11}
            style={{
              color: modalityEntry.color || "#888",
              opacity: 0.7,
              flexShrink: 0,
            }}
            title={modalityEntry.label}
          />
        );
      })}
    </>
  );

  // Width for: modality icons + type badge + separators + delete button
  const actionsWidth = modalityAreaWidth + 70 + (status === "running" ? 18 : 0);

  return (
    <NodeShell
      className="workflow-node-component"
      node={node}
      width={width}
      height={nodeHeight}
      status={status}
      isSelected={isSelected}
      accentColor="var(--accent-primary)"
      headerContent={headerContent}
      headerActions={headerActions}
      headerActionsWidth={actionsWidth}
      typeBadge="AI Model"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDelete={onDelete}
      inputTypes={inputTypes}
      outputTypes={outputTypes}
      configOffset={configHeight}
      isPrism={isPrism}
      statusGradient={statusGradient}
      portProps={portProps}
    >
      {/* Expandable config section */}
      {isExpanded && (
        <foreignObject
          x={4}
          y={HEADER_HEIGHT + 2}
          width={width - 8}
          height={CONFIG_AREA_HEIGHT - 4}
        >
          <div className={styles['node-config']}>
            <div className={styles['node-config-messages']}>
              <MessageSquare
                size={11}
                style={{ color: "var(--text-muted)", flexShrink: 0 }}
              />
              <span className={styles['node-config-message-count']}>
                {node.messages?.length || (node.systemPrompt ? 2 : 1)} messages
              </span>
              <span className={styles['node-config-message-hint']}>
                Edit in inspector →
              </span>
            </div>
            <label className={styles['node-config-label']}>Static Input</label>
            <div className={styles['node-config-upload']}>
              {node.staticInputs?.image ? (
                <span
                  className={styles['node-config-file']}
                  title="Static image attached"
                >
                  📎 Image attached
                  <button
                    className={styles['node-config-clear-button']}
                    onClick={() =>
                      onUpdateConfig?.(node.id, "staticInputs", {
                        ...node.staticInputs,
                        image: null,
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ) : (
                <label className={styles['node-config-upload-label']}>
                  <Upload size={10} />
                  <span>Attach image/file</span>
                  <input
                    type="file"
                    accept="image/*,audio/*"
                    className={styles['asset-file-input']}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const modality = file.type.startsWith("image")
                          ? "image"
                          : "audio";
                        onUpdateConfig?.(node.id, "staticInputs", {
                          ...node.staticInputs,
                          [modality]: reader.result,
                        });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </foreignObject>
      )}

      {/* Error display */}
      {results?.error && (
        <foreignObject
          x={4}
          y={HEADER_HEIGHT + configHeight + portsHeight}
          width={width - 8}
          height={24}
        >
          <div className={styles['model-result-error']}>{results.error}</div>
        </foreignObject>
      )}
    </NodeShell>
  );
}

/**
 * Handle file drop/upload for file input nodes.
 */
function handleFileInputChange(
  nodeId: string,
  file: File,
  onUpdateFileInput?: (
    nodeId: string,
    dataUrl: string | ArrayBuffer | null,
    mimeType: string,
  ) => void,
) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    onUpdateFileInput?.(nodeId, reader.result, file.type);
  };
  reader.readAsDataURL(file);
}

export interface AssetNodeProps extends NodePortsProps {
  node: WorkflowNode;
  status: string;
  isSelected: boolean;
  isExpanded: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onTouchStart?: (e: React.TouchEvent, nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onUpdateContent?: (nodeId: string, content: string) => void;
  onUpdateFileInput?: (
    nodeId: string,
    dataUrl: string | ArrayBuffer | null,
    mimeType: string | null,
  ) => void;
  onUpdateConfig?: (nodeId: string, key: string, value: unknown) => void;
  onToggleExpand: (nodeId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  readOnly?: boolean;
}

/**
 * Renders an asset node (input asset or output viewer).
 */
function AssetNode(props: AssetNodeProps) {
  const {
    node,
    status,
    isSelected,
    isExpanded,
    onMouseDown,
    onTouchStart,
    onDelete,
    onUpdateContent,
    onUpdateFileInput,
    onUpdateConfig,
    onToggleExpand,
    onSelectNode,
    readOnly = false,
  } = props;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const portProps = usePortProps(props);
  const isViewer = node.nodeType === "viewer";
  const width = getNodeWidth(node);
  const inputTypes = node.inputTypes || [];
  const outputTypes = node.outputTypes || [];
  const accentColor = (
    isViewer
      ? "#a78bfa"
      : (MODALITY_COLORS as Record<string, string>)[node.modality || ""] ||
        "#8b5cf6"
  ) as string;
  const AssetIcon = isViewer
    ? Eye
    : node.modality
      ? (
          ASSET_ICONS as Record<
            string,
            React.ComponentType<{ size?: number; style?: React.CSSProperties }>
          >
        )[node.modality] ||
        (
          MODALITY_ICONS as Record<
            string,
            {
              icon: React.ComponentType<{
                size?: number;
                style?: React.CSSProperties;
              }>;
            }
          >
        )[node.modality]?.icon ||
        Paperclip
      : Paperclip;

  const isConversation = node.modality === "conversation";
  const conversationModalities = isConversation
    ? (node.supportedModalities || ["text"]).filter((modalityType) => modalityType !== "conversation")
    : [];
  const modalityAreaWidth = conversationModalities.length * MODALITY_ICON_WIDTH;

  const NODE_LABELS = {
    viewer: "Output",
    text: "Text",
    image: "Image",
    audio: "Audio",
    video: "Video",
    pdf: "PDF",
    conversation: "Chat History",
  };

  const typeLabel = isViewer
    ? NODE_LABELS.viewer
    : (NODE_LABELS as Record<string, string>)[node.modality || ""] || "Media";
  const displayTitle = node.customName || typeLabel;

  const handleStartRename = () => {
    if (readOnly) return;
    setRenameValue(node.customName || "");
    setIsRenaming(true);
  };

  const handleFinishRename = () => {
    const trimmed = renameValue.trim();
    onUpdateConfig?.(node.id, "customName", trimmed || undefined);
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleFinishRename();
    if (e.key === "Escape") setIsRenaming(false);
  };

  const isRunning = status === "running";
  const isDone = status === "done";
  const isPrism = isRunning || isDone;
  const statusGradient = isRunning
    ? "url(#prism-gradient)"
    : isDone
      ? "url(#done-gradient)"
      : null;
  const contentH = getAssetContentHeight(node);
  const portRows = Math.max(inputTypes.length, outputTypes.length, 1);
  const portsHeight = portRows * PORT_SECTION_HEIGHT + 12;
  const conversationBtnHeight =
    isConversation && inputTypes.length > 0 && !readOnly ? 24 : 0;
  const nodeHeight =
    HEADER_HEIGHT +
    (isExpanded ? contentH : 0) +
    portsHeight +
    conversationBtnHeight;

  const headerContent = (
    <>
      <AssetIcon size={14} style={{ color: accentColor, flexShrink: 0 }} />
      {isRenaming ? (
        <input
          ref={renameInputRef}
          className={styles['node-rename-input']}
          style={{ color: accentColor }}
          value={renameValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRenameValue(e.target.value)
          }
          onBlur={handleFinishRename}
          onKeyDown={handleRenameKeyDown}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          placeholder={typeLabel}
          maxLength={40}
        />
      ) : (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: accentColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            cursor: readOnly ? "grab" : "text",
          }}
          onDoubleClick={handleStartRename}
        >
          {displayTitle}
        </span>
      )}
    </>
  );

  const headerActions = (
    <>
      {/* Modality icons for conversation input */}
      {isConversation &&
        conversationModalities.length > 0 &&
        conversationModalities.map((modality: string) => {
          const modalityEntry = (
            MODALITY_ICONS as Record<
              string,
              {
                icon: React.ComponentType<{
                  size?: number;
                  style?: React.CSSProperties;
                  title?: string;
                }>;
                label?: string;
                color?: string;
              }
            >
          )[modality];
          if (!modalityEntry) return null;
          const Icon = modalityEntry.icon;
          return (
            <Icon
              key={modality}
              size={11}
              style={{
                color: modalityEntry.color || "#888",
                opacity: 0.7,
                flexShrink: 0,
              }}
              title={modalityEntry.label}
            />
          );
        })}
      {/* Gear / eye button */}
      <button
        className={`${styles['delete-node-button']} ${isExpanded ? styles['config-button-element-is-active-state'] : ""}`}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onToggleExpand(node.id);
        }}
        title={isViewer ? "View outputs" : "Node info"}
      >
        <Eye size={12} />
      </button>
    </>
  );

  // Width for: conversation icons + gear + type badge + separators + delete button
  const actionsWidth = (isConversation ? modalityAreaWidth : 0) + 80;

  return (
    <NodeShell
      className="workflow-node-component"
      node={node}
      width={width}
      height={nodeHeight}
      status={status}
      isSelected={isSelected}
      accentColor={accentColor}
      headerFillStyle={
        {
          fill: accentColor,
          fillOpacity: 0.1,
        } as React.SVGAttributes<SVGRectElement>
      }
      headerContent={headerContent}
      headerActions={headerActions}
      headerActionsWidth={actionsWidth}
      typeBadge={node.customName ? typeLabel : null}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDelete={onDelete}
      inputTypes={inputTypes}
      outputTypes={outputTypes}
      configOffset={isExpanded ? contentH : 0}
      isPrism={isPrism}
      statusGradient={statusGradient}
      portProps={portProps}
    >
      {/* Content area — only when expanded */}
      {isExpanded &&
        (() => {
          return (
            <>
              <foreignObject
                x={4}
                y={HEADER_HEIGHT + 4}
                width={width - 8}
                height={contentH - 8}
              >
                {isViewer ? (
                  <div className={styles['viewer-content']}>
                    {node.receivedOutputs &&
                    Object.keys(node.receivedOutputs).length > 0 ? (
                      <>
                        {node.receivedOutputs.image && (
                          <img
                            src={PrismService.getFileUrl(
                              node.receivedOutputs.image as string,
                            )}
                            alt="Received image"
                            className={styles['viewer-image']}
                          />
                        )}
                        {node.receivedOutputs.text && (
                          <div className={styles['viewer-text']}>
                            {node.receivedOutputs.text as string}
                          </div>
                        )}
                        {node.receivedOutputs.audio && (
                          <AudioPlayerRecorderComponent
                            sourceUrl={PrismService.getFileUrl(
                              node.receivedOutputs.audio as string,
                            )}
                            compact
                          />
                        )}
                        {node.receivedOutputs.embedding && (
                          <div
                            className={styles['viewer-text']}
                            style={{
                              fontFamily: "monospace",
                              fontSize: "10px",
                            }}
                          >
                            [
                            {
                              (node.receivedOutputs.embedding as number[])
                                .length
                            }{" "}
                            dims] [
                            {(node.receivedOutputs.embedding as number[])
                              .slice(0, 4)
                              .map((value: number) => value.toFixed(4))
                              .join(", ")}
                            …]
                          </div>
                        )}
                        {node.receivedOutputs.video && (
                          <video
                            controls
                            src={PrismService.getFileUrl(
                              node.receivedOutputs.video as string,
                            )}
                            className={styles['viewer-image']}
                            onMouseDown={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          />
                        )}
                      </>
                    ) : (
                      <div className={styles['viewer-empty']}>
                        <Eye size={16} style={{ opacity: 0.3 }} />
                        <span>Waiting for input…</span>
                      </div>
                    )}
                  </div>
                ) : node.modality === "text" &&
                  node.content !== undefined &&
                  node.modality !== null ? (
                  <TextAreaComponent
                    className={styles['asset-textarea']}
                    value={(node.content as string) || ""}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      onUpdateContent?.(node.id, e.target.value)
                    }
                    placeholder="Enter text…"
                    onMouseDown={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onSelectNode?.(node.id);
                    }}
                    autoResize={false}
                  />
                ) : node.modality === "conversation" ? null : (
                  /* File input: upload / drag-drop zone or preview */
                  <div
                    className={styles['asset-upload-area']}
                    onDragOver={(e: React.DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e: React.DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer?.files?.[0];
                      if (file)
                        handleFileInputChange(node.id, file, onUpdateFileInput);
                    }}
                  >
                    {node.content ? (
                      <div className={styles['file-input-preview']}>
                        {node.modality === "image" ? (
                          <img
                            src={PrismService.getFileUrl(
                              node.content as string,
                            )}
                            alt="Uploaded asset"
                            className={styles['asset-preview-img']}
                          />
                        ) : node.modality === "audio" ? (
                          <AudioPlayerRecorderComponent
                            sourceUrl={PrismService.getFileUrl(
                              node.content as string,
                            )}
                            square
                          />
                        ) : node.modality === "video" ? (
                          <video
                            controls
                            src={PrismService.getFileUrl(
                              node.content as string,
                            )}
                            className={styles['asset-video-player']}
                            onMouseDown={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          />
                        ) : node.modality === "pdf" ? (
                          <iframe
                            src={PrismService.getFileUrl(
                              node.content as string,
                            )}
                            className={styles['asset-pdf-viewer']}
                            title="PDF preview"
                            onMouseDown={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          />
                        ) : (
                          <div className={styles['asset-file-label']}>
                            <Paperclip size={14} />
                            File loaded
                          </div>
                        )}
                        <button
                          className={styles['file-input-clear-button']}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onUpdateFileInput?.(node.id, null, null);
                          }}
                          title="Remove file"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <AssetInputOptions
                        compact
                        onFile={(
                          dataUrl: string | ArrayBuffer | null,
                          mimeType: string | null,
                        ) => onUpdateFileInput?.(node.id, dataUrl, mimeType)}
                      />
                    )}
                  </div>
                )}
              </foreignObject>
            </>
          );
        })()}

      {/* Add/Remove message pair buttons for conversation nodes (only when connected and editable) */}
      {isConversation && inputTypes.length > 0 && !readOnly && (
        <foreignObject
          x={4}
          y={nodeHeight - conversationBtnHeight}
          width={width - 8}
          height={conversationBtnHeight}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              height: "100%",
              justifyContent: "center",
            }}
          >
            {(node.messages || []).length > 2 && (
              <button
                className={styles['delete-node-button']}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  const msgs = [...(node.messages || [])];
                  if (msgs.length > 2) {
                    msgs.splice(msgs.length - 2, 2);
                    if (msgs[msgs.length - 1]?.role !== "user") {
                      msgs.push({ role: "user", content: "" });
                    }
                    onUpdateConfig?.(node.id, "messages", msgs);
                  }
                }}
                title="Remove last message pair"
                style={{ width: 18, height: 18 }}
              >
                <Minus size={10} />
              </button>
            )}
            <button
              className={styles['delete-node-button']}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                const msgs = [...(node.messages || [])];
                msgs.push({ role: "assistant", content: "" });
                msgs.push({ role: "user", content: "" });
                onUpdateConfig?.(node.id, "messages", msgs);
              }}
              title="Add assistant + user message pair"
              style={{ width: 18, height: 18 }}
            >
              <Plus size={10} />
            </button>
          </div>
        </foreignObject>
      )}
    </NodeShell>
  );
}

export interface ToolNodeProps extends NodePortsProps {
  node: WorkflowNode;
  status: string;
  isSelected: boolean;
  isExpanded: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onTouchStart?: (e: React.TouchEvent, nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
}

/**
 * Renders a tool (function calling) node.
 */
function ToolNode(props: ToolNodeProps) {
  const {
    node,
    status,
    isSelected,
    isExpanded,
    onMouseDown,
    onTouchStart,
    onDelete,
    onToggleExpand,
  } = props;

  const portProps = usePortProps(props);
  const inputTypes = node.inputTypes || [];
  const outputTypes = node.outputTypes || [];
  const width = getNodeWidth(node);
  const accentColor = MODALITY_COLORS.functionCalling;

  const builtInTools = (node.builtInTools || []) as Array<{
    name: string;
    [key: string]: unknown;
  }>;
  const disabledTools = new Set(node.disabledTools || []);
  const enabledBuiltIn = builtInTools.filter(
    (toolItem: { name: string }) => !disabledTools.has(toolItem.name),
  ).length;
  const totalEnabled = enabledBuiltIn;
  const totalTools = builtInTools.length;

  const isRunning = status === "running";
  const isDone = status === "done";
  const isPrism = isRunning || isDone;
  const statusGradient = isRunning
    ? "url(#prism-gradient)"
    : isDone
      ? "url(#done-gradient)"
      : null;

  // Show up to 6 tool name pills when expanded
  const TOOL_PILL_HEIGHT = 20;
  const TOOL_PILL_GAP = 3;
  const MAX_PILLS = 6;
  const allToolNames = builtInTools
    .filter((toolItem: { name: string }) => !disabledTools.has(toolItem.name))
    .map((toolItem: { name: string }) => toolItem.name);
  const displayedTools = allToolNames.slice(0, MAX_PILLS);
  const remainingCount = allToolNames.length - displayedTools.length;
  const pillRows = displayedTools.length + (remainingCount > 0 ? 1 : 0);
  const contentH = isExpanded
    ? pillRows * (TOOL_PILL_HEIGHT + TOOL_PILL_GAP) + 12
    : 0;

  const portRows = Math.max(inputTypes.length, outputTypes.length, 1);
  const portsHeight = portRows * PORT_SECTION_HEIGHT + 12;
  const nodeHeight = HEADER_HEIGHT + contentH + portsHeight;

  const headerContent = (
    <>
      <Wrench size={14} style={{ color: accentColor, flexShrink: 0 }} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: accentColor,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.customName || "Tools"}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text-muted)",
          flexShrink: 0,
          marginLeft: "auto",
        }}
      >
        {totalEnabled}/{totalTools}
      </span>
    </>
  );

  const headerActions = (
    <>
      {status === "running" && (
        <Loader2
          size={12}
          style={{
            color: "#f59e0b",
            animation: "spin 1s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
      <button
        className={`${styles['delete-node-button']} ${isExpanded ? styles['config-button-element-is-active-state'] : ""}`}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onToggleExpand(node.id);
        }}
        title="View tools"
      >
        <Eye size={12} />
      </button>
    </>
  );

  return (
    <NodeShell
      className="workflow-node-component"
      node={node}
      width={width}
      height={nodeHeight}
      status={status}
      isSelected={isSelected}
      accentColor={accentColor}
      headerFillStyle={
        {
          fill: accentColor,
          fillOpacity: 0.1,
        } as React.SVGAttributes<SVGRectElement>
      }
      headerContent={headerContent}
      headerActions={headerActions}
      headerActionsWidth={80}
      typeBadge="Tools"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDelete={onDelete}
      inputTypes={inputTypes}
      outputTypes={outputTypes}
      configOffset={contentH}
      isPrism={isPrism}
      statusGradient={statusGradient}
      portProps={portProps}
    >
      {/* Expanded: show tool name pills */}
      {isExpanded && displayedTools.length > 0 && (
        <foreignObject
          x={4}
          y={HEADER_HEIGHT + 4}
          width={width - 8}
          height={contentH - 8}
        >
          <div className={styles['tool-node-pills']}>
            {displayedTools.map((name) => (
              <span key={name} className={styles['tool-node-pill']}>
                {renderToolName(name)}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className={styles['tool-node-pill-more']}>
                +{remainingCount} more
              </span>
            )}
          </div>
        </foreignObject>
      )}
    </NodeShell>
  );
}

/**
 * WorkflowNode — dispatches to ModelNode, ToolNode, or AssetNode based on nodeType.
 */
export default function WorkflowNode(
  props: ModelNodeProps & AssetNodeProps & ToolNodeProps,
) {
  if (props.node.nodeType === "tools") {
    return <ToolNode {...props} />;
  }
  if (props.node.nodeType) {
    return <AssetNode {...props} />;
  }
  return <ModelNode {...props} />;
}
