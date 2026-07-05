import React from "react";
import { Download } from "lucide-react";
import { RendererProps } from "../types";
import { tryParse } from "../utils";
import { StatusBadge, RawResultToggle } from "../SharedComponents";
import { TurtleDrawEmbed, AutoResizeToolEmbed } from "./BrowserMediaAndVisualRenderers";
import styles from "../ToolResultRenderersComponent.module.css";

// -- 3D Mesh Rendering --------------------------------------------------

function ThreeDimensionalSceneEmbed({ sourceUrl, title }: { sourceUrl: string; title: string }) {
  return (
    <div className={styles["three-dimensional-mesh-embed-wrapper"]}>
      <iframe
        src={sourceUrl}
        className={styles["three-dimensional-mesh-embed-frame"]}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export function ThreeMeshRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasMeshError = !!parsed.error;
  const meshVertexCount = parsed.vertexCount || (args as { vertices?: unknown[] })?.vertices?.length || 0;
  const meshFaceCount = parsed.faceCount || (args as { faces?: unknown[] })?.faces?.length || 0;
  const totalMeshVertices = parsed.totalVertices || meshVertexCount;
  const totalMeshFaces = parsed.totalFaces || meshFaceCount;
  const isMeshAppend = !!parsed.isAppend;
  const meshEmbedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🔺</span>
        <span className={styles['renderer-title']}>
          3D Mesh — {isMeshAppend ? `Added ${meshVertexCount} vertices, ${meshFaceCount} faces` : `Created ${meshVertexCount} vertices, ${meshFaceCount} faces`}
          {isMeshAppend && ` (Total: ${totalMeshVertices} vertices, ${totalMeshFaces} faces)`}
        </span>
        <StatusBadge
          success={!hasMeshError}
          label={hasMeshError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasMeshError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasMeshError && meshEmbedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={meshEmbedUrl} title="3D Mesh Renderer" />
      )}
    </div>
  );
}

export function ThreeVoxelRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasVoxelError = !!parsed.error;
  const gridVoxelCount = parsed.voxelCount || 0;
  const totalVoxelCount = parsed.totalVoxels || gridVoxelCount;
  const isVoxelAppend = !!parsed.isAppend;
  const voxelEmbedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🧊</span>
        <span className={styles['renderer-title']}>
          3D Voxel Grid — {isVoxelAppend ? `Added ${gridVoxelCount} voxels` : `Created ${gridVoxelCount} voxels`}
          {isVoxelAppend && ` (Total: ${totalVoxelCount} voxels)`}
        </span>
        <StatusBadge
          success={!hasVoxelError}
          label={hasVoxelError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasVoxelError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasVoxelError && voxelEmbedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={voxelEmbedUrl} title="3D Voxel Grid" />
      )}
    </div>
  );
}

export function ThreeModelRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasModelError = !!parsed.error;
  const modelObjectCount = parsed.objectCount || (args as { objects?: unknown[] })?.objects?.length || 0;
  const totalModelObjects = parsed.totalObjects || modelObjectCount;
  const isModelAppend = !!parsed.isAppend;
  const modelEmbedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🎨</span>
        <span className={styles['renderer-title']}>
          3D Model — {isModelAppend ? `Added ${modelObjectCount} objects` : `Created ${modelObjectCount} objects`}
          {isModelAppend && ` (Total: ${totalModelObjects} objects)`}
        </span>
        <StatusBadge
          success={!hasModelError}
          label={hasModelError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasModelError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasModelError && modelEmbedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={modelEmbedUrl} title="3D Model" />
      )}
    </div>
  );
}

export function ThreeSceneRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasSceneError = !!parsed.error;
  const sceneObjectCount = parsed.objectCount || parsed.totalObjects || 0;
  const isSceneAppend = !!parsed.isAppend;
  const sceneEmbedUrl = parsed.sceneEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🌐</span>
        <span className={styles['renderer-title']}>
          3D Scene — {isSceneAppend ? `Updated (${sceneObjectCount} objects)` : `Created (${sceneObjectCount} objects)`}
        </span>
        <StatusBadge
          success={!hasSceneError}
          label={hasSceneError ? "Error" : "Interactive 3D"}
        />
      </div>
      {hasSceneError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasSceneError && sceneEmbedUrl && (
        <ThreeDimensionalSceneEmbed sourceUrl={sceneEmbedUrl} title="3D Scene" />
      )}
    </div>
  );
}

