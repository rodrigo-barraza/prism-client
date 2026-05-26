"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Coins,
  Hash,
  Zap,
  Timer,
  MessageSquare,
  LetterText,
  FunctionSquare,
  Cpu,
  Layers,
  FolderKanban,
  User as UserIcon,
  FileText,
  Folder,
  Volume2
} from "lucide-react";
import {
  TooltipComponent,
  BadgeComponent as SharedBadgeComponent
} from "@rodrigo-barraza/components-library";

import { renderAgentIcon } from "./AgentPickerComponent";
import ThreeCanvasComponent from "./ThreeCanvasComponent";
import ProviderLogo, { resolveProviderLabel } from "./ProviderLogosComponent";
import { formatCost, formatElapsedTime, renderToolName } from "../utils/utilities";
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
import modelStyles from "./ModelBadgeComponent.module.css";
import providersStyles from "./ProvidersBadgeComponent.module.css";
import modelTypeStyles from "./ModelTypeBadgeComponent.module.css";
import projectStyles from "./ProjectBadgeComponent.module.css";
import userStyles from "./UserBadgeComponent.module.css";
import agentStyles from "./AgentBadgeComponent.module.css";
import mentionStyles from "./MentionBadgeComponent.module.css";

export { mentionStyles as mentionBadgeStyles };

// ═══════════════════════════════════════════════════════════════════════
// 1. Types & Discriminated Union for Unified BadgeComponent
// ═══════════════════════════════════════════════════════════════════════

