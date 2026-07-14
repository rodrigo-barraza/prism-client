export * from "./FileAndSearchRenderers";
export * from "./TerminalAndGitRenderers";
export * from "./BrowserMediaAndVisualRenderers";
export * from "./VisualAndEmojiRenderers";
export * from "./CoordinatorAndMiscRenderers";

import { RendererProps, ToolResultDisplay } from "../types";
import { RawResultToggle } from "../SharedComponents";
import { getResultDisplay } from "../utils";
import { AutoResizeToolEmbed } from "./BrowserMediaAndVisualRenderers";
import PrismService from "../../../services/PrismService";
import styles from "../ToolResultRenderersComponent.module.css";
import React from "react";

/**
 * Renders a tool result's self-describing `display` metadata: an
 * auto-resizing iframe for embeds, an <img> for images. This is the
 * generic path that lets any tool surface visual output without a
 * dedicated renderer.
 */
export function ToolResultDisplayView({
  display,
  toolName,
}: {
  display: ToolResultDisplay;
  toolName?: string;
}) {
  const displayTitle = display.title || toolName || "Tool result";
  if (display.kind === "embed") {
    return (
      <AutoResizeToolEmbed
        sourceUrl={display.url}
        title={displayTitle}
        fallbackHeight={display.height ?? 360}
      />
    );
  }
  return (
    <div className={styles['visual-tool-image-container']}>
      <img
        src={PrismService.getFileUrl(display.url)}
        alt={displayTitle}
        className={styles['visual-tool-image']}
        loading="lazy"
      />
    </div>
  );
}

export const GenericRenderer: React.FC<RendererProps> = ({ result, hideToggles }) => {
  const display = getResultDisplay(result);
  return (
    <>
      {display && <ToolResultDisplayView display={display} />}
      {!hideToggles && <RawResultToggle result={result} />}
    </>
  );
};

export const FetchUrlRenderer: React.FC<RendererProps> = ({ result }) => {
  // Placeholder for fetch/read_web_page results
  return <GenericRenderer result={result} />;
};

export const ScheduleRenderer: React.FC<RendererProps> = ({ result }) => {
  // Placeholder for schedule results
  return <GenericRenderer result={result} />;
};
