import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import ProviderLogo from "./ProviderLogosComponent";
import { MODALITY_ICONS } from "./WorkflowNodeConstantsComponent";
import styles from "./WorkflowHeaderStatsComponent.module.css";

export default function WorkflowHeaderStatsComponent({
  nodes = [],
  edgeCount = 0,
}) {
  const workflowStats = useMemo<any>(() => {
    // @ts-ignore
    const modelNodes = nodes.filter((n) => !n.nodeType);
    const models = [
      ...new Map(
        modelNodes.map((n) => [
          // @ts-ignore
          // @ts-ignore
          `${n.provider}:${n.modelName}`,
          // @ts-ignore
          // @ts-ignore
          // @ts-ignore
          { provider: n.provider, name: n.displayName || n.modelName },
        ]),
      ).values(),
    ];
    const modalities = new Set();
    for (const n of nodes) {
      // Only boundary nodes: input assets define workflow inputs, viewers define outputs
      // @ts-ignore
      if (n.nodeType === "input") {
        // @ts-ignore
        for (const t of n.outputTypes || [])
          if (t !== "conversation") modalities.add(t);
      // @ts-ignore
      } else if (n.nodeType === "viewer") {
        // @ts-ignore
        for (const t of n.inputTypes || [])
          if (t !== "conversation") modalities.add(t);
      }
    }
    const conversationCount = modelNodes.length;
    return { models, modalities: [...modalities], conversationCount };
  }, [nodes]);

  return (
    <>
      <span className={styles.headerBadge}>
        {nodes.length} nodes · {edgeCount} edges
      </span>
      {workflowStats.modalities.length > 0 && (
        <span className={styles.headerBadge}>
          {workflowStats.modalities.map((mod: any) => {
            // @ts-ignore
            const info = MODALITY_ICONS[mod];
            if (!info) return null;
            const Icon = info.icon;
            return (
              <Icon
                key={mod}
                size={11}
                style={{ color: info.color }}
                title={info.label}
              />
            );
          })}
        </span>
      )}
      {workflowStats.models.length > 0 && (
        <span className={styles.headerBadge}>
          {workflowStats.models.map((m: any) => (
            <span
              key={`${m.provider}:${m.name}`}
              className={styles.headerModelTag}
              title={m.name}
            >
              <ProviderLogo provider={m.provider} size={11} />
              {m.name}
            </span>
          ))}
        </span>
      )}
      {workflowStats.conversationCount > 0 && (
        <span
          className={styles.headerBadge}
          title="Conversations created per run"
        >
          <MessageSquare size={11} />
          {workflowStats.conversationCount}
        </span>
      )}
    </>
  );
}
