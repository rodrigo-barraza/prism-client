import React, { useState, useMemo } from "react";
import { ChevronRight, Check, XCircle, FileText } from "lucide-react";
import { MarkdownContentComponent as MarkdownContent } from "@rodrigo-barraza/components-library";
import JsonViewerComponent from "../JsonViewerComponent";
import { ToolArgs } from "./types";
import styles from "./ToolResultRenderersComponent.module.css";

// --- Status Badge -----------------------------------------------------

interface StatusBadgeProps {
  success: boolean;
  label: string;
}

export function StatusBadge({ success, label }: StatusBadgeProps) {
  return (
    <span
      className={`${styles['status-badge']} ${success ? styles['status-success'] : styles['status-error']}`}
    >
      {success ? <Check size={10} /> : <XCircle size={10} />}
      {label}
    </span>
  );
}

// --- File Path Pill ---------------------------------------------------

interface PathPillProps {
  path: string;
  icon?: React.ComponentType<{ size?: number }>;
}

export function PathPill({ path, icon }: PathPillProps) {
  const Icon = icon || FileText;
  return (
    <span className={styles['path-pill']}>
      <Icon size={11} />
      <span className={styles['path-full']}>{path}</span>
    </span>
  );
}

// --- Collapsible Raw Result -------------------------------------------

export function RawResultToggle({ result }: { result: unknown }) {
  const [isShowingRaw, setIsShowingRaw] = useState(false);
  if (!result) return null;

  const formatted =
    typeof result === "string"
      ? (() => {
          try {
            return (
              "```json\n" +
              JSON.stringify(JSON.parse(result), null, 2) +
              "\n```"
            );
          } catch {
            return "```\n" + result + "\n```";
          }
        })()
      : "```json\n" + JSON.stringify(result, null, 2) + "\n```";

  return (
    <div className={styles['raw-toggle']}>
      <button
        className={styles['raw-toggle-button']}
        onClick={() => setIsShowingRaw((previousState) => !previousState)}
      >
        <ChevronRight size={11} className={isShowingRaw ? styles['chevron-open'] : ""} />
        <span>Raw Response</span>
      </button>
      {isShowingRaw && (
        <div className={styles['raw-content']}>
          <MarkdownContent content={formatted} />
        </div>
      )}
    </div>
  );
}

/**
 * Formats and renders any parameter/argument value based on its type.
 * Renders JSON objects/arrays with JsonViewerComponent, and primitives with class-specific colors.
 */
interface ArgValueViewerProps {
  valueToRender: unknown;
}

export function ArgValueViewerComponent({ valueToRender }: ArgValueViewerProps) {
  const parsedData = useMemo(() => {
    if (valueToRender === null || valueToRender === undefined) {
      return { valueType: "null", parsedValue: null };
    }
    if (typeof valueToRender === "string") {
      const trimmedString = valueToRender.trim();
      if (
        (trimmedString.startsWith("{") && trimmedString.endsWith("}")) ||
        (trimmedString.startsWith("[") && trimmedString.endsWith("]"))
      ) {
        try {
          const parsedObject = JSON.parse(valueToRender);
          if (parsedObject && typeof parsedObject === "object") {
            return { valueType: "json", parsedValue: parsedObject };
          }
        } catch {
          // Treat as a regular string
        }
      }
      if (trimmedString === "true" || trimmedString === "false") {
        return { valueType: "boolean", parsedValue: trimmedString === "true" };
      }
      if (trimmedString === "null") {
        return { valueType: "null", parsedValue: null };
      }
      if (trimmedString !== "" && !isNaN(Number(trimmedString))) {
        return { valueType: "number", parsedValue: Number(trimmedString) };
      }
      return { valueType: "string", parsedValue: valueToRender };
    }
    if (typeof valueToRender === "object") {
      return { valueType: "json", parsedValue: valueToRender };
    }
    if (typeof valueToRender === "boolean") {
      return { valueType: "boolean", parsedValue: valueToRender };
    }
    if (typeof valueToRender === "number") {
      return { valueType: "number", parsedValue: valueToRender };
    }
    return { valueType: typeof valueToRender, parsedValue: valueToRender };
  }, [valueToRender]);

  if (parsedData.valueType === "json") {
    return (
      <div className={styles['json-value-wrapper']}>
        <JsonViewerComponent data={parsedData.parsedValue as any} collapsed={1} />
      </div>
    );
  }

  if (parsedData.valueType === "string") {
    const isLongContent = typeof parsedData.parsedValue === "string" && parsedData.parsedValue.length > 80;
    return (
      <span
        className={`${styles['value-string']} ${isLongContent ? styles['value-string-long'] : ""}`}
      >
        {String(parsedData.parsedValue)}
      </span>
    );
  }

  if (parsedData.valueType === "number") {
    return <span className={styles['value-number']}>{String(parsedData.parsedValue)}</span>;
  }

  if (parsedData.valueType === "boolean") {
    return (
      <span className={styles['value-boolean']}>
        {parsedData.parsedValue ? "true" : "false"}
      </span>
    );
  }

  if (parsedData.valueType === "null") {
    return <span className={styles['value-null']}>null</span>;
  }

  return <span className={styles['value-other']}>{String(parsedData.parsedValue)}</span>;
}

