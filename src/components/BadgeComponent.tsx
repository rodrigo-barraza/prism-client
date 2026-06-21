"use client";

import { AGENTLESS_AGENT, EV_USER_TYPING } from "@/constants";

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import * as THREE from "three";
import {
  Coins,
  Hash,
  Zap,
  Timer,
  Clock,
  MessageSquare,
  LetterText,
  FunctionSquare,
  Cpu,
  Layers,
  FolderKanban,
  User as UserIcon,
  FileText,
  Folder,
  Volume2,
} from "lucide-react";
import {
  TooltipComponent,
  BadgeComponent as SharedBadgeComponent,
} from "@rodrigo-barraza/components-library";

import { renderAgentIcon } from "./AgentPickerComponent";
import ThreeCanvasComponent from "./ThreeCanvasComponent";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import { formatCost, formatElapsedTime, renderToolName } from "@rodrigo-barraza/utilities-library";
import { resolveToolVisuals } from "./WorkflowNodeConstantsComponent";

// Scoped Stylesheets from individual components
import costStyles from "./CostBadgeComponent.module.css";
import tokenStyles from "./TokenCountBadgeComponent.module.css";
import requestStyles from "./RequestCountBadgeComponent.module.css";
import throughputStyles from "./ThroughputBadgeComponent.module.css";
import stopwatchStyles from "./StopwatchBadgeComponent.module.css";
import messageStyles from "./MessageCountBadgeComponent.module.css";
import wordStyles from "./WordBadgeComponent.module.css";
import toolStyles from "./ToolCountBadgeComponent.module.css";
import toolItemStyles from "./ToolBadgeComponent.module.css";
import modelStyles from "./ModelBadgeComponent.module.css";
import providersStyles from "./ProvidersBadgeComponent.module.css";
import modelTypeStyles from "./ModelTypeBadgeComponent.module.css";
import projectStyles from "./ProjectBadgeComponent.module.css";
import userStyles from "./UserBadgeComponent.module.css";
import agentStyles from "./AgentBadgeComponent.module.css";
import mentionStyles from "./MentionBadgeComponent.module.css";

export { mentionStyles as mentionBadgeStyles };

export interface ClientAgent {
  id?: string;
  name?: string;
  description?: string;
  project?: string;
  color?: string;
  icon?: string;
  avatar?: string;
  toolCount?: number;
}

export type BadgeProps =
  | {
      type?: undefined;
      variant?:
        | "default"
        | "success"
        | "warning"
        | "error"
        | "info"
        | "accent"
        | "endpoint"
        | "provider"
        | string;
      mini?: boolean;
      className?: string;
      children?: React.ReactNode;
      [key: string]: unknown;
    }
  | {
      type: "cost";
      cost?: number;
      showIcon?: boolean;
      className?: string;
      mini?: boolean;
      formatFn?: (value: number) => string;
    }
  | {
      type: "tokens";
      value: number;
      label?: string;
      showIcon?: boolean;
      className?: string;
      mini?: boolean;
    }
  | {
      type: "requests";
      count: number;
      showIcon?: boolean;
      className?: string;
      mini?: boolean;
    }
  | {
      type: "throughput";
      liveTokensPerSecond: number | null;
      averageTokensPerSecond?: number | null;
      isActivelyGenerating?: boolean;
      turnActive?: boolean;
    }
  | {
      type: "stopwatch";
      seconds?: number;
      startTime?: string | number | null;
      live?: boolean;
      variant?: "conversation" | "processing";
      className?: string;
    }
  | {
      type: "messages";
      count: number;
      deletedCount?: number;
      showIcon?: boolean;
      className?: string;
      mini?: boolean;
    }
  | {
      type: "words";
      count: number;
      className?: string;
      mini?: boolean;
    }
  | {
      type: "tools";
      count: number;
      color?: string;
    }
  | {
      type: "model";
      models?: string[];
      provider?: string;
      providers?: string[];
      className?: string;
      mini?: boolean;
      noHover?: boolean;
    }
  | {
      type: "providers";
      providers?: string[];
      className?: string;
      mini?: boolean;
    }
  | {
      type: "model-type";
      modelType?: string;
      className?: string;
      mini?: boolean;
    }
  | {
      type: "project";
      project?: string | null;
      className?: string;
    }
  | {
      type: "user";
      username?: string;
      className?: string;
    }
  | {
      type: "agent";
      agent?: string | ClientAgent;
      agents?: (string | ClientAgent)[];
      size?: number;
      iconSize?: number;
      animation?: boolean;
      className?: string;
    }
  | {
      type: "mention";
      path: string;
      name?: string;
      mentionType?: "file" | "directory";
      lineStart?: number | null;
      lineEnd?: number | null;
      stale?: boolean;
      knownPaths?: Set<string> | null;
      onFileOpen?: (path: string) => void;
    }
  | {
      type: "tool-item";
      name: string;
      count?: number;
      active?: boolean;
      variant?: "default" | "compact" | "condensed";
      tooltip?: string;
    }
  | {
      type: "dateTime";
      date?: string | Date | number | null;
      showIcon?: boolean;
      relative?: boolean;
      highlightNew?: boolean;
      className?: string;
    };

// ═══════════════════════════════════════════════════════════════════════
// 2. Constants & Clean Name Helpers
// ═══════════════════════════════════════════════════════════════════════

