import type { ToolCallEvent, Message } from "../../types/types";

export interface SubAgentActivity {
  phase?: string | null;
  currentTool?: string | null;
  toolCount?: number;
  iteration?: number;
  maxIterations?: number;
  phaseLabel?: string;
  phaseProgress?: number | null;
  tokensPerSecond?: number | null;
  toolNames?: string[] | Record<string, number> | Record<string, string>;
  description?: string;
  toolCalls?: ToolCallEvent[];
  conversationId?: string;
  initialElapsedMilliseconds?: number | null;
}

export interface SubAgentToolActivityItem {
  agent_id?: string;
  description?: string;
  status?: string;
  phase?: string;
  currentTool?: string;
  toolCount?: number;
  iteration?: number;
  toolNames?: Record<string, number>;
  messages?: Message[];
  toolCalls?: ToolCallEvent[];
}

export interface ToolArgs {
  path?: string;
  oldStr?: string;
  newStr?: string;
  pattern?: string;
  query?: string;
  url?: string;
  command?: string;
  code?: string;
  cwd?: string;
  source?: string;
  destination?: string;
  action?: string;
  commands?: string[];
  name?: string;
  members?: Array<{
    description?: string;
    [key: string]: unknown;
  }>;
  to?: string;
  agent_id?: string;
  [key: string]: unknown;
}

export interface ParsedToolResult {
  path?: string;
  content?: string;
  error?: string;
  created?: boolean;
  replacements?: number;
  count?: number;
  totalMatches?: number;
  matches?: Array<{
    file?: string;
    path?: string;
    line?: number | null;
    content?: string;
    text?: string;
    match?: string;
  }>;
  results?: Array<{
    title?: string;
    url?: string;
    link?: string;
    snippet?: string;
    name?: string;
  }>;
  entries?: Array<
    | string
    | {
        name: string;
        path?: string;
        type?: string;
        isDirectory?: boolean;
      }
  >;
  items?: Array<unknown>;
  files?: Array<
    | string
    | {
        path?: string;
        name?: string;
      }
  >;
  url?: string;
  title?: string;
  text?: string;
  markdown?: string;
  exitCode?: number;
  exit_code?: number;
  success?: boolean;
  stdout?: string;
  stderr?: string;
  branch?: string;
  clean?: boolean;
  status?:
    | string
    | Array<{
        path?: string;
        file?: string;
        status?: string;
        state?: string;
      }>;
  diff?: string;
  output?: string;
  commits?: Array<{
    hash?: string;
    sha?: string;
    message?: string;
    subject?: string;
    author?: string;
  }>;
  log?: Array<unknown>;
  source?: string;
  destination?: string;
  action?: string;
  screenshotRef?: string;
  screenshot?: string;
  mimeType?: string;
  elements?: Array<{
    selector: string;
    text?: string;
  }>;
  commandCount?: number;
  canvasSize?: string;
  succeeded?: number;
  failed?: number;
  members?: Array<{
    agent_id?: string;
    description?: string;
    status?: string;
    durationMs?: number;
    toolUses?: number;
    iterations?: number;
    summary?: string;
    result?: string;
    error?: string;
    toolNames?: string[] | Record<string, string>;
    messages?: Message[];
  }>;
  team?: string;
  agent_id?: string;
  result?: unknown;
  agents?: Array<{
    agent_id?: string;
    description?: string;
    status?: string;
    durationMs?: number;
    toolUses?: number;
    iterations?: number;
    summary?: string;
    result?: string;
    error?: string;
    toolNames?: string[] | Record<string, string>;
    messages?: Message[];
  }>;
  turtleEmbedUrl?: string;

  embedUrl?: string;
  conversationId?: string;
  turtleId?: string;
  executionTimeMs?: number;
  width?: number;
  height?: number;
  asciiEmbedUrl?: string;
  ascii?: string;
  audio?: {
    data: string;
    mimeType?: string;
  };
  audioRef?: string;
  duration?: number;
  sampleCount?: number;
  layerCount?: number;
  totalKeyframes?: number;
  isAppend?: boolean;
  voice?: string;
  durationEstimate?: number;
  // Schedule renderer
  timer?: {
    id: string;
    firesAt: string;
    prompt: string;
    mode: "one_shot" | "recurring";
  };
  // 3D mesh / voxel / model / scene renderer
  vertexCount?: number;
  faceCount?: number;
  totalVertices?: number;
  totalFaces?: number;
  sceneEmbedUrl?: string;
  voxelCount?: number;
  totalVoxels?: number;
  objectCount?: number;
  totalObjects?: number;
  // QR code renderer
  qrImageUrl?: string;
  qrId?: string;
  dataLength?: number;
  // LaTeX renderer
  latexEmbedUrl?: string;
  latexId?: string;
  // Diagram renderer
  diagramEmbedUrl?: string;
  diagramId?: string;
  // Image manipulation renderer
  imageUrl?: string;
  imageId?: string;
  metadata?: Record<string, unknown>;
  // Emoji Kitchen renderer
  leftEmoji?: string;
  leftEmojiCodepoint?: string;
  rightEmoji?: string;
  rightEmojiCodepoint?: string;
  gStaticUrl?: string;
  alt?: string;
  date?: string;
  isLatest?: boolean;
  gBoardOrder?: string;
  emoji?: string;
  combinations?: Array<{
    emoji: string;
    combination: {
      gStaticUrl: string;
      alt: string;
    };
  }>;
  // Vector animation renderer
  animation?: {
    layers?: Array<unknown>;
    duration?: number;
  };
  // Self-describing display metadata (see ToolResultDisplay)
  display?: ToolResultDisplay;
}

/**
 * Self-describing display metadata carried by visual tool results.
 * Any tool result with `display` renders inline in the conversation and
 * inside its tool card without needing a per-tool renderer: "embed"
 * becomes an auto-resizing iframe, "image" an <img>, "video"/"audio"
 * native media players. Emitted by tools-service (embed tools,
 * download_video) and prism-service (generated images, screenshots).
 */
export interface ToolResultDisplay {
  kind: "embed" | "image" | "video" | "audio";
  url: string;
  /** Fallback iframe height in px until the embed reports its own size. */
  height?: number;
  title?: string;
  /** Poster image shown before a video plays (video only). */
  poster?: string;
}

export interface RendererProps {
  result: unknown;
  args?: ToolArgs;
  streamingOutput?: string;
  language?: string;
  subAgentToolActivity?: Record<
    string,
    SubAgentActivity | SubAgentToolActivityItem
  > | null;
  /** Cumulative offset from prior create_subagents calls so numbering is global */
  subAgentStartIndex?: number;
  /** True when rendered inline in the message body (suppress raw/output toggles) */
  hideToggles?: boolean;
}

export interface ToolResultViewProps {
  toolCall: {
    id?: string;
    name: string;
    args?: ToolArgs;
    result?: unknown;
    status?: string;
  };
  streamingOutput?: string;
  subAgentToolActivity?: Record<
    string,
    SubAgentActivity | SubAgentToolActivityItem
  > | null;
  hideToggles?: boolean;
  /** Cumulative offset from prior create_subagents calls so numbering is global */
  subAgentStartIndex?: number;
}