/**
 * Collapsible panel that shows all input arguments passed to a tool call.
 * Renders key-value pairs in a clean, readable format.
 */
export function InputArgsToggle({ args }: { args?: ToolArgs }) {
  const [isInputVisible, setIsInputVisible] = useState(false);

  const entries = useMemo(() => {
    if (!args || typeof args !== "object") return [];
    return Object.entries(args).filter(
      ([, value]) => value !== undefined && value !== null,
    );
  }, [args]);

  if (entries.length === 0) return null;

  return (
    <div className={styles['input-args-toggle']}>
      <button
        className={styles['raw-toggle-button']}
        onClick={() => setIsInputVisible((previousState) => !previousState)}
      >
        <ChevronRight size={11} className={isInputVisible ? styles['chevron-open'] : ""} />
        <span>Input</span>
        <span className={styles['input-args-count']}>{entries.length}</span>
      </button>
      {isInputVisible && (
        <div className={styles['input-args-content']}>
          {entries.map(([key, value]) => {
            const isComplexObject = typeof value === "object" && value !== null;
            let isJsonValue = isComplexObject;
            if (typeof value === "string") {
              const trimmedString = value.trim();
              isJsonValue =
                (trimmedString.startsWith("{") && trimmedString.endsWith("}")) ||
                (trimmedString.startsWith("[") && trimmedString.endsWith("]"));
            }

            return (
              <div
                key={key}
                className={`${isJsonValue ? styles['input-arg-layout-row-complex'] : styles['input-arg-layout-row']}`}
              >
                <span className={styles['input-arg-key']}>{key}</span>
                <div className={styles['input-arg-value-wrapper']}>
                  <ArgValueViewerComponent valueToRender={value} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible panel that shows the raw result returned to the model.
 * Helps users understand exactly what the agent receives back.
 */
export function OutputResultToggle({ result }: { result: unknown }) {
  const [isOutputVisible, setIsOutputVisible] = useState(false);

  const displayData = useMemo(() => {
    if (result === undefined || result === null) return null;
    if (typeof result === "string") {
      try {
        const parsedObject = JSON.parse(result);
        return {
          dataType: "object",
          dataValue: parsedObject,
          rawString: JSON.stringify(parsedObject, null, 2),
        };
      } catch {
        return { dataType: "string", dataValue: result, rawString: result };
      }
    }
    if (typeof result === "object") {
      return {
        dataType: "object",
        dataValue: result,
        rawString: JSON.stringify(result, null, 2),
      };
    }
    return { dataType: "string", dataValue: result, rawString: String(result) };
  }, [result]);

  if (!displayData) return null;

  // Count meaningful entries for the badge
  const entryCount =
    displayData.dataType === "object" && !Array.isArray(displayData.dataValue)
      ? Object.keys(displayData.dataValue).length
      : null;

  return (
    <div className={styles['output-result-toggle']}>
      <button
        className={styles['raw-toggle-button']}
        onClick={() => setIsOutputVisible((previousState) => !previousState)}
      >
        <ChevronRight size={11} className={isOutputVisible ? styles['chevron-open'] : ""} />
        <span>Output</span>
        {entryCount != null && (
          <span className={styles['output-result-count']}>{entryCount}</span>
        )}
      </button>
      {isOutputVisible && (
        <div className={styles['output-result-content']}>
          {displayData.dataType === "object" && !Array.isArray(displayData.dataValue) ? (
            Object.entries(displayData.dataValue)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([key, value]) => {
                const isComplexObject = typeof value === "object" && value !== null;
                let isJsonValue = isComplexObject;
                if (typeof value === "string") {
                  const trimmedString = value.trim();
                  isJsonValue =
                    (trimmedString.startsWith("{") && trimmedString.endsWith("}")) ||
                    (trimmedString.startsWith("[") && trimmedString.endsWith("]"));
                }

                return (
                  <div
                    key={key}
                    className={`${isJsonValue ? styles['output-arg-layout-row-complex'] : styles['output-arg-layout-row']}`}
                  >
                    <span className={styles['output-arg-key']}>{key}</span>
                    <div className={styles['output-arg-value-wrapper']}>
                      <ArgValueViewerComponent valueToRender={value} />
                    </div>
                  </div>
                );
              })
          ) : (
            <div className={styles['output-arg-layout-row-single']}>
              <ArgValueViewerComponent valueToRender={result} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
