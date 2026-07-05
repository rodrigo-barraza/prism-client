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
  text: { icon: Type, label: "Text", color: "oklch(0.585 0.233 277.117)" },
  image: { icon: Image, label: "Image", color: "oklch(0.705 0.191 165.574)" },
  audio: { icon: Volume2, label: "Audio", color: "oklch(0.769 0.188 70.08)" },
  video: { icon: Video, label: "Video", color: "oklch(0.627 0.226 28.324)" },
  pdf: { icon: FileText, label: "PDF", color: "oklch(0.553 0.013 255.487)" },
  embedding: { icon: Hash, label: "Embedding", color: "oklch(0.697 0.148 209.91)" },
  conversation: {
    icon: MessageSquare,
    label: "Conversation",
    color: "oklch(0.606 0.25 293.528)",
  },
  webSearch: { icon: Globe, label: "Web Search", color: "oklch(0.588 0.158 241.966)" },
  codeExecution: { icon: Code, label: "Code Execution", color: "oklch(0.606 0.25 293.528)" },
  functionCalling: {
    icon: Wrench,
    label: "Tool Calling",
    color: "oklch(0.692 0.218 36.634)",
  },
  thinking: { icon: Brain, label: "Thinking", color: "oklch(0.769 0.177 90.046)" },
};

// -- Modality Colors --
export const MODALITY_COLORS = {
  text: "oklch(0.585 0.233 277.117)",
  image: "oklch(0.705 0.191 165.574)",
  audio: "oklch(0.769 0.188 70.08)",
  video: "oklch(0.627 0.226 28.324)",
  pdf: "oklch(0.553 0.013 255.487)",
  embedding: "oklch(0.697 0.148 209.91)",
  conversation: "oklch(0.606 0.25 293.528)",
  webSearch: "oklch(0.588 0.158 241.966)",
  codeExecution: "oklch(0.606 0.25 293.528)",
  functionCalling: "oklch(0.692 0.218 36.634)",
  thinking: "oklch(0.769 0.177 90.046)",
};

// -- Tool Colors --
export const TOOL_COLORS: Record<string, string> = {
  Thinking: "oklch(0.769 0.177 90.046)",
  "Tool Calling": "oklch(0.692 0.218 36.634)",
  "Web Search": "oklch(0.588 0.158 241.966)",
  "Google Search": "oklch(0.588 0.158 241.966)",
  googleSearch: "oklch(0.588 0.158 241.966)",
  "Web Fetch": "oklch(0.588 0.158 241.966)",
  "Code Execution": "oklch(0.606 0.25 293.528)",
  "Computer Use": "oklch(0.705 0.191 165.574)",
  "File Search": "oklch(0.553 0.013 255.487)",
  "URL Context": "oklch(0.697 0.148 209.91)",
  "Image Generation": "oklch(0.627 0.226 28.324)",
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

// -- Tool Emoji: Backend-Hydrated Cache --
// The authoritative emoji source is the backend ToolSchema (fetched via
// PrismService.getBuiltInToolSchemas). This cache is populated once on
// startup and updated whenever schemas are refreshed. Only UI-only
// capability aliases (not real tool names) live here as static fallbacks.

const backendToolEmojiCache = new Map<string, string>();

const CAPABILITY_EMOJI_FALLBACKS: Record<string, string> = {
  Thinking: "🧠",
  "Tool Calling": "🛠️",
  "Web Search": "🌐",
  "Google Search": "🌐",
  googleSearch: "🌐",
  "Web Fetch": "🌐",
  "Code Execution": "⚡",
  "Computer Use": "🖥️",
  "File Search": "🔍",
  "URL Context": "🔗",
  "Image Generation": "🖼️",
};

/**
 * @deprecated Use resolveToolEmoji() instead. Kept for backwards compatibility
 * while consumers migrate. Returns capability fallbacks merged with the
 * backend cache — backend values take priority.
 */
export const TOOL_EMOJI_MAP: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get(_target, property: string) {
      return backendToolEmojiCache.get(property)
        ?? CAPABILITY_EMOJI_FALLBACKS[property]
        ?? undefined;
    },
    has(_target, property: string) {
      return backendToolEmojiCache.has(property)
        || property in CAPABILITY_EMOJI_FALLBACKS;
    },
  },
);

/**
 * Resolve the primary emoji for a tool name.
 * Checks backend cache first, then capability-level UI aliases.
 */
export function resolveToolEmoji(toolName: string): string {
  return backendToolEmojiCache.get(toolName)
    ?? CAPABILITY_EMOJI_FALLBACKS[toolName]
    ?? "🛠️";
}

/**
 * Populate the emoji cache from backend ToolSchema[].
 * Call this after fetching schemas via PrismService.getBuiltInToolSchemas().
 */
export function hydrateToolEmojiCache(toolSchemas: Array<{ name: string; emoji?: string | string[] }>): void {
  if (!Array.isArray(toolSchemas)) {
    console.warn("[hydrateToolEmojiCache] Expected array but received:", toolSchemas);
    return;
  }
  for (const toolSchema of toolSchemas) {
    if (toolSchema.emoji) {
      const resolvedEmoji = Array.isArray(toolSchema.emoji)
        ? toolSchema.emoji[0]
        : toolSchema.emoji;
      if (resolvedEmoji) backendToolEmojiCache.set(toolSchema.name, resolvedEmoji);
    }
  }
}

/**
 * Record a single tool emoji from an SSE event.
 * Called during streaming when toolEmoji arrives on tool_execution events.
 */
export function cacheToolEmoji(toolName: string, emoji: string): void {
  if (toolName && emoji) backendToolEmojiCache.set(toolName, emoji);
}


export interface ToolVisuals {
  Icon: ComponentType<{ size?: number; className?: string }>;
  color: string;
  emoji: string;
}

/**
 * Resolve a tool name to its icon component, color, and emoji.
 * Falls back to Wrench / "Tool Calling" amber for unknown tools.
 */
export function resolveToolVisuals(name: string): ToolVisuals {
  const resolvedEmoji = resolveToolEmoji(name);
  const resolvedIcon = TOOL_ICON_MAP[name];
  if (resolvedIcon) {
    return {
      Icon: resolvedIcon,
      color: TOOL_COLORS[name] || "oklch(0.769 0.188 70.08)",
      emoji: resolvedEmoji,
    };
  }
  return {
    Icon: TOOL_ICON_MAP["Tool Calling"] || Wrench,
    color: TOOL_COLORS["Tool Calling"] || "oklch(0.692 0.218 36.634)",
    emoji: resolvedEmoji,
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
