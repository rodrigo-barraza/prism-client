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
    return (
      <TooltipComponent label={models[0]} position="top">
        <span className={cls}>
          {providerIcon || <Cpu size={iconSize} />}
          <span className={styles.modelName}>{models[0]}</span>
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
