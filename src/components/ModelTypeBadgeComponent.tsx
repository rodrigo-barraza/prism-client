import { MessageSquare, Volume2, Cpu } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./ModelTypeBadgeComponent.module.css";

/**
 * Icon + label mapping for each model type.
 * conversation → chat/completions endpoint
 * audio       → TTS endpoint
 * embed       → embedding endpoint
 */
const MODEL_TYPE_META = {
  conversation: { icon: MessageSquare, label: "Conversation" },
  audio:        { icon: Volume2,       label: "Audio" },
  embed:        { icon: Cpu,           label: "Embed" },
};

/**
 * ModelTypeBadgeComponent — renders a colour-coded pill for a model's
 * endpoint-based type (conversation | audio | embed).
 *
 * @param {string}  modelType — "conversation" | "audio" | "embed"
 * @param {string}  [className]
 * @param {boolean} [mini]
 */
export default function ModelTypeBadgeComponent({
  // @ts-ignore
  modelType: any,
  className = "",
  mini = false,
}) {
  // @ts-ignore
  if (!modelType) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  // @ts-ignore
  // @ts-ignore
  const meta = MODEL_TYPE_META[modelType] || {
    icon: MessageSquare,
    // @ts-ignore
    label: modelType,
  };
  const Icon = meta.icon;
  // @ts-ignore
  const cls = `${styles.badge} ${styles[modelType] || ""} ${mini ? styles.mini : ""} ${className}`;

  return (
    <TooltipComponent label={`${meta.label} model`} position="top">
      <span className={cls}>
        <Icon size={mini ? 8 : 10} />
        <span>{meta.label}</span>
      </span>
    </TooltipComponent>
  );
}