export type BadgeProps =
  | {
      type?: undefined;
      variant?: "default" | "success" | "warning" | "error" | "info" | "accent" | "endpoint" | "provider" | string;
      mini?: boolean;
      className?: string;
      children?: React.ReactNode;
      [key: string]: any;
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
      liveTokPerSec: number | null;
      avgTokPerSec?: number | null;
      isActivelyGenerating?: boolean;
      turnActive?: boolean;
    }
  | {
      type: "stopwatch";
      seconds?: number;
      startTime?: string | number | null;
      live?: boolean;
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
      agent?: any;
      agents?: any[];
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

const KNOWN_MODELS: Record<string, string> = {
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
  "eleven_turbo_v2": "Eleven Turbo v2",
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

export function cleanModelName(raw: string): string {
  if (!raw) return "";
  const name = raw.trim();

  const getBaseName = (str: string) => {
    let s = str;
    if (s.includes(":")) {
      s = s.split(":").slice(1).join(":");
    }
    s = (s.includes("/") ? s.split("/").pop() : s) || "";
    s = (s.includes("\\") ? s.split("\\").pop() : s) || "";
    return s.trim();
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
  cleaned = (cleaned.includes("\\") ? cleaned.split("\\").pop() : cleaned) || "";
  cleaned = cleaned.replace(/\.(gguf|bin|ckpt|pt)$/i, "");
  cleaned = cleaned.replace(/@[\w.]+$/, "");
  cleaned = cleaned.replace(/[-_]/g, " ");
  cleaned = cleaned.replace(/\b([a-z])/g, (_: string, c: string) => c.toUpperCase());
  cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*b\b/gi, (_: string, n: string) => `${n}B`);

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
  cleaned = cleaned.replace(/\b([a-zA-Z]+)\b/g, (word) => acronyms[word] || word);

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
  LUPOS: ["#ef4444", "#f97316"],
  STICKERS: ["#10b981", "#34d399"],
  DIGEST: ["#f59e0b", "#ef4444"],
  LIGHTS: ["#eab308", "#f59e0b"],
  OOG: ["#78716c", "#a8a29e"],
  IMAGE: ["#ec4899", "#8b5cf6"],
};
const FALLBACK_GRADIENT = ["#8b5cf6", "#06b6d4"];

function resolveGradient(agent: any): string[] {
  if (agent?.color) return [agent.color, agent.color];
  return (AGENT_GRADIENTS as Record<string, string[]>)[agent?.id] || FALLBACK_GRADIENT;
}

const TEX_SIZE = 256;

function CoinStatic({ agent, size }: any) {
  const meshRef = useRef<any>(null);
  const texRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iconRef = useRef<HTMLCanvasElement | null>(null);
  const gradient = useMemo(() => resolveGradient(agent), [agent]);

  const handleSetup = useCallback(
    ({ scene, camera, THREE }: any) => {
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);

      const texCanvas = document.createElement("canvas");
      texCanvas.width = TEX_SIZE;
      texCanvas.height = TEX_SIZE;
      const context = texCanvas.getContext("2d");
      if (context) {
        const r = TEX_SIZE * 0.16;
        context.beginPath();
        context.roundRect(0, 0, TEX_SIZE, TEX_SIZE, r);
        context.closePath();
        const gradient = context.createLinearGradient(0, 0, TEX_SIZE, TEX_SIZE);
        g.addColorStop(0, gradient[0]);
        g.addColorStop(1, gradient[1]);
        context.fillStyle = g;
        context.fill();
      }
      canvasRef.current = texCanvas;

      const tex = new THREE.CanvasTexture(texCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      texRef.current = tex;

      const geo = new THREE.PlaneGeometry(1.2, 1.2);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      meshRef.current = mesh;
      scene.add(mesh);
    },
    [gradient],
  );

  useEffect(() => {
    if (!iconRef.current) return;

    const raf = requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      const iconSz = TEX_SIZE * 0.55;
      const off = (TEX_SIZE - iconSz) / 2;
      const context = (canvasRef.current as HTMLCanvasElement).getContext("2d");
      if (!context) return;

      const imageElement = (iconRef.current as HTMLElement).querySelector("img");
      if (imageElement) {
        const drawImg = () => {
          context.drawImage(imageElement, off, off, iconSz, iconSz);
          if (texRef.current) (texRef.current as {needsUpdate: boolean}).needsUpdate = true;
        };
        if (imageElement.complete && imageElement.naturalWidth > 0) {
          drawImg();
        } else {
          imageElement.onload = drawImg;
        }
        return;
      }

      const svg = (iconRef.current as HTMLElement).querySelector("svg");
      if (!svg) return;

      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const markup = svg.outerHTML.replace(/currentColor/g, "#ffffff");

      const image = new Image();
      const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(url);
        if (!canvasRef.current) return;
        context.drawImage(image, off, off, iconSz, iconSz);
        if (texRef.current) (texRef.current as {needsUpdate: boolean}).needsUpdate = true;
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
      };
      image.src = url;
    });

    return () => cancelAnimationFrame(raf);
  }, [agent]);

  const handleTick = useCallback(({ elapsed }: any) => {
    if (!meshRef.current) return;
    (meshRef.current as {rotation: {x: number; y: number; z: number}}).rotation.y = elapsed * 1.2;
  }, []);

  return (
    <>
      <span ref={iconRef} className={agentStyles.hiddenIcon}>
        {renderAgentIcon(agent, Math.round(TEX_SIZE * 0.5))}
      </span>
      <ThreeCanvasComponent
        onSetup={handleSetup}
        onTick={handleTick}
        cameraFov={5}
        cameraPosition={[0, 0, 20]}
        alpha
        antialias
        toneMapping="None"
        className={agentStyles.coinCanvas}
        style={{ width: size, height: size }}
      />
    </>
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
      const { cost = 0, showIcon = true, className = "", mini = false, formatFn = formatCost } = props;
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
      const { value, label = "tokens", showIcon = true, className = "", mini = false } = props;
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
      const { liveTokPerSec, avgTokPerSec, isActivelyGenerating, turnActive } = props;
      if (liveTokPerSec !== null && liveTokPerSec !== undefined) {
        const variant = isActivelyGenerating || turnActive ? throughputStyles.live : throughputStyles.stale;
        return (
          <span className={`${throughputStyles.badge} ${variant}`}>
            <GaugeIcon size={10} className={throughputStyles.icon} />
            {liveTokPerSec.toFixed(1)} tok/s
          </span>
        );
      }
      if (avgTokPerSec != null) {
        return (
          <span className={`${throughputStyles.badge} ${throughputStyles.average}`}>
            <GaugeIcon size={10} className={throughputStyles.icon} />
            {avgTokPerSec.toFixed(1)} tok/s
          </span>
        );
      }
      return null;
    }

    // --- 5. Stopwatch ---
    case "stopwatch": {
      const { seconds, startTime, live: externalLive, className = "" } = props;
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
        const start = typeof startTime === "number" ? startTime : new Date(startTime).getTime();
        displaySeconds = Math.max(0, (nowMs - start) / 1000);
      } else {
        displaySeconds = seconds || 0;
      }

      if (displaySeconds <= 0 && !isLive) return null;

      const showPulse = isLive || externalLive;
      const tooltipLabel = `Elapsed: ${formatElapsedTime(displaySeconds)}`;

      return (
        <TooltipComponent label={tooltipLabel} position="top">
          <span className={`${stopwatchStyles.badge} ${showPulse ? stopwatchStyles.live : ""} ${className}`}>
            <Timer size={11} />
            {formatElapsedTime(displaySeconds)}
          </span>
        </TooltipComponent>
      );
    }

    // --- 6. Messages ---
    case "messages": {
      const { count, deletedCount = 0, showIcon = true, className = "", mini = false } = props;
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
          <span className={`${wordStyles.badge} ${mini ? wordStyles.mini : ""} ${className}`}>
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
            style={color ? ({ "--tool-badge-accent": color } as React.CSSProperties) : undefined}
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
      const { models = [], provider, providers, className = "", mini = false, noHover = false } = props;
      if (!models || models.length === 0) {
        return <span style={{ color: "var(--text-muted)" }}>—</span>;
      }

      const iconSize = mini ? 8 : 10;
      const cls = `${modelStyles.badge} ${mini ? modelStyles.mini : ""} ${noHover ? modelStyles.noHover : ""} ${className}`;
      const resolvedProvider = provider || (providers?.length === 1 ? providers[0] : null);
      const providerIcon = resolvedProvider ? (
        <ProviderLogo provider={resolvedProvider} size={iconSize} />
      ) : null;

      if (models.length === 1) {
        const rawName = models[0];
        const cleanName = cleanModelName(rawName);
        const hasCleanName = cleanName && cleanName.toLowerCase() !== rawName.toLowerCase();

        return (
          <TooltipComponent label={rawName} position="top">
            <span className={cls}>
              {providerIcon || <Cpu size={iconSize} />}
              {hasCleanName ? (
                <>
                  <span className={`${modelStyles.modelName} ${modelStyles.modelNameClean}`}>
                    {cleanName}
                  </span>
                  <span className={`${modelStyles.modelName} ${modelStyles.modelNameRaw}`}>
                    {rawName}
                  </span>
                </>
              ) : (
                <span className={modelStyles.modelName}>{rawName}</span>
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
      const cls = `${providersStyles.badge} ${mini ? providersStyles.mini : ""} ${className}`;
      const displayLabel = (key: string) => resolveProviderLabel(key);

      if (providers.length === 1) {
        return (
          <TooltipComponent label={displayLabel(providers[0])} position="top">
            <span className={cls}>
              <ProviderLogo provider={providers[0]} size={iconSize} />
              <span className={providersStyles.providerName}>{displayLabel(providers[0])}</span>
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

      const meta: any = (MODEL_TYPE_META as any)[modelType] || {
        icon: MessageSquare,
        label: modelType,
      };
      const Icon = meta.icon;
      const cls = `${modelTypeStyles.badge} ${modelTypeStyles[modelType] || ""} ${mini ? modelTypeStyles.mini : ""} ${className}`;

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
          <span className={`${projectStyles.badge} ${className}`}>
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
          <span className={`${userStyles.badge} ${className}`}>
            <UserIcon size={10} />
            {username}
          </span>
        </TooltipComponent>
      );
    }

    // --- 14. Agent ---
    case "agent": {
      const { agent, agents, size = 22, iconSize = 13, animation = false, className = "" } = props;

      if (Array.isArray(agents) && agents.length > 0) {
        return (
          <div className={agentStyles.agentsList || ""} style={{ display: "flex", gap: "4px" }}>
            {agents.map((singleAgent: any, index: number) => {
              const normalizedAgent = typeof singleAgent === "string" ? { id: singleAgent } : singleAgent;
              return (
                <BadgeComponent
                  key={index}
                  type="agent"
                  agent={normalizedAgent}
                  size={size}
                  iconSize={iconSize}
                  animation={animation}
                  className={className}
                />
              );
            })}
          </div>
        );
      }

      const agentId = agent?.id || "";

      if (animation) {
        return (
          <span className={`${agentStyles.coinWrap} ${className}`}>
            <CoinStatic key={agentId} agent={agent} size={size} />
          </span>
        );
      }

      const outerStyle = { width: size, height: size };
      const gradientStyle = agent?.color
        ? {
            background: `linear-gradient(135deg, ${agent.color} 0%, color-mix(in srgb, ${agent.color} 70%, #fff) 100%)`,
          }
        : undefined;

      return (
        <span className={`${agentStyles.badge} ${className}`} data-agent-identifier={agentId} style={outerStyle}>
          <span className={agentStyles.badgeInner} data-agent-identifier={agentId} style={gradientStyle}>
            {renderAgentIcon(agent, iconSize)}
          </span>
        </span>
      );
    }

    // --- 15. Mention ---
    case "mention": {
      const { path, name, mentionType, lineStart, lineEnd, stale, knownPaths, onFileOpen } = props;
      const baseName = name || path.split("/").pop() || path;

      let displayName = baseName;
      if (lineStart != null) {
        displayName += lineEnd != null && lineEnd !== lineStart ? `#L${lineStart}-${lineEnd}` : `#L${lineStart}`;
      }

      const resolvedType = mentionType || (baseName.includes(".") ? "file" : "directory");
      const isStale = stale ?? (knownPaths ? !knownPaths.has(path) : false);
      const isClickable = resolvedType === "file" && !isStale && typeof onFileOpen === "function";

      const className = [
        mentionStyles.mentionBadge,
        isStale && mentionStyles.mentionBadgeStale,
        isClickable && mentionStyles.mentionBadgeClickable,
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
        tooltipPath += lineEnd != null && lineEnd !== lineStart ? `#L${lineStart}-${lineEnd}` : `#L${lineStart}`;
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
          <Icon size={10} className={mentionStyles.mentionIcon} />
          {displayName}
        </span>
      );
    }

    // --- 16. Tool Item ---
    case "tool-item": {
      const { name, count, active, variant = "default", tooltip } = props;
      const isCompact = variant === "compact";
      const displayName = resolveDisplayName(name, variant);
      const { Icon, color } = resolveToolVisuals(name) as any;
      const tooltipLabel = tooltip || name;

      const badge = (
        <span
          className={`${toolStyles.badge}${active ? ` ${toolStyles.badgeActive}` : ""}`}
          style={{
            color,
            borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
          }}
        >
          <Icon size={10} />
          {!isCompact && <span className={toolStyles.label}>{displayName}</span>}
          {count != null && count > 1 && <span className={toolStyles.count}>×{count}</span>}
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
      const { date, showIcon = true, relative = true, highlightNew = false, className = "" } = props;
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
export function ToolBadgeRow({ tools, activeTool, variant }: ToolBadgeRowProps) {
  if (!tools || Object.keys(tools).length === 0) return null;

  return (
    <div className={toolStyles.badgeRow}>
      {Object.entries(tools)
        .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
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
  tools?: Record<string, any> | null;
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
export function ModelToolsRow({ tools, variant, className }: ModelToolsRowProps) {
  if (!tools) return null;

  const activeTools = TOOL_DEFS.filter((t) => tools[t.key]);
  if (activeTools.length === 0) return null;

  return (
    <div className={`${toolStyles.badgeRow} ${className || ""}`}>
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
function GaugeIcon({ size, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
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
