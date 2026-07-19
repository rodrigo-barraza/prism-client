export * from "./FileAndSearchRenderers";
export * from "./TerminalAndGitRenderers";
export * from "./BrowserMediaAndVisualRenderers";
export * from "./VisualAndEmojiRenderers";
export * from "./CoordinatorAndMiscRenderers";

import { RendererProps, ToolResultDisplay } from "../types";
import { RawResultToggle } from "../SharedComponents";
import { getResultDisplay, getCodeDisplayText } from "../utils";
import { AutoResizeToolEmbed } from "./BrowserMediaAndVisualRenderers";
import PrismService from "../../../services/PrismService";
import { MarkdownContentComponent as MarkdownContent } from "@rodrigo-barraza/components-library";
import type { ArtifactItem } from "../../../types/types";
import styles from "../ToolResultRenderersComponent.module.css";
import React from "react";

/**
 * Renders a tool result's self-describing `display` metadata: an
 * auto-resizing iframe for embeds, an <img> for images, native players
 * for video/audio. This is the generic path that lets any tool surface
 * visual output without a dedicated renderer.
 */
/**
 * Whitespace-exact code/text block for `kind: "code"` displays, with a
 * copy button so the user always has a byte-perfect copy of the tool
 * output regardless of how the model transcribed it in its reply.
 */
function CodeDisplayBlock({
  text,
  title,
  language,
}: {
  text: string;
  title: string;
  language?: string;
}) {
  const [isCopied, setIsCopied] = React.useState(false);
  const handleCopy = React.useCallback(() => {
    navigator.clipboard?.writeText(text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    });
  }, [text]);
  return (
    <div className={styles['code-display-container']}>
      <div className={styles['code-display-header']}>
        <span className={styles['code-display-title']}>{title}</span>
        <button
          type="button"
          className={styles['code-display-copy']}
          onClick={handleCopy}
          aria-label="Copy to clipboard"
        >
          {isCopied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={
          language === "diff" ? styles['diff-block'] : styles['code-block']
        }
      >
        <code>{text}</code>
      </pre>
    </div>
  );
}

/**
 * Inline view of a document artifact (create_artifact / update_artifact
 * results). Fetches the artifact by id and renders markdown natively or
 * html in a sandboxed iframe, with a link out to the /artifacts gallery.
 */
function ArtifactDisplayBlock({
  artifactId,
  title,
}: {
  artifactId: string;
  title?: string;
}) {
  const [artifact, setArtifact] = React.useState<ArtifactItem | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);

  // No reset-on-change needed: the caller keys this block by artifactId,
  // so a different artifact remounts with fresh state.
  React.useEffect(() => {
    let cancelled = false;
    PrismService.getArtifact(artifactId)
      .then((fetched) => {
        if (!cancelled) setArtifact(fetched);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  const headerTitle = artifact?.title || title || "Artifact";

  return (
    <div className={styles['artifact-display-container']}>
      <div className={styles['artifact-display-header']}>
        <span className={styles['artifact-display-title']}>{headerTitle}</span>
        <span className={styles['artifact-display-meta']}>
          {artifact && artifact.version > 1 && <span>v{artifact.version}</span>}
          <a
            href={`/artifacts/${encodeURIComponent(artifactId)}`}
            target="_blank"
            rel="noreferrer"
            className={styles['artifact-display-link']}
          >
            Open in Artifacts
          </a>
        </span>
      </div>
      {loadFailed && (
        <div className={styles['artifact-display-error']}>
          Artifact unavailable — it may have been deleted.
        </div>
      )}
      {artifact && artifact.kind === "html" && (
        <iframe
          srcDoc={artifact.content || ""}
          sandbox="allow-scripts"
          title={headerTitle}
          className={styles['artifact-display-frame']}
          style={{ height: artifact.height ?? 480 }}
        />
      )}
      {artifact && artifact.kind !== "html" && (
        <div className={styles['artifact-display-body']}>
          <MarkdownContent content={artifact.content || ""} />
        </div>
      )}
    </div>
  );
}

export function ToolResultDisplayView({
  display,
  toolName,
  result,
}: {
  display: ToolResultDisplay;
  toolName?: string;
  result?: unknown;
}) {
  const displayTitle = display.title || toolName || "Tool result";
  if (display.kind === "artifact") {
    return (
      <ArtifactDisplayBlock
        key={display.artifactId}
        artifactId={display.artifactId}
        title={display.title}
      />
    );
  }
  if (display.kind === "code") {
    const text = getCodeDisplayText(result, display);
    if (!text) return null;
    return (
      <CodeDisplayBlock
        text={text}
        title={displayTitle}
        language={display.language}
      />
    );
  }
  if (display.kind === "embed") {
    return (
      <AutoResizeToolEmbed
        sourceUrl={display.url}
        title={displayTitle}
        fallbackHeight={display.height ?? 360}
      />
    );
  }
  if (display.kind === "video") {
    return (
      <div className={styles['visual-tool-image-container']}>
        <video
          src={PrismService.getFileUrl(display.url)}
          poster={display.poster ? PrismService.getFileUrl(display.poster) : undefined}
          controls
          preload="metadata"
          className={styles['visual-tool-video']}
        />
      </div>
    );
  }
  if (display.kind === "audio") {
    return (
      <div className={styles['visual-tool-image-container']}>
        <audio
          src={PrismService.getFileUrl(display.url)}
          controls
          preload="metadata"
          className={styles['visual-tool-audio']}
        />
      </div>
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
      {display && <ToolResultDisplayView display={display} result={result} />}
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
