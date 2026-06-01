"use client";

import type { ComponentType } from "react";
import type { WorkflowNode } from "../types/types";
import {
  Type,
  Image,
  Volume2,
  Video,
  FileText,
  Hash,
  MessageSquare,
  Wrench,
  Globe,
  Code,
  Brain,
  Monitor,
  Search,
  Link,
  ImagePlus,
  Parentheses,
  Terminal,
} from "lucide-react";

// -- Modality Icons (icon, label, color) --
export const MODALITY_ICONS = {
  text: { icon: Type, label: "Text", color: "#6366f1" },
  image: { icon: Image, label: "Image", color: "#10b981" },
  audio: { icon: Volume2, label: "Audio", color: "#f59e0b" },
  video: { icon: Video, label: "Video", color: "#f43f5e" },
  pdf: { icon: FileText, label: "PDF", color: "#64748b" },
  embedding: { icon: Hash, label: "Embedding", color: "#06b6d4" },
  conversation: {
    icon: MessageSquare,
    label: "Conversation",
    color: "#8b5cf6",
  },
  webSearch: { icon: Globe, label: "Web Search", color: "#3b82f6" },
  codeExecution: { icon: Code, label: "Code Execution", color: "#8b5cf6" },
  functionCalling: {
    icon: Wrench,
    label: "Tool Calling",
    color: "#f97316",
  },
  thinking: { icon: Brain, label: "Thinking", color: "#eab308" },
};

// -- Modality Colors --
export const MODALITY_COLORS = {
  text: "#6366f1",
  image: "#10b981",
  audio: "#f59e0b",
  video: "#f43f5e",
  pdf: "#64748b",
  embedding: "#06b6d4",
  conversation: "#8b5cf6",
  webSearch: "#3b82f6",
  codeExecution: "#8b5cf6",
  functionCalling: "#f97316",
  thinking: "#eab308",
};

// -- Tool Colors --
export const TOOL_COLORS: Record<string, string> = {
  Thinking: "#eab308",
  "Tool Calling": "#f97316",
  "Web Search": "#3b82f6",
  "Google Search": "#3b82f6",
  googleSearch: "#3b82f6",
  "Web Fetch": "#3b82f6",
  "Code Execution": "#8b5cf6",
  "Computer Use": "#10b981",
  "File Search": "#64748b",
  "URL Context": "#06b6d4",
  "Image Generation": "#f43f5e",
};

// -- Tool Icon Map (Component references — render as <Icon size={size} />) --
export const TOOL_ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  Thinking: Brain,
  "Tool Calling": Parentheses,
  "Web Search": Globe,
  "Google Search": Globe,
  googleSearch: Globe,
  "Web Fetch": Globe,
  "Code Execution": Terminal,
  "Computer Use": Monitor,
  "File Search": Search,
  "URL Context": Link,
  "Image Generation": ImagePlus,
};

export interface ToolVisuals {
  Icon: ComponentType<{ size?: number; className?: string }>;
  color: string;
}

/**
 * Resolve a tool name to its icon component and color.
 * Falls back to Wrench / "Tool Calling" amber for unknown tools.
 */
export function resolveToolVisuals(name: string): ToolVisuals {
  const resolvedIcon = TOOL_ICON_MAP[name];
  if (resolvedIcon) {
    return {
      Icon: resolvedIcon,
      color: TOOL_COLORS[name] || "#f59e0b",
    };
  }
  return {
    Icon: TOOL_ICON_MAP["Tool Calling"] || Wrench,
    color: TOOL_COLORS["Tool Calling"] || "#f97316",
  };
}

// -- Tools that support toggle switches --
export const TOGGLEABLE_TOOLS = new Set([
  "Thinking",
  "Web Search",
  "Google Search",
  "Web Fetch",
  "Code Execution",
  "URL Context",
  "Tool Calling",
  "Image Generation",
]);

// -- Asset-type Icons --
export const ASSET_ICONS = {
  text: Type,
  audio: Volume2,
  conversation: MessageSquare,
  webSearch: Globe,
  codeExecution: Code,
  functionCalling: Wrench,
  thinking: Brain,
};

// -- Role labels for conversation compound ports --
export const ROLE_LABELS = {
  system: "System Prompt",
  user: "User",
  assistant: "Assistant",
};

// -- Dimension Constants --
export const NODE_WIDTH_BASE = 220;
export const ASSET_NODE_WIDTH_BASE = 200;
export const MODALITY_ICON_WIDTH = 18;
export const MIN_MODALITY_ICONS_FOR_BASE = 3;
export const PORT_RADIUS = 7;
export const HEADER_HEIGHT = 36;
export const PORT_SECTION_HEIGHT = 24;
export const ASSET_CONTENT_HEIGHT = 175;
export const ASSET_CONTENT_HEIGHT_COMPACT = 175;
export const CONFIG_AREA_HEIGHT = 160;
export const ASSET_INFO_HEIGHT = 80;