// Static fallback label map — used before the server config loads.
// Once config arrives, `registerModelLabels()` augments this with the
// full catalog so new models don't require a client code change.
const STATIC_MODEL_LABELS: Record<string, string> = {
  "gpt-5.2": "GPT 5.2",
  "gpt-5-mini": "GPT 5 Mini",
  "gpt-5-nano": "GPT 5 Nano",
  "gpt-4.1-mini": "GPT 4.1 Mini",
  "gpt-4.1-nano": "GPT 4.1 Nano",
  "gpt-4o": "GPT 4o",
  "gpt-4": "GPT 4",
  "gpt-5.3-chat-latest": "GPT 5.3 Chat",
  "gpt-5.3-codex": "GPT 5.3 Codex",
  "gpt-5.4": "GPT 5.4",
  "gpt-5.4-pro": "GPT 5.4 Pro",
  "gpt-5.4-mini": "GPT 5.4 Mini",
  "gpt-5.4-nano": "GPT 5.4 Nano",
  "gpt-4o-mini-tts": "GPT 4o Mini TTS",
  "gpt-image-1.5": "GPT Image 1.5",
  "text-embedding-3-small": "Embedding 3 Small",
  "text-embedding-3-large": "Embedding 3 Large",
  "text-embedding-ada-002": "Ada 002",
  "gpt-4o-transcribe": "GPT-4o Transcribe",
  "gpt-4o-mini-transcribe": "GPT-4o Mini Transcribe",
  "whisper-1": "Whisper V2",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-5-20251101": "Opus 4.5",
  "claude-opus-4-6": "Opus 4.6",
  "claude-opus-4-7": "Opus 4.7",
  "claude-opus-4-8": "Opus 4.8",
  "claude-fable-5": "Fable 5",
  "claude-mythos-5": "Mythos 5",
  "gemini-3-flash-preview": "Gemini 3 Flash",
  "gemini-3-pro-preview": "Gemini 3 Pro",
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
  "gemini-3.1-flash-live-preview": "Gemini 3.1 Flash Live",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-2.0-flash-lite-preview-tts": "Gemini 2.0 Flash Lite TTS",
  "gemini-2.5-flash-lite-preview-tts": "Gemini 2.5 Flash Lite TTS",
  "gemini-2.5-flash-preview-tts": "Gemini 2.5 Flash TTS",
  "gemini-2.5-pro-preview-tts": "Gemini 2.5 Pro TTS",
  "espeak-ng": "eSpeak NG",
  eleven_turbo_v2: "Eleven Turbo v2",
  "inworld-tts-1.5-max": "Inworld TTS 1.5 Max",
  "inworld-tts-1.5-mini": "Inworld TTS 1.5 Mini",
  "gemini-3-pro-image-preview": "Gemini 3 Pro Image",
  "gemini-3.1-flash-image-preview": "Gemini 3.1 Flash Image",
  "gemini-embedding-2-preview": "Gemini Embedding 2",
  "gemini-embedding-001": "Gemini Embedding",
  "gemini-2.0-flash-preview-stt": "Gemini 2.0 Flash STT",
  "gemini-3-flash-preview-stt": "Gemini 3 Flash",
  "gemini-3-pro-preview-stt": "Gemini 3 Pro",
  "gemini-3.5-flash-stt": "Gemini 3.5 Flash",
};

// Dynamic labels merged from server config (populated by registerModelLabels)
let dynamicModelLabels: Record<string, string> = {};

/**
 * Merge model labels from the server's /config response into the lookup map.
 * Called once after PrismConfig loads — ensures new models added to the
 * server catalog are immediately available without a client code change.
 */
export function registerModelLabels(labels: Record<string, string>): void {
  dynamicModelLabels = { ...dynamicModelLabels, ...labels };
}

// Unified lookup — dynamic (server) labels take priority over static fallback
const KNOWN_MODELS = new Proxy({} as Record<string, string>, {
  get(_target, property: string) {
    return dynamicModelLabels[property] ?? STATIC_MODEL_LABELS[property] ?? undefined;
  },
  has(_target, property: string) {
    return property in dynamicModelLabels || property in STATIC_MODEL_LABELS;
  },
  ownKeys() {
    return Array.from(new Set([...Object.keys(dynamicModelLabels), ...Object.keys(STATIC_MODEL_LABELS)]));
  },
  getOwnPropertyDescriptor(_target, property: string | symbol) {
    return {
      enumerable: true,
      configurable: true,
      value: dynamicModelLabels[property as string] ?? STATIC_MODEL_LABELS[property as string] ?? undefined,
    };
  },
});

