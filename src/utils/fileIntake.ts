/**
 * File-intake classification shared by the chat input
 * (AgentChatComponent) and sent-message attachment rendering
 * (MessageListComponent).
 *
 * Browsers report odd or empty MIME types for code/config files
 * (`text/x-python`, `application/x-yaml`, `""`, or the generic
 * `application/octet-stream`). Classification therefore runs in two
 * passes: trust the browser MIME when it maps to a known modality,
 * otherwise fall back to an extension table. The fallback also
 * supplies a normalized MIME type — the server upload allowlist
 * blocks `application/octet-stream` by design and relies on the
 * client rewriting generic MIMEs before upload.
 */

export type IntakeModality = "image" | "audio" | "video" | "pdf" | "document";

export interface FileIntakeClassification {
  modality: IntakeModality;
  /** Effective MIME type — the browser's when trusted, else the mapped one. */
  mimeType: string;
}

/** Document-modality MIME types accepted when the browser reports them. */
export const DOCUMENT_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/tab-separated-values",
  "text/plain",
  "text/markdown",
  "application/json",
];

/** Plain-text extensions — rendered with a FileText icon. */
const TEXT_EXTENSIONS = ["txt", "md", "markdown", "log", "srt", "vtt"];

/** Code/config extensions — rendered with a FileCode icon. */
const CODE_EXTENSIONS = [
  "json",
  "jsonl",
  "yaml",
  "yml",
  "xml",
  "html",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "sh",
  "bash",
  "zsh",
  "sql",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env.example",
];

/* Extensions whose normalized MIME is NOT text/plain. Everything the
 * server allowlist is not known to accept stays text/plain — the
 * upload endpoint only needs to know the payload is renderable text. */
const EXTENSION_MIME_OVERRIDES: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  jsonl: "application/json",
};

/** Tabular text — document modality, but keeps the spreadsheet icon. */
const TABULAR_TEXT_EXTENSIONS: Record<string, string> = {
  csv: "text/csv",
  tsv: "text/tab-separated-values",
};

/* Image formats browsers often ship without a MIME mapping. The server
 * converts HEIC and rasterizes SVG for vision — the client only needs
 * to let them through as the image modality. */
const IMAGE_FALLBACK_EXTENSIONS: Record<string, string> = {
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * Extension → (mimeType, modality) fallback table, consulted when the
 * browser MIME is empty, `application/octet-stream`, or unrecognized.
 */
export const EXTENSION_FALLBACK_TABLE: Record<string, FileIntakeClassification> =
  (() => {
    const table: Record<string, FileIntakeClassification> = {};
    for (const extension of [...TEXT_EXTENSIONS, ...CODE_EXTENSIONS]) {
      table[extension] = {
        modality: "document",
        mimeType: EXTENSION_MIME_OVERRIDES[extension] ?? "text/plain",
      };
    }
    for (const [extension, mimeType] of Object.entries(TABULAR_TEXT_EXTENSIONS)) {
      table[extension] = { modality: "document", mimeType };
    }
    for (const [extension, mimeType] of Object.entries(IMAGE_FALLBACK_EXTENSIONS)) {
      table[extension] = { modality: "image", mimeType };
    }
    return table;
  })();

/** MIME types the browser uses when it has no idea what a file is. */
export function isGenericMimeType(mimeType: string): boolean {
  return !mimeType || mimeType === "application/octet-stream";
}

/**
 * Lower-cased extension of a filename, or null when it has none.
 * Compound extensions in the fallback table (`.env.example`) win over
 * the plain last suffix.
 */
export function getFileExtension(fileName: string): string | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".env.example")) return "env.example";
  const dotIndex = lowerName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === lowerName.length - 1) return null;
  return lowerName.slice(dotIndex + 1);
}

/** Map a trusted (browser-reported) MIME type to an input modality. */
export function classifyMimeType(mimeType: string): IntakeModality | null {
  if (isGenericMimeType(mimeType)) return null;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (DOCUMENT_MIME_TYPES.includes(mimeType)) return "document";
  return null;
}