// -- QR Code Rendering --------------------------------------------------

export function QrCodeRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasQrError = !!parsed.error;
  const qrCodeImageUrl = parsed.qrImageUrl || "";
  const encodedDataLength = parsed.dataLength || 0;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📱</span>
        <span className={styles['renderer-title']}>
          QR Code{!hasQrError && encodedDataLength > 0 ? ` — ${encodedDataLength} chars encoded` : ""}
        </span>
        <StatusBadge
          success={!hasQrError}
          label={hasQrError ? "Error" : "Generated"}
        />
      </div>
      {hasQrError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasQrError && qrCodeImageUrl && (
        <div className={styles['visual-tool-image-container']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCodeImageUrl}
            alt="Generated QR Code"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

// -- LaTeX Rendering ----------------------------------------------------

export function LatexRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasLatexError = !!parsed.error;
  const latexEmbedUrl = parsed.latexEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📐</span>
        <span className={styles['renderer-title']}>LaTeX Equation</span>
        <StatusBadge
          success={!hasLatexError}
          label={hasLatexError ? "Error" : "Rendered"}
        />
      </div>
      {hasLatexError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasLatexError && latexEmbedUrl && (
        <AutoResizeToolEmbed
          sourceUrl={latexEmbedUrl}
          title="LaTeX Equation"
          fallbackHeight={160}
        />
      )}
    </div>
  );
}

// -- Diagram Rendering --------------------------------------------------

export function DiagramRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasDiagramError = !!parsed.error;
  const diagramEmbedUrl = parsed.diagramEmbedUrl || parsed.embedUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📊</span>
        <span className={styles['renderer-title']}>Mermaid Diagram</span>
        <StatusBadge
          success={!hasDiagramError}
          label={hasDiagramError ? "Error" : "Rendered"}
        />
      </div>
      {hasDiagramError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasDiagramError && diagramEmbedUrl && (
        <AutoResizeToolEmbed
          sourceUrl={diagramEmbedUrl}
          title="Mermaid Diagram"
          fallbackHeight={420}
        />
      )}
    </div>
  );
}

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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

// -- Video to GIF Rendering --------------------------------------------

export function VideoToGifRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasConversionError = !!parsed.error;
  const gifImageUrl = parsed.imageUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🎞️</span>
        <span className={styles['renderer-title']}>Video → GIF Conversion</span>
        <StatusBadge
          success={!hasConversionError}
          label={hasConversionError ? "Error" : "Converted"}
        />
      </div>
      {hasConversionError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasConversionError && gifImageUrl && (
        <div className={styles['visual-tool-image-container']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gifImageUrl}
            alt="Converted GIF"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

// -- Map Rendering -----------------------------------------------------

export function MapRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasMapError = !!parsed.error;
  const mapEmbedUrl = (parsed as Record<string, unknown>).mapEmbedUrl as string || parsed.embedUrl || "";
  const mapMarkerCount = (parsed as Record<string, unknown>).markerCount as number || 0;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>🗺️</span>
        <span className={styles['renderer-title']}>
          Interactive Map{mapMarkerCount > 0 ? ` — ${mapMarkerCount} marker${mapMarkerCount !== 1 ? "s" : ""}` : ""}
        </span>
        <StatusBadge
          success={!hasMapError}
          label={hasMapError ? "Error" : "Generated"}
        />
      </div>
      {hasMapError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasMapError && mapEmbedUrl && (
        <AutoResizeToolEmbed
          sourceUrl={mapEmbedUrl}
          title="Interactive Map"
          fallbackHeight={360}
        />
      )}
    </div>
  );
}

// -- Chart Rendering ----------------------------------------------------

export function ChartRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const hasChartError = !!parsed.error;
  const chartImageUrl = (parsed as Record<string, unknown>).chartImageUrl as string || parsed.imageUrl || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <span style={{ fontSize: 13 }}>📈</span>
        <span className={styles['renderer-title']}>Chart</span>
        <StatusBadge
          success={!hasChartError}
          label={hasChartError ? "Error" : "Generated"}
        />
      </div>
      {hasChartError && <div className={styles['error-text']}>{parsed.error}</div>}
      {!hasChartError && chartImageUrl && (
        <div className={styles['visual-tool-image-container']}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={chartImageUrl}
            alt="Generated chart"
            className={styles['visual-tool-image']}
            loading="lazy"
          />
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
