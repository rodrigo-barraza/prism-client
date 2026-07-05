import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Terminal, GitBranch } from "lucide-react";
import { RendererProps } from "../types";
import { tryParse, ANSI_RE, ANSI_COLORS, ANSI_BRIGHT_COLORS, ansi256ToHex, stripAnsi } from "../utils";
import { StatusBadge, RawResultToggle } from "../SharedComponents";
import styles from "../ToolResultRenderersComponent.module.css";

const PROMPT_PREFIXES: Record<string, string> = { bash: "$ ", python: ">>> ", javascript: "> " };
const CONTINUATION_PREFIXES: Record<string, string> = { python: "... ", javascript: ".. " };
const DEFAULT_CWD: Record<string, string> = { bash: "/tmp", python: "python3", javascript: "node" };

function formatInputPrompt(
  input: string | null,
  language: string | undefined,
  cwd: string | null,
) {
  if (!input) return "";
  const prompt = PROMPT_PREFIXES[language || ""] || "$ ";
  const continuationPrompt = CONTINUATION_PREFIXES[language || ""] || "  ";
  const lines = input.split("\n");
  const resolvedCwd = cwd || DEFAULT_CWD[language || ""] || "";
  const pathPrefix = resolvedCwd ? `${resolvedCwd} ` : "";
  return lines
    .map(
      (line: string, index: number) =>
        `${index === 0 ? pathPrefix + prompt : continuationPrompt}${line}`,
    )
    .join("\n");
}

function parseAnsi(text: string): string | React.ReactNode | React.ReactNode[] {
  if (!text.includes("\x1b")) return text;
  const parts = [];
  let lastIndex = 0;
  let key = 0;
  let color = null,
    bgColor = null,
    bold = false,
    dim = false,
    italic = false,
    underline = false;
  let match;
  ANSI_RE.lastIndex = 0;
  while ((match = ANSI_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (color || bgColor || bold || dim || italic || underline) {
        const style: React.CSSProperties = {};
        if (color) style.color = color;
        if (bgColor) style.backgroundColor = bgColor;
        if (bold) style.fontWeight = 700;
        if (dim) style.opacity = 0.6;
        if (italic) style.fontStyle = "italic";
        if (underline) style.textDecoration = "underline";
        parts.push(
          <span key={key++} style={style}>
            {chunk}
          </span>,
        );
      } else {
        parts.push(chunk);
      }
    }
    lastIndex = match.index + match[0].length;
    const codes = match[1] ? match[1].split(";").map(Number) : [0];
    for (let i = 0; i < codes.length; i++) {
      const colorCode = codes[i];
      if (colorCode === 0) {
        color = null;
        bgColor = null;
        bold = false;
        dim = false;
        italic = false;
        underline = false;
      } else if (colorCode === 1) bold = true;
      else if (colorCode === 2) dim = true;
      else if (colorCode === 3) italic = true;
      else if (colorCode === 4) underline = true;
      else if (colorCode === 22) {
        bold = false;
        dim = false;
      } else if (colorCode === 23) italic = false;
      else if (colorCode === 24) underline = false;
      else if (colorCode === 39) color = null;
      else if (colorCode === 49) bgColor = null;
      else if (colorCode >= 30 && colorCode <= 37)
        color = ANSI_COLORS[colorCode - 30];
      else if (colorCode >= 40 && colorCode <= 47)
        bgColor = ANSI_COLORS[colorCode - 40];
      else if (colorCode >= 90 && colorCode <= 97)
        color = ANSI_BRIGHT_COLORS[colorCode - 90];
      else if (colorCode >= 100 && colorCode <= 107)
        bgColor = ANSI_BRIGHT_COLORS[colorCode - 100];
      else if (colorCode === 38 && codes[i + 1] === 5 && codes[i + 2] != null) {
        color = ansi256ToHex(codes[i + 2]);
        i += 2;
      } else if (
        colorCode === 48 &&
        codes[i + 1] === 5 &&
        codes[i + 2] != null
      ) {
        bgColor = ansi256ToHex(codes[i + 2]);
        i += 2;
      }
    }
  }
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (color || bgColor || bold || dim || italic || underline) {
      const style: React.CSSProperties = {};
      if (color) style.color = color;
      if (bgColor) style.backgroundColor = bgColor;
      if (bold) style.fontWeight = 700;
      if (dim) style.opacity = 0.6;
      if (italic) style.fontStyle = "italic";
      if (underline) style.textDecoration = "underline";
      parts.push(
        <span key={key++} style={style}>
          {chunk}
        </span>,
      );
    } else {
      parts.push(chunk);
    }
  }
  return parts.length === 1 ? parts[0] : parts;
}