/**
 * Classify a file into an input modality + effective MIME type.
 * The browser MIME wins when recognized; otherwise the extension
 * fallback table decides (and supplies the normalized MIME).
 * Returns null for files that map to no known modality — callers gate
 * the result against the active model's supported modalities.
 */
export function classifyIntakeFile(
  fileName: string,
  browserMimeType: string,
): FileIntakeClassification | null {
  const directModality = classifyMimeType(browserMimeType);
  if (directModality) {
    return { modality: directModality, mimeType: browserMimeType };
  }
  const extension = getFileExtension(fileName);
  if (!extension) return null;
  return EXTENSION_FALLBACK_TABLE[extension] ?? null;
}

/**
 * Rewrite the MIME segment of a data URL to the effective MIME type.
 * No-op when the header already matches. Handles empty headers
 * (`data:;base64,`) and generic ones (`data:application/octet-stream;…`).
 */
export function normalizeDataUrlMimeType(
  dataUrl: string,
  mimeType: string,
): string {
  return dataUrl.replace(/^data:[^;,]*/, `data:${mimeType}`);
}

/**
 * Text-like payloads are universally supported: the server inlines
 * text documents (≤256KB) into the model payload for every provider,
 * so no model-modality or reader-tool support is required. Only
 * binary documents (docx/xlsx/pdf) depend on the document/pdf
 * modality being available. The check runs on the *effective* MIME
 * type — the extension fallback table has already normalized code
 * and config files to text/* or application/json.
 */
export function isUniversallyReadableMime(mimeType: string): boolean {
  return mimeType.startsWith("text/") || mimeType === "application/json";
}

/**
 * Icon bucket for text-like files: "code" (FileCode), "text"
 * (FileText), or null when the file is not a recognized text/code
 * type (callers keep their modality-based icon).
 */
export function getTextualFileKind(fileName: string): "code" | "text" | null {
  const extension = getFileExtension(fileName);
  if (!extension) return null;
  if (CODE_EXTENSIONS.includes(extension)) return "code";
  if (TEXT_EXTENSIONS.includes(extension)) return "text";
  return null;
}

/* -- File-picker accept string --------------------------------- */

/* Text-like files — always offered, regardless of model modalities
 * (see isUniversallyReadableMime). */
const textualAcceptExtensions = [
  ".csv",
  ".tsv",
  ...TEXT_EXTENSIONS.map((extension) => `.${extension}`),
  ...CODE_EXTENSIONS.filter((extension) => !extension.includes(".")).map(
    (extension) => `.${extension}`,
  ),
  // Pickers key on the trailing suffix, so `.env.example` matches via:
  ".example",
];

const textualAcceptMimeTypes = [
  "text/csv",
  "text/plain",
  "text/markdown",
  "application/json",
];

/* Binary office documents — need the document modality (reader tools). */
const officeAcceptExtensions = [".docx", ".doc", ".xlsx", ".xls"];

const officeAcceptMimeTypes = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/**
 * Build the file-picker accept string from the active model's
 * supported input modalities. Text/code files are always included —
 * they inline as plain text for every provider. Image adds explicit
 * `.svg,.heic,.heif` extensions because pickers on platforms with
 * missing MIME mappings would otherwise exclude them despite
 * `image/*`.
 */
export function buildAcceptFilter(
  supportedInputModalities: Set<string>,
): string {
  const filters: string[] = [];
  if (supportedInputModalities.has("image"))
    filters.push("image/*,.svg,.heic,.heif");
  if (supportedInputModalities.has("audio")) filters.push("audio/*");
  if (supportedInputModalities.has("video")) filters.push("video/*");
  if (supportedInputModalities.has("pdf")) filters.push(".pdf,application/pdf");
  if (supportedInputModalities.has("document"))
    filters.push(
      [...officeAcceptExtensions, ...officeAcceptMimeTypes].join(","),
    );
  filters.push(
    [...textualAcceptExtensions, ...textualAcceptMimeTypes].join(","),
  );
  return filters.join(",");
}