// -- Compound port ID helpers for conversation input nodes --
// Port format: "{msgIndex}.{modality}" e.g. "0.text", "1.image"
export function parseCompoundPort(portId: string) {
  const dotIndex = portId.indexOf(".");
  if (dotIndex === -1) return null;
  return {
    index: parseInt(portId.substring(0, dotIndex)),
    modality: portId.substring(dotIndex + 1),
  };
}

export function getBaseModality(portId: string) {
  const parsed = parseCompoundPort(portId);
  return parsed ? parsed.modality : portId;
}

// -- Node dimensions --
export function getNodeWidth(node: WorkflowNode) {
  if (node.nodeType) {
    if (node.modality === "conversation") {
      const modalities = (node.supportedModalities || ["text"]).filter(
        (modalityType: string) => modalityType !== "conversation",
      );
      const extraModalityIcons = Math.max(0, modalities.length - MIN_MODALITY_ICONS_FOR_BASE);
      return NODE_WIDTH_BASE + extraModalityIcons * MODALITY_ICON_WIDTH;
    }
    return ASSET_NODE_WIDTH_BASE;
  }
  const rawInputTypes = (node.rawInputTypes || node.inputTypes || []).filter(
    (modalityType: string) => modalityType !== "conversation",
  );
  const extraModalityIcons = Math.max(
    0,
    rawInputTypes.length - MIN_MODALITY_ICONS_FOR_BASE,
  );
  return NODE_WIDTH_BASE + extraModalityIcons * MODALITY_ICON_WIDTH;
}

const TEXT_LINE_HEIGHT = 16; // ~11px font × 1.4 line-height + padding
const TEXT_MIN_HEIGHT = 36;
const CHARS_PER_LINE = 22; // rough estimate for node width

export function getAssetContentHeight(node: WorkflowNode) {
  // Text input nodes: auto-size based on content, up to 175px
  if (node.nodeType === "input" && node.modality === "text") {
    const textContent = (node.content as string) || "";
    if (!textContent) return TEXT_MIN_HEIGHT;
    const lines = textContent.split("\n");
    let totalLines = 0;
    for (const line of lines) {
      totalLines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
    }
    const estimatedHeight = totalLines * TEXT_LINE_HEIGHT + 12; // 12px padding
    return Math.max(TEXT_MIN_HEIGHT, Math.min(estimatedHeight, ASSET_CONTENT_HEIGHT));
  }
  return ASSET_CONTENT_HEIGHT;
}

export function getAssetInfoHeight(node: WorkflowNode) {
  if (node.nodeType === "viewer" || node.modality === "text") return 0;
  return ASSET_INFO_HEIGHT;
}

export function getNodeHeight(node: WorkflowNode, isExpanded = false) {
  if (node.nodeType) {
    const inputCount = (node.inputTypes || []).length;
    const outputCount = (node.outputTypes || []).length;
    const portRows = Math.max(inputCount, outputCount, 1);
    const infoHeight = getAssetInfoHeight(node);
    const contentHeight = isExpanded
      ? getAssetContentHeight(node) + infoHeight
      : 0;
    return HEADER_HEIGHT + contentHeight + portRows * PORT_SECTION_HEIGHT + 12;
  }
  const inputCount = (node.inputTypes || []).length;
  const outputCount = (node.outputTypes || []).length;
  const portRows = Math.max(inputCount, outputCount, 1);
  const configHeight = isExpanded ? CONFIG_AREA_HEIGHT : 0;
  return HEADER_HEIGHT + configHeight + portRows * PORT_SECTION_HEIGHT + 12;
}

export function getPortPosition(
  node: WorkflowNode,
  portType: string,
  portIndex: number,
  configOffset = 0,
) {
  const width = getNodeWidth(node);
  const coordinateX = portType === "input" ? 0 : width;
  const startY = HEADER_HEIGHT + configOffset + 8;
  const spacing = PORT_SECTION_HEIGHT;
  const coordinateY = startY + portIndex * spacing + spacing / 2;
  if (!node.position) return { x: coordinateX, y: coordinateY };
  return { x: node.position.x + coordinateX, y: node.position.y + coordinateY };
}

/**
 * Generate a smooth bezier curve path between two points.
 */
export function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const deltaX = Math.abs(x2 - x1);
  const controlPointOffset = Math.max(deltaX * 0.5, 60);
  return `M ${x1} ${y1} C ${x1 + controlPointOffset} ${y1}, ${x2 - controlPointOffset} ${y2}, ${x2} ${y2}`;
}