function detectTerminalLevel(text: string): string | null {
  const cleanText = stripAnsi(text);
  if (/\bERR(?:OR)?\b/i.test(cleanText)) return "error";
  if (/\bWARN(?:ING)?\b/i.test(cleanText)) return "warn";
  if (/\bINFO\b/i.test(cleanText)) return "info";
  if (/\b(?:OK|SUCCESS|PASS(?:ED)?)\b/i.test(cleanText)) return "success";
  if (/\bDBG|DEBUG\b/i.test(cleanText)) return "debug";
  return null;
}

const TERM_LEVEL_CLASS: Record<string, string> = {
  error: styles['term-line-error'],
  warn: styles['term-line-warn'],
  success: styles['term-line-success'],
};

const TERM_CONTENT_LEVEL_CLASS: Record<string, string> = {
  error: styles['term-content-error'],
  warn: styles['term-content-warn'],
  info: styles['term-content-info'],
  success: styles['term-content-success'],
  debug: styles['term-content-debug'],
};

export function TerminalRenderer({
  result,
  args,
  streamingOutput,
  language,
}: RendererProps) {
  const bodyElementRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const commandInput = args?.command || args?.code || null;
  const currentWorkingDirectory = args?.cwd || null;
  const isCurrentlyStreaming = !result;
  const terminalOutput = streamingOutput || "";

  // Parse final result for exit code
  const parsedResult = tryParse(result);
  const exitCodeValue = parsedResult?.exitCode ?? parsedResult?.exit_code;
  const isSuccessful = parsedResult?.success;
  const standardOutput = parsedResult?.stdout || parsedResult?.output || "";
  const standardError = parsedResult?.stderr || "";
  const parsingError = parsedResult?.error || "";
  const finalDisplayOutput = isCurrentlyStreaming
    ? terminalOutput
    : standardOutput || standardError || parsingError || terminalOutput;

  const formattedInputPrompt = formatInputPrompt(commandInput, language, currentWorkingDirectory);

  // Split output into lines for per-line rendering
  const outputLinesArray = useMemo(() => {
    if (!finalDisplayOutput) return [];
    return finalDisplayOutput.split("\n");
  }, [finalDisplayOutput]);

  const inputLinesArray = useMemo(() => {
    if (!formattedInputPrompt) return [];
    return formattedInputPrompt.split("\n");
  }, [formattedInputPrompt]);

  const totalLinesCount = inputLinesArray.length + outputLinesArray.length;

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (isAutoScrollEnabled && bodyElementRef.current) {
      bodyElementRef.current.scrollTop = bodyElementRef.current.scrollHeight;
    }
  }, [finalDisplayOutput, isAutoScrollEnabled]);

  // Detect user scroll position
  const handleTerminalScroll = useCallback(() => {
    if (!bodyElementRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyElementRef.current;
    const isAtTheBottom = scrollHeight - scrollTop - clientHeight < 40;
    setIsAutoScrollEnabled(isAtTheBottom);
  }, []);

  if (!finalDisplayOutput && !formattedInputPrompt)
    return <RawResultToggle result={result} />;

  return (
    <div className={styles['terminal-block']}>
      <div className={styles['terminal-header']}>
        <Terminal size={11} />
        <span>{language || "terminal"}</span>
        {isCurrentlyStreaming && <span className={styles['terminal-live']}>● live</span>}
        {exitCodeValue != null && (
          <StatusBadge success={exitCodeValue === 0} label={`exit ${exitCodeValue}`} />
        )}
        {exitCodeValue == null && isSuccessful === false && (
          <StatusBadge success={false} label="error" />
        )}
        {totalLinesCount > 0 && (
          <span className={styles['terminal-line-count']}>
            {totalLinesCount.toLocaleString()}
          </span>
        )}
      </div>
      <div
        ref={bodyElementRef}
        className={styles['terminal-body']}
        onScroll={handleTerminalScroll}
      >
        {/* Input command lines */}
        {inputLinesArray.map((line, index) => (
          <div key={`in-${index}`} className={styles['term-line']}>
            <span className={styles['term-line-num']}>{index + 1}</span>
            <span
              className={`${styles['term-line-content']} ${styles['terminal-input']}`}
            >
              {line}
            </span>
          </div>
        ))}
        {/* Output lines */}
        {outputLinesArray.map((line, index) => {
          const terminalLevel = detectTerminalLevel(line);
          const currentLineNumber = inputLinesArray.length + index + 1;
          return (
            <div
              key={`out-${index}`}
              className={`${styles['term-line']} ${terminalLevel ? TERM_LEVEL_CLASS[terminalLevel] || "" : ""}`}
            >
              <span className={styles['term-line-num']}>{currentLineNumber}</span>
              <span
                className={`${styles['term-line-content']} ${terminalLevel ? TERM_CONTENT_LEVEL_CLASS[terminalLevel] || "" : ""}`}
              >
                {parseAnsi(line)}
              </span>
            </div>
          );
        })}
        {isCurrentlyStreaming && (
          <div className={styles['term-line']}>
            <span className={styles['term-line-num']} />
            <span className={styles['term-line-content']}>
              <span className={styles['terminal-cursor']}>▊</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Git Status --------------------------------------------------------

export function GitStatusRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const statusFiles = (parsed.files || parsed.status || []) as Array<{
    path?: string;
    file?: string;
    status?: string;
    state?: string;
  }>;
  const currentBranch = parsed.branch || "";
  const isRepositoryClean = parsed.clean || statusFiles.length === 0;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <GitBranch size={13} />
        <span className={styles['renderer-title']}>{currentBranch || "git status"}</span>
        <StatusBadge
          success={isRepositoryClean}
          label={isRepositoryClean ? "Clean" : `${statusFiles.length} changed`}
        />
      </div>
      {!isRepositoryClean && (
        <div className={styles['directory-list']}>
          {statusFiles.slice(0, 30).map((fileEntry, index) => {
            const fileName = typeof fileEntry === "string" ? fileEntry : fileEntry.path || fileEntry.file || "";
            const fileStatus =
              typeof fileEntry === "object" && fileEntry !== null
                ? fileEntry.status || fileEntry.state || ""
                : "";
            return (
              <div key={index} className={styles['directory-entry']}>
                {fileStatus && <span className={styles['git-status']}>{fileStatus}</span>}
                <span>{fileName}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- Git Diff ----------------------------------------------------------

export function GitDiffRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const diffOutput =
    parsed.diff || parsed.output || (typeof result === "string" ? result : "");

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <GitBranch size={13} />
        <span className={styles['renderer-title']}>git diff</span>
      </div>
      {diffOutput && (
        <pre className={styles['diff-block']}>
          <code>
            {diffOutput
              .split("\n")
              .slice(0, 80)
              .map((line, index) => {
                let diffClass = "";
                if (line.startsWith("+") && !line.startsWith("+++"))
                  diffClass = styles['diff-added'];
                else if (line.startsWith("-") && !line.startsWith("---"))
                  diffClass = styles['diff-removed'];
                else if (line.startsWith("@@")) diffClass = styles['diff-hunk'];
                return (
                  <span key={index} className={diffClass}>
                    {line}
                    {"\n"}
                  </span>
                );
              })}
          </code>
        </pre>
      )}
    </div>
  );
}

// -- Git Log -----------------------------------------------------------

export function GitLogRenderer({ result }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;
  type CommitEntry = {
    hash?: string;
    sha?: string;
    message?: string;
    subject?: string;
    author?: string;
  };
  const logCommits = (parsed.commits || parsed.log || []) as CommitEntry[];

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <GitBranch size={13} />
        <span className={styles['renderer-title']}>
          {logCommits.length} commit{logCommits.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className={styles['git-log']}>
        {logCommits.slice(0, 15).map((commitEntry, index) => (
          <div key={index} className={styles['git-commit']}>
            <span className={styles['git-hash']}>
              {(commitEntry.hash || commitEntry.sha || "").slice(0, 7)}
            </span>
            <span className={styles['git-message']}>
              {commitEntry.message || commitEntry.subject || ""}
            </span>
            {commitEntry.author && <span className={styles['git-author']}>{commitEntry.author}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
