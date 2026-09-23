import React from "react";
import type { MessageCitations } from "../types/types";
import styles from "./CitationsComponent.module.css";

/**
 * The web sources a grounded answer cited (Gemini Google Search grounding,
 * stored on the assistant message as `citations`): a small row of links
 * under the answer. The searches that found them are the row's tooltip.
 */
export default function CitationsComponent({
  citations,
}: {
  citations: MessageCitations | undefined;
}) {
  const sources = citations?.sources?.filter((source) => source?.url) ?? [];
  if (sources.length === 0) return null;
  const queries = citations?.queries?.filter(Boolean) ?? [];
  return (
    <div
      className={styles.citations}
      aria-label="Sources"
      title={queries.length > 0 ? `Searched: ${queries.join(" · ")}` : undefined}
    >
      <span className={styles.label}>Sources</span>
      {sources.map((source, index) => (
        <a
          key={`${source.url}-${index}`}
          className={styles.source}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.index}>{index + 1}</span>
          {source.title || source.url}
        </a>
      ))}
    </div>
  );
}