/**
 * Human-readable file size for attachment chips: bytes below 1 KB,
 * one decimal for KB/MB (trailing .0 trimmed), e.g. "612 B",
 * "30.4 KB", "2.1 MB".
 */
export function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "";
  if (sizeBytes < 1024) return `${Math.round(sizeBytes)} B`;
  const trim = (value: number) =>
    value.toFixed(1).replace(/\.0$/, "");
  if (sizeBytes < 1024 * 1024) return `${trim(sizeBytes / 1024)} KB`;
  return `${trim(sizeBytes / (1024 * 1024))} MB`;
}

// -- Client-side image downscaling ------------------------------

/**
 * Long-edge pixel cap for client-side re-encoding. Matches the
 * service's high-resolution Anthropic ceiling (2576px) so no model
 * tier loses detail — the service still clamps each image to the
 * active model's own dimension limit afterwards.
 */
export const IMAGE_DOWNSCALE_MAX_DIMENSION = 2576;

/**
 * Raw file size past which an attached image is re-encoded before it
 * joins the pending payload. Images travel inline as base64 in the
 * agent request body (50 MB JSON limit service-side), so keeping each
 * one to a few MB stops multi-image messages from 413ing.
 */
export const IMAGE_DOWNSCALE_TRIGGER_BYTES = 4 * 1024 * 1024;

/** Post-downscale byte budget per image (encoded blob size). */
const DOWNSCALE_TARGET_BYTES = 4 * 1024 * 1024;

/** Encode qualities tried in order until the result fits the budget. */
const DOWNSCALE_QUALITY_LADDER = [0.92, 0.85, 0.75, 0.6];

/**
 * Raster formats only — re-encoding a GIF drops its animation and
 * rasterizing an SVG destroys its scalability, so both pass through
 * untouched (the service handles GIF resizing with ffmpeg).
 */
const NON_DOWNSCALABLE_IMAGE_MIMES = new Set(["image/gif", "image/svg+xml"]);

/**
 * Whether an attached image should be downscaled in-browser before
 * joining the payload: raster format, over the size trigger.
 */
export function shouldDownscaleImage(
  mimeType: string,
  sizeBytes: number,
): boolean {
  return (
    mimeType.startsWith("image/") &&
    !NON_DOWNSCALABLE_IMAGE_MIMES.has(mimeType) &&
    sizeBytes > IMAGE_DOWNSCALE_TRIGGER_BYTES
  );
}

/** Promisified canvas.toBlob. */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/** Read a Blob back out as a base64 data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscale + re-encode an image file for attachment: decode, cap the
 * long edge at IMAGE_DOWNSCALE_MAX_DIMENSION, and encode as WebP
 * (falling back to PNG/JPEG where the browser can't encode WebP),
 * stepping down the quality ladder until the result fits the budget.
 *
 * Returns the re-encoded data URL, or null when the caller should fall
 * back to the original bytes: decode failure (e.g. HEIC, which
 * browsers can't decode — the service converts it), an unavailable
 * canvas, or a re-encode that came out no smaller than the source.
 */
export async function downscaleImageForAttachment(
  file: globalThis.File,
): Promise<string | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      IMAGE_DOWNSCALE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let encodeType = "image/webp";
    let result: Blob | null = null;
    for (const quality of DOWNSCALE_QUALITY_LADDER) {
      let blob = await canvasToBlob(canvas, encodeType, quality);
      if (blob && blob.type !== encodeType) {
        // toBlob silently falls back to PNG when it can't encode the
        // requested type — keep PNG for PNG sources (preserves alpha),
        // JPEG for everything else.
        encodeType = file.type === "image/png" ? "image/png" : "image/jpeg";
        blob = await canvasToBlob(canvas, encodeType, quality);
      }
      if (!blob) return null;
      result = blob;
      if (blob.size <= DOWNSCALE_TARGET_BYTES) break;
    }

    if (!result || result.size >= file.size) return null;
    return await blobToDataUrl(result);
  } catch {
    return null;
  }
}