export function cleanModelName(raw: string): string {
  if (!raw) return "";
  const name = raw.trim();

  const getBaseName = (modelString: string) => {
    let extractedBaseName = modelString;
    if (extractedBaseName.includes(":")) {
      extractedBaseName = extractedBaseName.split(":").slice(1).join(":");
    }
    extractedBaseName = (extractedBaseName.includes("/") ? extractedBaseName.split("/").pop() : extractedBaseName) || "";
    extractedBaseName = (extractedBaseName.includes("\\") ? extractedBaseName.split("\\").pop() : extractedBaseName) || "";
    return extractedBaseName.trim();
  };

  const base = getBaseName(name);
  if (KNOWN_MODELS[base]) return KNOWN_MODELS[base];
  if (KNOWN_MODELS[name]) return KNOWN_MODELS[name];

  let cleaned = name;
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    cleaned = parts.slice(1).join(":");
  }

  cleaned = (cleaned.includes("/") ? cleaned.split("/").pop() : cleaned) || "";
  cleaned =
    (cleaned.includes("\\") ? cleaned.split("\\").pop() : cleaned) || "";
  cleaned = cleaned.replace(/\.(gguf|bin|ckpt|pt)$/i, "");
  cleaned = cleaned.replace(/@[\w.]+$/, "");
  cleaned = cleaned.replace(/[-_]/g, " ");
  cleaned = cleaned.replace(/\b([a-z])/g, (_: string, matchChar: string) =>
    matchChar.toUpperCase(),
  );
  cleaned = cleaned.replace(
    /(\d+(?:\.\d+)?)\s*b\b/gi,
    (_: string, numberMatch: string) => `${numberMatch}B`,
  );

  const acronyms: Record<string, string> = {
    Gpt: "GPT",
    Tts: "TTS",
    Llm: "LLM",
    Hf: "HF",
    Tii: "TII",
    Ibm: "IBM",
    Pdf: "PDF",
    Vram: "VRAM",
    Cpu: "CPU",
    Gpu: "GPU",
    It: "IT",
    Deepseek: "DeepSeek",
  };
  cleaned = cleaned.replace(
    /\b([a-zA-Z]+)\b/g,
    (word) => acronyms[word] || word,
  );

  return cleaned.trim();
}

const MODEL_TYPE_META = {
  conversation: { icon: MessageSquare, label: "Conversation" },
  audio: { icon: Volume2, label: "Audio" },
  embed: { icon: Cpu, label: "Embed" },
};

const AGENT_GRADIENTS: Record<string, string[]> = {
  NONE: ["#64748b", "#94a3b8"],
  CODING: ["#6366f1", "#818cf8"],
  OMNI: ["#b91c1c", "#dc2626"],
  LUPOS: ["#7c3aed", "#a855f7"],
  STICKERS: ["#10b981", "#34d399"],
  DIGEST: ["#f59e0b", "#ef4444"],
  LIGHTS: ["#eab308", "#f59e0b"],
  OOG: ["#78716c", "#a8a29e"],
  IMAGE: ["#ec4899", "#8b5cf6"],
};
const FALLBACK_GRADIENT = ["#8b5cf6", "#06b6d4"];

function resolveGradient(agent?: string | ClientAgent | null): string[] {
  if (typeof agent === "string") {
    return (AGENT_GRADIENTS as Record<string, string[]>)[agent] || FALLBACK_GRADIENT;
  }
  if (agent?.color) return [agent.color, agent.color];
  return (
    (agent?.id && (AGENT_GRADIENTS as Record<string, string[]>)[agent.id]) ||
    FALLBACK_GRADIENT
  );
}

const TEXTURE_SIZE = 256;

type ThreeScene = InstanceType<typeof THREE.Scene>;
type ThreePerspectiveCamera = InstanceType<typeof THREE.PerspectiveCamera>;
type ThreeMesh = InstanceType<typeof THREE.Mesh>;
type ThreeCanvasTexture = InstanceType<typeof THREE.CanvasTexture>;

interface SetupState {
  scene: ThreeScene;
  camera: ThreePerspectiveCamera;
  THREE: typeof THREE;
}

interface TickState {
  elapsed: number;
}

