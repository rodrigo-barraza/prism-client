import { Cpu } from "lucide-react";
import ProviderLogo from "./ProviderLogosComponent";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ModelBadgeComponent.module.css";

export interface ModelBadgeProps {
  models?: string[];
  provider?: string;
  providers?: string[];
  className?: string;
  mini?: boolean;
  noHover?: boolean;
}

/**
 * Static registry mapping raw model names to clean display labels.
 * Reflects the backend MODELS configuration definitions for consistency.
 */
const KNOWN_MODELS: Record<string, string> = {
  // OpenAI — Text Generation
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

  // Anthropic — Text Generation
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-5-20251101": "Opus 4.5",
  "claude-opus-4-6": "Opus 4.6",

  // Google — Text Generation
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

/**
 * Derive a clean, human-friendly display name from a raw model name or path.
 * Synchronously checks our static backend config label map before falling back
 * to a regex/string sanitisation algorithm.
 */
export function cleanModelName(raw: string): string {
  if (!raw) return "";

  const name = raw.trim();

  // Helper to extract base name for lookup (e.g. "google/gemini-3.5-flash" -> "gemini-3.5-flash")
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
  if (KNOWN_MODELS[base]) {
    return KNOWN_MODELS[base];
  }
  if (KNOWN_MODELS[name]) {
    return KNOWN_MODELS[name];
  }

  // Fallback to dynamic cleaning for custom/local self-hosted model names
  let cleaned = name;

  // 1. Strip provider prefix if any (e.g. "openai:gpt-4o" -> "gpt-4o")
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    cleaned = parts.slice(1).join(":");
  }

  // 2. Strip folder paths (e.g. "meta-llama/Llama-3-70b" -> "Llama-3-70b")
  cleaned = (cleaned.includes("/") ? cleaned.split("/").pop() : cleaned) || "";
  cleaned = (cleaned.includes("\\") ? cleaned.split("\\").pop() : cleaned) || "";

  // 3. Strip file extensions (e.g. "gemma-2b.gguf" -> "gemma-2b")
  cleaned = cleaned.replace(/\.(gguf|bin|ckpt|pt)$/i, "");

  // 4. Strip quantization suffix (e.g. "@q4_k_m" or "@q4_1" or "@q8_0")
  cleaned = cleaned.replace(/@[\w.]+$/, "");

  // 5. Replace hyphens/underscores with spaces
  cleaned = cleaned.replace(/[-_]/g, " ");

  // 6. Capitalize each word, preserving existing uppercase/numbers
  cleaned = cleaned.replace(/\b([a-z])/g, (_: string, c: string) => c.toUpperCase());

  // 7. Uppercase common size suffixes (e.g. "32b" -> "32B", "0.6b" -> "0.6B")
  cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*b\b/gi, (_: string, n: string) => `${n}B`);

  // 8. Capitalize common acronyms and technical suffixes
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
  cleaned = cleaned.replace(/\b([a-zA-Z]+)\b/g, (word) => {
    return acronyms[word] || word;
  });

  return cleaned.trim();
}

/**
 * ModelBadgeComponent — displays a single model name or a "N models" badge
 * with a tooltip listing all model names.
 */
export default function ModelBadgeComponent({
  models = [],
  provider,
  providers,
  className = "",
  mini = false,
  noHover = false,
}: ModelBadgeProps) {
  if (!models || models.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const iconSize = mini ? 8 : 10;
  const cls = `${styles.badge} ${mini ? styles.mini : ""} ${noHover ? styles.noHover : ""} ${className}`;

  /* Resolve a single provider key from explicit prop or providers array */
  const resolvedProvider =
    provider || (providers?.length === 1 ? providers[0] : null);
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
              <span className={`${styles.modelName} ${styles.modelNameClean}`}>
                {cleanName}
              </span>
              <span className={`${styles.modelName} ${styles.modelNameRaw}`}>
                {rawName}
              </span>
            </>
          ) : (
            <span className={styles.modelName}>{rawName}</span>
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
