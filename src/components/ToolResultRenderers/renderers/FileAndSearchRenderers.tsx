import React from "react";
import { FileText, Search, FolderTree, Folder, File, Globe } from "lucide-react";
import { RendererProps } from "../types";
import { tryParse, basename } from "../utils";
import { PathPill, StatusBadge, RawResultToggle } from "../SharedComponents";
import styles from "../ToolResultRenderersComponent.module.css";

// -- 1. File Read ------------------------------------------------------

export function FileReadRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const filePath = parsed.path || args?.path || "";
  const content = parsed.content || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <PathPill path={filePath} icon={FileText} />
      </div>
      {content && (
        <pre className={styles['code-block']}>
          <code>
            {content.length > 3000 ? content.slice(0, 3000) + "\n…" : content}
          </code>
        </pre>
      )}
    </div>
  );
}

// -- 2. File Write -----------------------------------------------------

export function FileWriteRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const filePath = parsed.path || args?.path || "";
  const hasError = !!parsed.error;
  const isCreated = !!parsed.created;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <PathPill path={filePath} icon={FileText} />
        <StatusBadge
          success={!hasError}
          label={isCreated ? "Created" : "Written"}
        />
      </div>
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
    </div>
  );
}

// -- 3. String Replace -------------------------------------------------

export function StrReplaceRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const filePath = parsed.path || args?.path || "";
  const hasError = !!parsed.error;
  const replacements = parsed.replacements || parsed.count || 1;

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <PathPill path={filePath} icon={FileText} />
        <StatusBadge
          success={!hasError}
          label={`${replacements} replacement${replacements !== 1 ? "s" : ""}`}
        />
      </div>
      {args?.oldStr && args?.newStr && (
        <pre className={styles['diff-block']}>
          <code>
            <span className={styles['diff-removed']}>
              -{" "}
              {args.oldStr.length > 200
                ? args.oldStr.slice(0, 200) + "…"
                : args.oldStr}
            </span>
            {"\n"}
            <span className={styles['diff-added']}>
              +{" "}
              {args.newStr.length > 200
                ? args.newStr.slice(0, 200) + "…"
                : args.newStr}
            </span>
          </code>
        </pre>
      )}
      {parsed.error && <div className={styles['error-text']}>{parsed.error}</div>}
    </div>
  );
}

// -- 4. Grep Search ----------------------------------------------------

export function GrepSearchRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const matches = (parsed.matches || parsed.results || []) as Array<{
    file?: string;
    path?: string;
    line?: number | null;
    content?: string;
    text?: string;
    match?: string;
  }>;
  const totalMatches = parsed.totalMatches ?? parsed.count ?? matches.length;
  const searchPattern = args?.pattern || "";

  // Group by file
  const groupedMatches: Record<
    string,
    Array<{
      file?: string;
      path?: string;
      line?: number | null;
      content?: string;
      text?: string;
      match?: string;
    }>
  > = {};
  for (const matchItem of matches.slice(0, 30)) {
    const file = matchItem.file || matchItem.path || "unknown";
    if (!groupedMatches[file]) groupedMatches[file] = [];
    groupedMatches[file].push(matchItem);
  }

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Search size={13} />
        <span className={styles['renderer-title']}>
          {totalMatches} match{totalMatches !== 1 ? "es" : ""} for{" "}
          <code className={styles['inline-code']}>{searchPattern}</code>
        </span>
      </div>
      <div className={styles['grep-list']}>
        {Object.entries(groupedMatches).map(([file, fileMatches]) => (
          <div key={file} className={styles['grep-file']}>
            <span className={styles['grep-file-path']}>{file}</span>
            {fileMatches.map((matchItem, index) => (
              <div key={index} className={styles['grep-line']}>
                {matchItem.line != null && (
                  <span className={styles['grep-line-num']}>{matchItem.line}</span>
                )}
                <span className={styles['grep-line-content']}>
                  {matchItem.content || matchItem.text || matchItem.match || ""}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- 5. Directory List -------------------------------------------------

export function DirectoryListRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  const rawEntries = parsed.entries || parsed.items || parsed.files || [];
  type DirEntry =
    | string
    | { name?: string; path?: string; type?: string; isDirectory?: boolean };
  const entries: DirEntry[] = (
    Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries)
  ) as DirEntry[];
  const directoryPath = parsed.path || args?.path || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <FolderTree size={13} />
        <span className={styles['renderer-title']}>
          {basename(directoryPath) || "Directory"}
        </span>
      </div>
      <div className={styles['directory-list']}>
        {entries.slice(0, 40).map((entry, index) => {
          const name =
            typeof entry === "string" ? entry : entry.name || entry.path || "";
          const isDirectory =
            typeof entry === "object" &&
            (entry.type === "directory" || entry.isDirectory);
          return (
            <div key={index} className={styles['directory-entry']}>
              {isDirectory ? (
                <Folder size={11} className={styles['directory-icon']} />
              ) : (
                <File size={11} className={styles['file-icon']} />
              )}
              <span>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- 6. Glob Files -----------------------------------------------------

export function GlobFilesRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  type FileEntry = string | { path?: string; name?: string };
  const matchedFiles = (parsed.files || parsed.matches || []) as FileEntry[];
  const globPattern = args?.pattern || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Search size={13} />
        <span className={styles['renderer-title']}>
          {matchedFiles.length} file{matchedFiles.length !== 1 ? "s" : ""} matching{" "}
          <code className={styles['inline-code']}>{globPattern}</code>
        </span>
      </div>
      <div className={styles['directory-list']}>
        {matchedFiles.slice(0, 40).map((fileEntry, index) => {
          const path = typeof fileEntry === "string" ? fileEntry : fileEntry.path || fileEntry.name || "";
          return (
            <div key={index} className={styles['directory-entry']}>
              <File size={11} className={styles['file-icon']} />
              <span>{path}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- 7. Web Search -----------------------------------------------------

export function WebSearchRenderer({ result, args }: RendererProps) {
  const parsed = tryParse(result);
  if (!parsed) return <RawResultToggle result={result} />;

  type SearchResult = {
    title?: string;
    url?: string;
    link?: string;
    snippet?: string;
    name?: string;
  };
  const searchResults = (parsed.results || parsed.items || []) as SearchResult[];
  const searchQueries = args?.query || "";

  return (
    <div className={styles['renderer-block']}>
      <div className={styles['renderer-header']}>
        <Globe size={13} />
        <span className={styles['renderer-title']}>
          {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;
          {searchQueries}&rdquo;
        </span>
      </div>
      <div className={styles['search-results']}>
        {searchResults.slice(0, 8).map((searchResultItem, index) => (
          <div key={index} className={styles['search-result']}>
            <a
              href={searchResultItem.url || searchResultItem.link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles['search-link']}
            >
              {searchResultItem.title || searchResultItem.name || searchResultItem.url}
            </a>
            {searchResultItem.snippet && <p className={styles['search-snippet']}>{searchResultItem.snippet}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
