import React, { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Music, Volume2, RotateCcw, Trash2, ArrowRight } from "lucide-react";
import { RendererProps } from "../types";
import { tryParse } from "../utils";
import { PathPill, StatusBadge, RawResultToggle } from "../SharedComponents";
import PrismService from "../../../services/PrismService";
import AudioPlayerRecorderComponent from "../../AudioPlayerRecorderComponent";
import styles from "../ToolResultRenderersComponent.module.css";

// -- Browser Action ------------------------------------------------------

const BROWSER_ACTION_LABELS: Record<string, string> = {
  navigate: "Navigate",
  screenshot: "Screenshot",
  click: "Click",
  type: "Type",
  scroll: "Scroll",
  evaluate: "Evaluate JS",
  get_content: "Get Content",
  get_elements: "Get Elements",
  wait: "Wait",
  close: "Close",
};

export function BrowserActionRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const action = parsed.action || args?.action || "";
  const actionLabel = BROWSER_ACTION_LABELS[action] || action;
  const hasError = !!parsed.error;

  // Resolve screenshot ref (minio:// or base64 fallback)
  let screenshotSourceUrl = null;
  if (parsed.screenshotRef) {
    screenshotSourceUrl = PrismService.getFileUrl(parsed.screenshotRef);
  } else if (parsed.screenshot) {
    screenshotSourceUrl = `data:${parsed.mimeType || "image/png"};base64,${parsed.screenshot}`;
  }

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Monitor size={13} />
        <span className={styles['renderer-title']}>{actionLabel}</span>
        {parsed.url && (
          <a
            href={parsed.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles['search-link']}
          >
            {parsed.title || parsed.url}
          </a>
        )}

        {hasError && <StatusBadge success={false} label="Error" />}
      </div>

      {hasError && <div className={styles['error-text']}>{parsed.error}</div>}

      {screenshotSourceUrl && (
        <div className={styles['browser-screenshot']}>
          { }
          <img
            src={screenshotSourceUrl}
            alt={`Screenshot of ${parsed.url || "page"}`}
            className={styles['browser-screenshot-img']}
          />
        </div>
      )}

      {parsed.content && (
        <pre className={styles['code-block']}>
          <code>
            {parsed.content.length > 3000
              ? parsed.content.slice(0, 3000) + "\n\u2026"
              : parsed.content}
          </code>
        </pre>
      )}

      {parsed.result !== undefined && action === "evaluate" && (
        <pre className={styles['code-block']}>
          <code>{String(parsed.result)}</code>
        </pre>
      )}

      {action === "get_elements" && parsed.elements && (
        <div className={styles['directory-list']}>
          {parsed.elements
            .slice(0, 30)
            .map((element, index) => (
              <div key={index} className={styles['directory-entry']}>
                <code className={styles['inline-code']}>{element.selector}</code>
                {element.text && <span>{element.text}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// -- Audio Generator -----------------------------------------------------

export function AudioGeneratorRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);

  const audioSourceUrl = React.useMemo(() => {
    if (!parsed) return null;
    if (parsed.audioRef) {
      return PrismService.getFileUrl(parsed.audioRef);
    }
    if (!parsed.audio?.data) return null;
    const mimeType = parsed.audio.mimeType || "audio/wav";
    return `data:${mimeType};base64,${parsed.audio.data}`;
  }, [parsed]);

  if (!parsed) return <RawResultToggle result={result} />;

  const totalAudioDuration = parsed.duration || 0;
  const audioSampleCount = parsed.sampleCount || 0;
  const hasAudioError = !!parsed.error;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Music size={13} />
        <span className={styles['renderer-title']}>
          {args?.presetEffect
            ? `Sound Preset: '${args.presetEffect}'`
            : `Synth (${args?.waveform || "sine"} · ${totalAudioDuration.toFixed(2)}s · ${audioSampleCount.toLocaleString()} samples)`}
        </span>
        <StatusBadge
          success={!hasAudioError}
          label={hasAudioError ? "Error" : `${totalAudioDuration.toFixed(2)}s`}
        />
      </div>
      {hasAudioError && <div className={styles['error-text']}>{parsed.error}</div>}
      {audioSourceUrl && <AudioPlayerRecorderComponent sourceUrl={audioSourceUrl} />}
    </div>
  );
}

// -- Text-to-Speech -----------------------------------------------------

export function TextToSpeechRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);

  const audioSourceUrl = React.useMemo(() => {
    if (!parsed) return null;
    if (parsed.audioRef) {
      return PrismService.getFileUrl(parsed.audioRef);
    }
    if (!parsed.audio?.data) return null;
    const mimeType = parsed.audio.mimeType || "audio/wav";
    return `data:${mimeType};base64,${parsed.audio.data}`;
  }, [parsed]);

  if (!parsed) return <RawResultToggle result={result} />;

  const hasTtsError = !!parsed.error;
  const ttsVoiceLabel = parsed.voice ? String(parsed.voice) : null;
  const ttsDurationEstimate =
    typeof parsed.durationEstimate === "number" ? parsed.durationEstimate : null;
  const ttsInputText =
    typeof args?.text === "string" ? args.text : null;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Volume2 size={13} />
        <span className={styles['renderer-title']}>
          {ttsVoiceLabel ? `Voice: ${ttsVoiceLabel}` : "Text-to-Speech"}
        </span>
        {ttsDurationEstimate != null && (
          <StatusBadge
            success={!hasTtsError}
            label={hasTtsError ? "Error" : `~${ttsDurationEstimate.toFixed(1)}s`}
          />
        )}
        {!hasTtsError && !ttsDurationEstimate && (
          <StatusBadge success={true} label="Generated" />
        )}
      </div>
      {ttsInputText && (
        <div className={styles['input-arg-layout-row']}>
          <span className={styles['input-arg-key']}>text</span>
          <span className={styles['input-arg-value']}>
            {ttsInputText.length > 120 ? ttsInputText.slice(0, 120) + "…" : ttsInputText}
          </span>
        </div>
      )}
      {hasTtsError && <div className={styles['error-text']}>{parsed.error}</div>}
      {audioSourceUrl && <AudioPlayerRecorderComponent sourceUrl={audioSourceUrl} />}
    </div>
  );
}

