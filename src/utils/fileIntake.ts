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

const documentAcceptExtensions = [
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
  ...TEXT_EXTENSIONS.map((extension) => `.${extension}`),
  ...CODE_EXTENSIONS.filter((extension) => !extension.includes(".")).map(
    (extension) => `.${extension}`,
  ),
  // Pickers key on the trailing suffix, so `.env.example` matches via:
  ".example",
];

const documentAcceptMimeTypes = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "text/markdown",
  "application/json",
];

/**
 * Build the file-picker accept string from the active model's
 * supported input modalities. Image adds explicit `.svg,.heic,.heif`
 * extensions because pickers on platforms with missing MIME mappings
 * would otherwise exclude them despite `image/*`.
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
      [...documentAcceptExtensions, ...documentAcceptMimeTypes].join(","),
    );
  return filters.join(",");
}