function useCoinAnimation({ agent, size }: { agent?: string | ClientAgent | null; size: number }) {
  const meshReference = useRef<ThreeMesh | null>(null);
  const textureReference = useRef<ThreeCanvasTexture | null>(null);
  const textureCanvasReference = useRef<HTMLCanvasElement | null>(null);
  const iconCanvasReference = useRef<HTMLCanvasElement | null>(null);
  const coinWrapperReference = useRef<HTMLSpanElement | null>(null);
  const gradient = useMemo(() => resolveGradient(agent), [agent]);

  const typingSpeedMultiplier = useRef(1.0);
  const typingDecayTimerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDecayRequestAnimationFrameId = useRef<number | null>(null);

  const BASE_ROTATION_SPEED = 1.2;
  const SPEED_INCREMENT_PER_KEYSTROKE = 0.6;
  const MAXIMUM_SPEED_MULTIPLIER = 12;
  const DECAY_RATE = 0.92;
  const TYPING_IDLE_DELAY_MILLISECONDS = 400;

  useEffect(() => {
    const handleTypingEvent = () => {
      typingSpeedMultiplier.current = Math.min(
        typingSpeedMultiplier.current + SPEED_INCREMENT_PER_KEYSTROKE,
        MAXIMUM_SPEED_MULTIPLIER,
      );

      if (coinWrapperReference.current) {
        coinWrapperReference.current.setAttribute("data-is-typing-state", "true");
      }

      if (typingDecayTimerId.current) {
        clearTimeout(typingDecayTimerId.current);
      }
      if (typingDecayRequestAnimationFrameId.current) {
        cancelAnimationFrame(typingDecayRequestAnimationFrameId.current);
        typingDecayRequestAnimationFrameId.current = null;
      }

      typingDecayTimerId.current = setTimeout(() => {
        const decayLoop = () => {
          typingSpeedMultiplier.current =
            1.0 +
            (typingSpeedMultiplier.current - 1.0) * DECAY_RATE;

          if (typingSpeedMultiplier.current <= 1.02) {
            typingSpeedMultiplier.current = 1.0;
            typingDecayRequestAnimationFrameId.current = null;

            if (coinWrapperReference.current) {
              coinWrapperReference.current.setAttribute("data-is-typing-state", "false");
            }
            return;
          }
          typingDecayRequestAnimationFrameId.current = requestAnimationFrame(decayLoop);
        };
        decayLoop();
      }, TYPING_IDLE_DELAY_MILLISECONDS);
    };

    window.addEventListener(EV_USER_TYPING, handleTypingEvent);
    return () => {
      window.removeEventListener(EV_USER_TYPING, handleTypingEvent);
      if (typingDecayTimerId.current) clearTimeout(typingDecayTimerId.current);
      if (typingDecayRequestAnimationFrameId.current) cancelAnimationFrame(typingDecayRequestAnimationFrameId.current);
    };
  }, []);

  const handleSetup = useCallback(
    ({ scene, camera, THREE }: SetupState) => {
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);

      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = TEXTURE_SIZE;
      textureCanvas.height = TEXTURE_SIZE;
      const context = textureCanvas.getContext("2d");
      if (context) {
        const radius = TEXTURE_SIZE * 0.16;
        context.beginPath();
        context.roundRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE, radius);
        context.closePath();
        const canvasGradient = context.createLinearGradient(
          0,
          0,
          TEXTURE_SIZE,
          TEXTURE_SIZE,
        );
        canvasGradient.addColorStop(0, gradient[0]);
        canvasGradient.addColorStop(1, gradient[1]);
        context.fillStyle = canvasGradient;
        context.fill();
      }
      textureCanvasReference.current = textureCanvas;

      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textureReference.current = texture;

      const geometry = new THREE.PlaneGeometry(1.2, 1.2);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      meshReference.current = mesh;
      scene.add(mesh);
    },
    [gradient],
  );

  useEffect(() => {
    if (!iconCanvasReference.current) return;

    const animationFrameId = requestAnimationFrame(() => {
      if (!textureCanvasReference.current) return;
      const iconSize = TEXTURE_SIZE * 0.55;
      const iconOffset = (TEXTURE_SIZE - iconSize) / 2;
      const context = (textureCanvasReference.current as HTMLCanvasElement).getContext("2d");
      if (!context) return;

      const imageElement = (iconCanvasReference.current as HTMLElement).querySelector(
        "img",
      );
      if (imageElement) {
        const drawAvatarImage = () => {
          context.drawImage(imageElement, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
          if (textureReference.current)
            (textureReference.current as { needsUpdate: boolean }).needsUpdate = true;
        };
        if (imageElement.complete && imageElement.naturalWidth > 0) {
          drawAvatarImage();
        } else {
          imageElement.onload = drawAvatarImage;
        }
        return;
      }

      const svg = (iconCanvasReference.current as HTMLElement).querySelector("svg");
      if (!svg) return;

      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const markup = svg.outerHTML.replace(/currentColor/g, "#ffffff");

      const image = new Image();
      const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (!textureCanvasReference.current) return;
        context.drawImage(image, iconOffset, iconOffset, iconSize, iconSize);
        if (textureReference.current)
          (textureReference.current as { needsUpdate: boolean }).needsUpdate = true;
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
      };
      image.src = objectUrl;
    });

    return () => cancelAnimationFrame(animationFrameId);
  }, [agent]);

  const rotationAccumulator = useRef(0);
  const lastElapsed = useRef(0);

  const handleTick = useCallback(({ elapsed }: TickState) => {
    if (!meshReference.current) return;
    const deltaTime = elapsed - lastElapsed.current;
    lastElapsed.current = elapsed;
    rotationAccumulator.current +=
      deltaTime * BASE_ROTATION_SPEED * typingSpeedMultiplier.current;
    meshReference.current.rotation.y = rotationAccumulator.current;
  }, []);

  return { iconRef: iconCanvasReference, coinWrapRef: coinWrapperReference, handleSetup, handleTick, size, agent };
}

function CoinStaticRenderer({ agent, size }: { agent?: string | ClientAgent | null; size: number }) {
  const { iconRef: iconCanvasReference, coinWrapRef: coinWrapperReference, handleSetup, handleTick } = useCoinAnimation({
    agent,
    size,
  });

  return (
    <span ref={coinWrapperReference} data-is-typing-state="false">
      <span ref={iconCanvasReference} className={agentStyles['hidden-icon']}>
        {renderAgentIcon(agent, Math.round(TEXTURE_SIZE * 0.5))}
      </span>
      <ThreeCanvasComponent
        onSetup={handleSetup}
        onTick={handleTick}
        cameraFov={5}
        cameraPosition={[0, 0, 20]}
        alpha
        antialias
        toneMapping="None"
        className={agentStyles['coin-canvas']}
        style={{ width: size, height: size }}
      />
    </span>
  );
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  "Tool Calling": "Tool Calling",
  Thinking: "Thinking",
  "Web Search": "Web Search",
  "Google Search": "Web Search",
  "Code Execution": "Code Execution",
  "Computer Use": "Computer Use",
  "File Search": "File Search",
  "URL Context": "URL Context",
  "Image Generation": "Image Gen",
};