// -- File Delete -------------------------------------------------------

export function FileDeleteRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;
  const filePathToDelete = parsed.path || args?.path || "";
  const isDeletionSuccessful = !parsed.error;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Trash2 size={13} />
        <PathPill path={filePathToDelete} />
        <StatusBadge success={isDeletionSuccessful} label={isDeletionSuccessful ? "Deleted" : "Failed"} />
      </div>
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
    </div>
  );
}
export function TurtleDrawRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasDrawError = !!parsed.error;
  const drawCommandCount = parsed.commandCount || args?.commands?.length || 0;
  const drawCanvasSize = parsed.canvasSize || "800x600";
  const drawEmbedUrl = parsed.turtleEmbedUrl || parsed.embedUrl || "";
  const drawExecutionTimeMs = parsed.executionTimeMs;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🐢</span>
        <span className={styles['renderer-title']}>
          Turtle Drawing — {drawCommandCount} command{drawCommandCount !== 1 ? "s" : ""}
          {drawExecutionTimeMs ? ` · ${drawExecutionTimeMs}ms` : ""}
        </span>
        <StatusBadge
          success={!hasDrawError}
          label={hasDrawError ? "Error" : drawCanvasSize}
        />
      </div>
      {hasDrawError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasDrawError && drawEmbedUrl && (
        <TurtleDrawEmbed sourceUrl={drawEmbedUrl} title="Turtle Drawing" />
      )}
    </div>
  );
}

// -- File Move ---------------------------------------------------------

export function FileMoveRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;
  const sourcePath = parsed.source || args?.source || "";
  const destinationPath = parsed.destination || args?.destination || "";
  const isMoveSuccessful = !parsed.error;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <ArrowRight size={13} />
        <PathPill path={sourcePath} />
        <ArrowRight size={10} className={styles['move-arrow']} />
        <PathPill path={destinationPath} />
        <StatusBadge success={isMoveSuccessful} label={isMoveSuccessful ? "Moved" : "Failed"} />
      </div>
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
    </div>
  );
}

// -- Turtle Graphics Embed --------------------------------------------

export function TurtleDrawEmbed({ sourceUrl, title }: { sourceUrl: string; title: string }) {
  const iframeElementRef = useRef<HTMLIFrameElement>(null);

  const handleAnimationReplay = useCallback(() => {
    iframeElementRef.current?.contentWindow?.postMessage({ type: "turtle-replay" }, "*");
  }, []);

  return (
    <div className={styles['turtle-embed-wrapper']}>
      <iframe
        ref={iframeElementRef}
        src={sourceUrl}
        className={styles['turtle-embed-frame']}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <button
        type="button"
        className={styles['turtle-replay-button']}
        onClick={handleAnimationReplay}
        title="Replay animation"
        aria-label="Replay turtle drawing animation"
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

// -- Auto Resize Tool Embed -------------------------------------------

export function AutoResizeToolEmbed({
  sourceUrl,
  title,
  fallbackHeight = 360,
  className,
  wrapperClassName,
}: {
  sourceUrl: string;
  title: string;
  fallbackHeight?: number;
  className?: string;
  wrapperClassName?: string;
}) {
  const iframeElementRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeDynamicHeight, setIframeDynamicHeight] = useState(fallbackHeight);

  const handleEmbedResizeMessage = useCallback((event: MessageEvent) => {
    if (
      event.data?.type === "embed-resize" &&
      iframeElementRef.current &&
      event.source === iframeElementRef.current.contentWindow
    ) {
      setIframeDynamicHeight(event.data.height);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleEmbedResizeMessage);
    return () => window.removeEventListener("message", handleEmbedResizeMessage);
  }, [handleEmbedResizeMessage]);

  return (
    <div className={wrapperClassName || styles['visual-tool-embed-wrapper']}>
      <iframe
        ref={iframeElementRef}
        src={sourceUrl}
        className={className || styles['visual-tool-embed-frame']}
        title={title}
        style={{ height: `${iframeDynamicHeight}px` }}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
