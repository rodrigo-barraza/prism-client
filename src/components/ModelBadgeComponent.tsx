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
}

/**
 * Derive a clean, human-friendly display name from a raw model name or path.
 */
function cleanModelName(raw: string): string {
  if (!raw) return "";

  // 1. Strip provider prefix if any (e.g. "openai:gpt-4o" -> "gpt-4o")
  let name = raw;
  if (name.includes(":")) {
    const parts = name.split(":");
    name = parts.slice(1).join(":");
  }

  // 2. Strip folder paths (e.g. "meta-llama/Llama-3-70b" -> "Llama-3-70b")
  name = (name.includes("/") ? name.split("/").pop() : name) || "";
  name = (name.includes("\\") ? name.split("\\").pop() : name) || "";

  // 3. Strip file extensions (e.g. "gemma-2b.gguf" -> "gemma-2b")
  name = name.replace(/\.(gguf|bin|ckpt|pt)$/i, "");

  // 4. Strip quantization suffix (e.g. "@q4_k_m" or "@q4_1" or "@q8_0")
  name = name.replace(/@[\w.]+$/, "");

  // 5. Replace hyphens/underscores with spaces
  name = name.replace(/[-_]/g, " ");

  // 6. Capitalize each word, preserving existing uppercase/numbers
  name = name.replace(/\b([a-z])/g, (_: string, c: string) => c.toUpperCase());

  // 7. Uppercase common size suffixes (e.g. "32b" -> "32B", "0.6b" -> "0.6B")
  name = name.replace(/(\d+(?:\.\d+)?)\s*b\b/gi, (_: string, n: string) => `${n}B`);

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
  name = name.replace(/\b([a-zA-Z]+)\b/g, (word) => {
    return acronyms[word] || word;
  });

  return name.trim();
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
}: ModelBadgeProps) {
  if (!models || models.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const iconSize = mini ? 8 : 10;
  const cls = `${styles.badge} ${mini ? styles.mini : ""} ${className}`;

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