const TOOL_SHORT_NAMES: Record<string, string> = {
  Thinking: "Think",
  "Tool Calling": "Tool",
  "Web Search": "Web",
  "Google Search": "Web",
  "Code Execution": "Code",
  "Computer Use": "Computer",
  "File Search": "File",
  "URL Context": "URL",
  "Image Generation": "Image",
};

function resolveDisplayName(name: string, variant: string = "default"): string {
  if (variant === "condensed" && TOOL_SHORT_NAMES[name]) {
    return TOOL_SHORT_NAMES[name];
  }
  if (TOOL_DISPLAY_NAMES[name]) {
    return TOOL_DISPLAY_NAMES[name];
  }
  return renderToolName(name);
}

function StopwatchBadge({
  seconds,
  startTime,
  live: externalLive,
  variant = "processing",
  className = "",
}: {
  seconds?: number;
  startTime?: string | number | null;
  live?: boolean;
  variant?: "conversation" | "processing";
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isLive = !!startTime && seconds == null;

  useEffect(() => {
    if (!isLive) return;
    const immediate = setTimeout(() => setNowMs(Date.now()), 0);
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(id);
    };
  }, [isLive, startTime]);

  let displaySeconds: number;
  if (isLive && startTime) {
    const start =
      typeof startTime === "number"
        ? startTime
        : new Date(startTime).getTime();
    displaySeconds = Math.max(0, (nowMs - start) / 1000);
  } else {
    displaySeconds = seconds || 0;
  }

  if (displaySeconds <= 0 && !isLive) return null;

  const isConversationVariant = variant === "conversation";
  const IconComponent = isConversationVariant ? Clock : Timer;
  const showPulse = isLive || externalLive;
  const tooltipPrefix = isConversationVariant ? "Conversation" : "Processing";
  const tooltipLabel = `${tooltipPrefix}: ${formatElapsedTime(displaySeconds)}`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <span
        className={`${stopwatchStyles['badge']} ${showPulse ? stopwatchStyles['live'] : ""} ${className}`}
      >
        <IconComponent size={11} />
        {formatElapsedTime(displaySeconds)}
      </span>
    </TooltipComponent>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Unified BadgeComponent Implementation
// ═══════════════════════════════════════════════════════════════════════

export default function BadgeComponent(props: BadgeProps) {
  // --- 0. Generic Fallback Mode ---
  if (!props.type) {
    const { children, variant, mini, className, ...rest } = props;
    return (
      <SharedBadgeComponent
        variant={variant}
        mini={mini}
        className={className}
        {...rest}
      >
        {children}
      </SharedBadgeComponent>
    );
  }

  switch (props.type) {
    // --- 1. Cost ---
    case "cost": {
      const {
        cost = 0,
        showIcon = true,
        className = "",
        mini = false,
        formatFn = formatCost,
      } = props;
      return (
        <SharedBadgeComponent
          type="metric"
          value={cost}
          formatFn={formatFn}
          icon={showIcon ? <Coins size={mini ? 8 : 10} /> : undefined}
          color="green"
          tween
          round={false}
          mini={mini}
          className={className}
          tooltip={`Estimated cost: ${formatCost(cost)}`}
        />
      );
    }

    // --- 2. Tokens ---
    case "tokens": {
      const {
        value,
        label = "tokens",
        showIcon = true,
        className = "",
        mini = false,
      } = props;
      return (
        <SharedBadgeComponent
          type="metric"
          value={value}
          label={label}
          icon={showIcon ? <Hash size={mini ? 8 : 10} /> : undefined}
          color="cyan"
          tween
          mini={mini}
          className={className}
          tooltip={`${value.toLocaleString()} tokens ${label}`}
        />
      );
    }

    // --- 3. Requests ---
    case "requests": {
      const { count, showIcon = true, className = "", mini = false } = props;
      const suffix = count !== 1 ? "requests" : "request";
      return (
        <SharedBadgeComponent
          type="metric"
          value={count}
          label={suffix}
          icon={showIcon ? <Zap size={mini ? 8 : 10} /> : undefined}
          color="amber"
          tween
          mini={mini}
          className={className}
          tooltip={`${count.toLocaleString()} API ${suffix}`}
        />
      );
    }

    // --- 4. Throughput ---
    case "throughput": {
      const { liveTokensPerSecond, averageTokensPerSecond, isActivelyGenerating, turnActive } =
        props;
      if (liveTokensPerSecond !== null && liveTokensPerSecond !== undefined) {
        const variant =
          isActivelyGenerating || turnActive
            ? throughputStyles['live']
            : throughputStyles['stale'];
        return (
          <span className={`${throughputStyles['badge']} ${variant}`}>
            <GaugeIcon size={10} className={throughputStyles['icon']} />
            {liveTokensPerSecond.toFixed(1)} tok/s
          </span>
        );
      }
      if (averageTokensPerSecond != null) {
        return (
          <span
            className={`${throughputStyles['badge']} ${throughputStyles['average']}`}
          >
            <GaugeIcon size={10} className={throughputStyles['icon']} />
            {averageTokensPerSecond.toFixed(1)} tok/s
          </span>
        );
      }
      return null;
    }

    // --- 5. Stopwatch ---
    case "stopwatch": {
      const { seconds, startTime, live, variant, className } = props;
      return (
        <StopwatchBadge
          seconds={seconds}
          startTime={startTime}
          live={live}
          variant={variant}
          className={className}
        />
      );
    }

    // --- 6. Messages ---
    case "messages": {
      const {
        count,
        deletedCount = 0,
        showIcon = true,
        className = "",
        mini = false,
      } = props;
      const suffix = count !== 1 ? "messages" : "message";
      const tooltipLabel =
        deletedCount > 0
          ? `${count.toLocaleString()} ${suffix} (${deletedCount} deleted)`
          : `${count.toLocaleString()} ${suffix}`;

      return (
        <SharedBadgeComponent
          type="metric"
          value={count}
          label={suffix}
          icon={showIcon ? <MessageSquare size={mini ? 8 : 10} /> : undefined}
          color="purple"
          tween
          mini={mini}
          className={className}
          tooltip={tooltipLabel}
        />
      );
    }

    // --- 7. Words ---
    case "words": {
      const { count, className = "", mini = false } = props;
      if (!count || count <= 0) return null;
      const suffix = count !== 1 ? "words" : "word";
      const tooltipLabel = `${count.toLocaleString()} ${suffix}`;

      return (
        <TooltipComponent label={tooltipLabel} position="top">
          <span
            className={`${wordStyles.badge} ${mini ? wordStyles.mini : ""} ${className}`}
          >
            <LetterText size={mini ? 8 : 10} />
            {count.toLocaleString()} {suffix}
          </span>
        </TooltipComponent>
      );
    }

    // --- 8. Tools Available Count ---
    case "tools": {
      const { count, color } = props;
      if (count == null || count === 0) return null;
      const suffix = count !== 1 ? "Tools" : "Tool";
      const tooltipLabel = `${count} ${suffix} available`;

      return (
        <TooltipComponent label={tooltipLabel} position="top">
          <div
            className={toolStyles.badge}
            style={
              color
                ? ({ "--tool-badge-accent": color } as React.CSSProperties)
                : undefined
            }
          >
            <FunctionSquare size={9} className={toolStyles.icon} />
            <span className={toolStyles.label}>
              {count} {suffix}
            </span>
          </div>
        </TooltipComponent>
      );
    }

    // --- 9. Model ---
    case "model": {
      const {
        models = [],
        provider,
        providers,
        className = "",
        mini = false,
        noHover = false,
      } = props;
      if (!models || models.length === 0) {
        return <span style={{ color: "var(--text-muted)" }}>—</span>;
      }

      const iconSize = mini ? 8 : 10;
      const cls = `${modelStyles['badge']} ${mini ? modelStyles['mini'] : ""} ${noHover ? modelStyles['no-hover'] : ""} ${className}`;
      const resolvedProvider =
        provider || (providers?.length === 1 ? providers[0] : null);
      const providerIcon = resolvedProvider ? (
        <ProviderLogo provider={resolvedProvider} size={iconSize} />
      ) : null;

      if (models.length === 1) {
        const rawName = models[0];
        const cleanName = cleanModelName(rawName);
        const hasCleanName =
          cleanName && cleanName.toLowerCase() !== rawName.toLowerCase();

        return (
          <TooltipComponent label={rawName} position="top">
            <span className={cls}>
              {providerIcon || <Cpu size={iconSize} />}
              {hasCleanName ? (
                <>
                  <span
                    className={`${modelStyles['model-name']} ${modelStyles['model-name-clean']}`}
                  >
                    {cleanName}
                  </span>
                  <span
                    className={`${modelStyles['model-name']} ${modelStyles['model-name-raw']}`}
                  >
                    {rawName}
                  </span>
                </>
              ) : (
                <span className={modelStyles['model-name']}>{rawName}</span>
              )}
            </span>
          </TooltipComponent>
        );
      }

      return (
        <TooltipComponent label={models.join(", ")} position="top">
          <span className={cls}>
            {providerIcon || <Cpu size={iconSize} />}
            {models.length} models
          </span>
        </TooltipComponent>
      );
    }

    // --- 10. Providers breakdown ---
    case "providers": {
      const { providers = [], className = "", mini = false } = props;
      if (!providers || providers.length === 0) {
        return <span style={{ color: "var(--text-muted)" }}>—</span>;
      }

      const iconSize = mini ? 8 : 10;
      const cls = `${providersStyles['badge']} ${mini ? providersStyles['mini'] : ""} ${className}`;
      const displayLabel = (key: string) => resolveProviderLabel(key);

      if (providers.length === 1) {
        return (
          <TooltipComponent label={displayLabel(providers[0])} position="top">
            <span className={cls}>
              <ProviderLogo provider={providers[0]} size={iconSize} />
              <span className={providersStyles['provider-name']}>
                {displayLabel(providers[0])}
              </span>
            </span>
          </TooltipComponent>
        );
      }

      const tooltipText = providers.map(displayLabel).join(", ");
      return (
        <TooltipComponent label={tooltipText} position="top">
          <span className={cls}>
            <Layers size={iconSize} />
            {providers.length} providers
          </span>
        </TooltipComponent>
      );
    }

    // --- 11. Model Type ---
    case "model-type": {
      const { modelType, className = "", mini = false } = props;
      if (!modelType) {
        return <span style={{ color: "var(--text-muted)" }}>—</span>;
      }

      const meta = (modelType in MODEL_TYPE_META)
        ? MODEL_TYPE_META[modelType as keyof typeof MODEL_TYPE_META]
        : {
            icon: MessageSquare,
            label: modelType,
          };
      const Icon = meta.icon;
      const cls = `${modelTypeStyles['badge']} ${modelTypeStyles[modelType] || ""} ${mini ? modelTypeStyles['mini'] : ""} ${className}`;

      return (
        <TooltipComponent label={`${meta.label} model`} position="top">
          <span className={cls}>
            <Icon size={mini ? 8 : 10} />
            <span>{meta.label}</span>
          </span>
        </TooltipComponent>
      );
    }

    // --- 12. Project ---
    case "project": {
      const { project, className = "" } = props;
      if (!project) return null;
      return (
        <TooltipComponent label={`Project: ${project}`} position="top">
          <span className={`${projectStyles['badge']} ${className}`}>
            <FolderKanban size={10} />
            {project}
          </span>
        </TooltipComponent>
      );
    }

    // --- 13. User ---
    case "user": {
      const { username, className = "" } = props;
      if (!username || username === "unknown") return null;
      return (
        <TooltipComponent label={`User: ${username}`} position="top">
          <span className={`${userStyles['badge']} ${className}`}>
            <UserIcon size={10} />
            {username}
          </span>
        </TooltipComponent>
      );
    }

    // --- 14. Agent ---
    case "agent": {
      const {
        agent,
        agents,
        size = 22,
        iconSize = 13,
        animation = false,
        className = "",
      } = props;

      if (Array.isArray(agents) && agents.length > 0) {
        if (agents.length === 1) {
          return (
            <BadgeComponent
              type="agent"
              agent={agents[0]}
              size={size}
              iconSize={iconSize}
              animation={animation}
              className={className}
            />
          );
        }

        const tooltipContent = (
          <div className={agentStyles["agent-tooltip-list"]}>
            {agents.map((singleAgent: string | ClientAgent, index: number) => {
              const normalizedAgent: ClientAgent =
                typeof singleAgent === "string"
                  ? { id: singleAgent, name: singleAgent }
                  : singleAgent;
              const [colorStart, colorEnd] = resolveGradient(normalizedAgent);
              const gradientStyle = {
                background: `linear-gradient(135deg, ${colorStart} 0%, ${colorEnd} 100%)`,
              };
              return (
                <div key={index} className={agentStyles["agent-tooltip-item"]}>
                  <span
                    className={agentStyles["agent-tooltip-icon"]}
                    style={gradientStyle}
                  >
                    {renderAgentIcon(normalizedAgent, 10)}
                  </span>
                  <span className={agentStyles["agent-tooltip-name"]}>
                    {normalizedAgent.name || normalizedAgent.id}
                  </span>
                </div>
              );
            })}
          </div>
        );

        return (
          <TooltipComponent label={tooltipContent} position="top">
            <span
              className={`${agentStyles['badge']} ${agentStyles["multi-agent-badge"]} ${className}`}
              style={{ width: size, height: size }}
            >
              <span
                className={agentStyles['badge-inner']}
                style={{
                  background: "linear-gradient(135deg, var(--background-elevated) 0%, var(--background-surface) 100%)",
                  border: "1px solid var(--calculated-border-color)",
                }}
              >
                <span className={agentStyles["multi-agent-count"]}>{agents.length}</span>
              </span>
            </span>
          </TooltipComponent>
        );
      }

      const normalizedAgent: ClientAgent =
        typeof agent === "string"
          ? { id: agent, name: agent }
          : agent || AGENTLESS_AGENT;
      const agentId = normalizedAgent.id || "";

      if (animation) {
        return (
          <span className={`${agentStyles['coin-wrap']} ${className}`}>
            <CoinStaticRenderer key={agentId} agent={normalizedAgent} size={size} />
          </span>
        );
      }

      const outerStyle = { width: size, height: size };
      const gradientStyle = normalizedAgent.color
        ? {
            background: `linear-gradient(135deg, ${normalizedAgent.color} 0%, color-mix(in srgb, ${normalizedAgent.color} 70%, #fff) 100%)`,
          }
        : undefined;

      return (
        <span
          className={`${agentStyles['badge']} ${className}`}
          data-agent-identifier={agentId}
          style={outerStyle}
        >
          <span
            className={agentStyles['badge-inner']}
            data-agent-identifier={agentId}
            style={gradientStyle}
          >
            {renderAgentIcon(normalizedAgent, iconSize)}
          </span>
        </span>
      );
    }

    // --- 15. Mention ---
    case "mention": {
      const {
        path,
        name,
        mentionType,
        lineStart,
        lineEnd,
        stale,
        knownPaths,
        onFileOpen,
      } = props;
      const baseName = name || path.split("/").pop() || path;

      let displayName = baseName;
      if (lineStart != null) {
        displayName +=
          lineEnd != null && lineEnd !== lineStart
            ? `#L${lineStart}-${lineEnd}`
            : `#L${lineStart}`;
      }

      const resolvedType =
        mentionType || (baseName.includes(".") ? "file" : "directory");
      const isStale = stale ?? (knownPaths ? !knownPaths.has(path) : false);
      const isClickable =
        resolvedType === "file" && !isStale && typeof onFileOpen === "function";

      const className = [
        mentionStyles['mention-badge'],
        isStale && mentionStyles['mention-badge-stale'],
        isClickable && mentionStyles['mention-badge-clickable'],
      ]
        .filter(Boolean)
        .join(" ");

      const handleClick = isClickable
        ? (e: React.SyntheticEvent) => {
            e.stopPropagation();
            onFileOpen(path);
          }
        : undefined;

      let tooltipPath = path;
      if (lineStart != null) {
        tooltipPath +=
          lineEnd != null && lineEnd !== lineStart
            ? `#L${lineStart}-${lineEnd}`
            : `#L${lineStart}`;
      }

      // Premium vector Lucide icons instead of text emojis
      const Icon = resolvedType === "directory" ? Folder : FileText;

      return (
        <span
          className={className}
          data-mention-path={tooltipPath}
          data-mention-type={resolvedType}
          onClick={handleClick}
          role={isClickable ? "button" : undefined}
          tabIndex={isClickable ? 0 : undefined}
        >
          <Icon size={10} className={mentionStyles['mention-icon']} />
          {displayName}
        </span>
      );
    }

    // --- 16. Tool Item ---
    case "tool-item": {
      const { name, count, active, variant = "default", tooltip } = props;
      const isCompact = variant === "compact";
      const displayName = resolveDisplayName(name, variant);
      const { Icon, color } = resolveToolVisuals(name) as { Icon: React.ComponentType<{ size?: number; className?: string }>; color: string };
      const tooltipLabel = tooltip || name;

      const badge = (
        <span
          className={`${toolItemStyles['badge']}${active ? ` ${toolItemStyles['badge-is-active-state']}` : ""}`}
          style={{
            color,
            borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
          }}
        >
          <Icon size={10} />
          {!isCompact && (
            <span className={toolItemStyles['label']}>{displayName}</span>
          )}
          {count != null && count > 1 && (
            <span className={toolItemStyles['count']}>×{count}</span>
          )}
        </span>
      );

      if (isCompact || tooltipLabel !== displayName) {
        return (
          <TooltipComponent label={tooltipLabel} position="top">
            {badge}
          </TooltipComponent>
        );
      }

      return badge;
    }

    // --- 17. Date Time ---
    case "dateTime": {
      const {
        date,
        showIcon = true,
        relative = true,
        highlightNew = false,
        className = "",
      } = props;
      return (
        <SharedBadgeComponent
          type="dateTime"
          date={date}
          showIcon={showIcon}
          relative={relative}
          highlightNew={highlightNew}
          className={className}
        />
      );
    }

    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. Helper Layout Wrappers
// ═══════════════════════════════════════════════════════════════════════

export interface ToolBadgeRowProps {
  tools?: Record<string, number>;
  activeTool?: string | null;
  variant?: "default" | "compact" | "condensed";
}

/**
 * ToolBadgeRow — Renders a row of tool items from a { toolName: count } map.
 */
export function ToolBadgeRow({
  tools,
  activeTool,
  variant,
}: ToolBadgeRowProps) {
  if (!tools || Object.keys(tools).length === 0) return null;

  return (
    <div className={toolItemStyles['badge-layout-row']}>
      {Object.entries(tools)
        .sort(([, agent]: [string, number], [, current]: [string, number]) => current - agent)
        .map(([name, count]: [string, number]) => (
          <BadgeComponent
            key={name}
            type="tool-item"
            name={name}
            count={count}
            active={name === activeTool}
            variant={variant}
          />
        ))}
    </div>
  );
}

export interface ModelToolsRowProps {
  tools?: Record<string, boolean> | null;
  variant?: "default" | "compact" | "condensed";
  className?: string;
}

const TOOL_DEFS = [
  { key: "thinking", name: "Thinking" },
  { key: "functionCalling", name: "Tool Calling" },
  { key: "webSearch", name: "Web Search" },
  { key: "codeExecution", name: "Code Execution" },
  { key: "computerUse", name: "Computer Use" },
  { key: "fileSearch", name: "File Search" },
  { key: "urlContext", name: "URL Context" },
  { key: "imageGeneration", name: "Image Generation" },
];

/**
 * ModelToolsRow — renders a row of capability badges for a model.
 */
export function ModelToolsRow({
  tools,
  variant,
  className,
}: ModelToolsRowProps) {
  if (!tools) return null;

  const activeTools = TOOL_DEFS.filter((tool) => tools[tool.key]);
  if (activeTools.length === 0) return null;

  return (
    <div className={`${toolItemStyles['badge-layout-row']} ${className || ""}`}>
      {activeTools.map((def) => {
        const raw = tools[def.key];
        const count = typeof raw === "number" ? raw : 0;

        return (
          <BadgeComponent
            key={def.key}
            type="tool-item"
            name={def.name}
            count={count}
            variant={variant}
          />
        );
      })}
    </div>
  );
}

// Vector-based Gauge icon
function GaugeIcon({
  size,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
