import { ParsedToolResult, ToolResultDisplay } from "./types";

export function basename(filePath: string | null | undefined): string {
  if (!filePath) return "";
  return filePath.split("/").pop() || filePath;
}

export function extensionOf(filePath: string | null | undefined): string {
  const base = basename(filePath);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.substring(dot + 1).toLowerCase() : "";
}

export function tryParse(result: unknown): ParsedToolResult | null {
  if (typeof result === "object" && result !== null) {
    return result as ParsedToolResult;
  }
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as ParsedToolResult;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Extract the self-describing display metadata from a tool result, if any.
 * Returns null unless the result carries a well-formed `display` object.
 */
export function getResultDisplay(result: unknown): ToolResultDisplay | null {
  const display = tryParse(result)?.display as
    | Record<string, unknown>
    | undefined;
  if (!display) return null;
  if (
    typeof display.url === "string" &&
    (display.kind === "embed" ||
      display.kind === "image" ||
      display.kind === "video" ||
      display.kind === "audio")
  ) {
    return display as unknown as ToolResultDisplay;
  }
  if (display.kind === "code" && typeof display.sourceField === "string") {
    return display as unknown as ToolResultDisplay;
  }
  return null;
}

/**
 * Resolve the verbatim text a `kind: "code"` display points at — the
 * sibling result field named by `sourceField`. Null when absent/non-string.
 */
export function getCodeDisplayText(
  result: unknown,
  display: ToolResultDisplay,
): string | null {
  if (display.kind !== "code") return null;
  const parsed = tryParse(result) as Record<string, unknown> | null;
  const value = parsed?.[display.sourceField];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ── {{tool_output:field}} substitution ───────────────────────────
// Mirrors prism-service ToolOutputSubstituter: verbatim-critical tools
// (ASCII banners, hashes, diffs) instruct the model to emit a placeholder
// instead of retyping their output, and the exact value is spliced in from
// the tool result. The server substitutes before persisting; this client
// copy covers live streaming, where the raw token would otherwise be
// visible until the conversation reloads.
const TOOL_OUTPUT_TOKEN = /\{\{tool_output:([A-Za-z0-9_][A-Za-z0-9_.-]*)\}\}/g;

function resolveFieldPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function substituteToolOutputTokens(
  text: string,
  toolCalls?: Array<{ result?: unknown }> | null,
): string {
  if (!text || !text.includes("{{tool_output:")) return text;
  if (!toolCalls || toolCalls.length === 0) return text;
  return text.replace(TOOL_OUTPUT_TOKEN, (token, field: string) => {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const value = resolveFieldPath(tryParse(toolCalls[i]?.result), field);
      if (typeof value === "string" && value.length > 0) return value;
    }
    return token;
  });
}

/**
 * Language hint for syntax highlighting based on file extension.
 */
export const EXT_LANG: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  css: "css",
  scss: "scss",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  xml: "xml",
  toml: "toml",
  lua: "lua",
  c: "c",
  cpp: "cpp",
  h: "c",
};

// -- ANSI escape-code → React span parser utilities ----------------------
export const ANSI_RE = /\x1b\[([0-9;]*)m/g;

export const ANSI_COLORS = [
  null, // 0 – default
  "oklch(0.585 0.22 25)", // 1 – red
  "oklch(0.7 0.17 145)", // 2 – green
  "oklch(0.769 0.177 90.046)", // 3 – yellow
  "oklch(0.588 0.158 241.966)", // 4 – blue
  "oklch(0.6 0.23 290)", // 5 – magenta
  "oklch(0.7 0.15 195)", // 6 – cyan
  "oklch(0.85 0.01 260)", // 7 – white
];

export const ANSI_BRIGHT_COLORS = [
  "oklch(0.5 0.01 260)", // 0 – bright black (gray)
  "oklch(0.65 0.15 25)", // 1 – bright red
  "oklch(0.8 0.15 145)", // 2 – bright green
  "oklch(0.9 0.15 90)", // 3 – bright yellow
  "oklch(0.7 0.13 245)", // 4 – bright blue
  "oklch(0.7 0.18 290)", // 5 – bright magenta
  "oklch(0.8 0.13 195)", // 6 – bright cyan
  "oklch(1 0 0)", // 7 – bright white
];

export function ansi256ToHex(colorCode: number): string | null | undefined {
  if (colorCode < 8) return ANSI_COLORS[colorCode];
  if (colorCode < 16) return ANSI_BRIGHT_COLORS[colorCode - 8];
  if (colorCode < 232) {
    const index = colorCode - 16;
    const result = Math.floor(index / 36) * 51;
    const group = (Math.floor(index / 6) % 6) * 51;
    const current = (index % 6) * 51;
    return `#${result.toString(16).padStart(2, "0")}${group.toString(16).padStart(2, "0")}${current.toString(16).padStart(2, "0")}`;
  }
  const grayscaleValue = (colorCode - 232) * 10 + 8;
  return `#${grayscaleValue.toString(16).padStart(2, "0")}${grayscaleValue.toString(16).padStart(2, "0")}${grayscaleValue.toString(16).padStart(2, "0")}`;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
