import React from "react";
import { Download } from "lucide-react";
import { RendererProps } from "../types";
import { tryParse } from "../utils";
import { StatusBadge, RawResultToggle } from "../SharedComponents";
import { TurtleDrawEmbed } from "./BrowserMediaAndVisualRenderers";
import styles from "../ToolResultRenderersComponent.module.css";

// NOTE: the per-tool media renderers that used to live here (3D scene/
// mesh/voxel, QR, LaTeX, diagram, video→GIF, map, chart) were removed —
// those results carry self-describing `display` metadata and render via
// GenericRenderer/ToolResultDisplayView. Only renderers with behavior the
// generic display path can't provide remain.

// -- Image Manipulation Rendering ---------------------------------------

export function ImageManipulationRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasImageError = !!parsed.error;
  const manipulatedImageUrl = parsed.imageUrl || "";
  const hasImageMetadataOnly = !manipulatedImageUrl && parsed.metadata && parsed.success;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🖼️</span>
        <span className={styles['renderer-title']}>
          {hasImageMetadataOnly ? "Image Metadata" : "Image Processing"}
        </span>
        <StatusBadge
          success={!hasImageError}
          label={hasImageError ? "Error" : hasImageMetadataOnly ? "Inspected" : "Processed"}
        />
      </div>
      {hasImageError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasImageError && manipulatedImageUrl && (
        <div className={styles['visual-tool-image-container']}>
          { }
          <img
            src={manipulatedImageUrl}
            alt="Processed image"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
        </div>
      )}
      {hasImageMetadataOnly && parsed.metadata && (
        <div className={styles['visual-tool-metadata']}>
          {Object.entries(parsed.metadata).map(([key, value]) => (
            <span key={key} className={styles['meta-item']}>
              <strong>{key}:</strong> {String(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function AsciiImageRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasAsciiError = !!parsed.error;
  const asciiWidth = parsed.width || (args?.width ? Number(args.width) : 100);
  const asciiHeight = parsed.height || 0;
  const asciiEmbedUrl = parsed.asciiEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🎨</span>
        <span className={styles['renderer-title']}>
          ASCII Art — {String(asciiWidth)}×{String(asciiHeight)}
        </span>
        <StatusBadge
          success={!hasAsciiError}
          label={hasAsciiError ? "Error" : "Rendered"}
        />
      </div>
      {hasAsciiError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasAsciiError && parsed.ascii ? (
        <div className={styles['ascii-art-container']}>
          <pre className={styles['ascii-art-pre']}>
            <code>{parsed.ascii}</code>
          </pre>
        </div>
      ) : (
        !hasAsciiError &&
        asciiEmbedUrl && <TurtleDrawEmbed sourceUrl={asciiEmbedUrl} title="ASCII Art" />
      )}
    </div>
  );
}

export function EmojiCombinationRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed || !parsed.success) return <RawResultToggle result={result} />;

  const {
    leftEmoji,
    leftEmojiCodepoint,
    rightEmoji,
    rightEmojiCodepoint,
    gStaticUrl,
    alt,
    date,
    isLatest,
    gBoardOrder,
  } = parsed;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🍳</span>
        <span className={styles['renderer-title']}>Emoji Mashup</span>
        {isLatest && (
          <StatusBadge success={true} label="Latest GBoard Design" />
        )}
      </div>
      <div className={styles['emoji-combine-container']}>
        <div className={styles['emoji-left-right-grid']}>
          <div
            className={styles['emoji-bubble']}
            title={`Codepoint: ${leftEmojiCodepoint}`}
          >
            <span className={styles['bubble-emoji-char']}>{leftEmoji}</span>
          </div>
          <span className={styles['combine-plus']}>+</span>
          <div
            className={styles['emoji-bubble']}
            title={`Codepoint: ${rightEmojiCodepoint}`}
          >
            <span className={styles['bubble-emoji-char']}>{rightEmoji}</span>
          </div>
          <span className={styles['combine-equals']}>=</span>
        </div>
        <div className={styles['emoji-merged-container']}>
          <div className={styles['merged-backdrop-glow']} />
          { }
          <img
            src={gStaticUrl}
            alt={alt || "Emoji Kitchen mashup"}
            className={styles['merged-emoji-image']}
            title={alt}
          />
        </div>
      </div>
      <div className={styles['emoji-meta-layout-row']}>
        <span className={styles['meta-item']}>Order: {gBoardOrder || "N/A"}</span>
        <span className={styles['meta-separator']}>·</span>
        <span className={styles['meta-item']}>Date: {date || "N/A"}</span>
        <span className={styles['meta-separator']}>·</span>
        <a
          href={gStaticUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={`mashup_${leftEmojiCodepoint}_${rightEmojiCodepoint}.png`}
          className={styles['download-link']}
          style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
        >
          <Download size={11} />
          Download PNG
        </a>
      </div>
    </div>
  );
}

export function EmojiCombinationsRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed || !parsed.success) return <RawResultToggle result={result} />;

  const emojiBase = parsed.emoji || (args?.emoji as string) || "";
  const emojiCombinationCount = parsed.count || 0;
  const emojiCombinations = parsed.combinations || [];

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🍳</span>
        <span className={styles['renderer-title']}>
          Emoji Kitchen — {emojiBase} ({emojiCombinationCount} combinations)
        </span>
        <StatusBadge success={true} label="Ready" />
      </div>
      <div className={styles['emoji-combinations-grid']}>
        {emojiCombinations.map((combo, index) => (
          <div key={index} className={styles['emoji-combination-item']}>
            <div className={styles['emoji-bubble-mini']}>
              <span className={styles['bubble-emoji-char-mini']}>{combo.emoji}</span>
            </div>
            <div className={styles['merged-emoji-mini']}>
              { }
              <img
                src={combo.combination.gStaticUrl}
                alt={combo.combination.alt}
                className={styles['merged-emoji-image-mini']}
                title={combo.combination.alt}
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
