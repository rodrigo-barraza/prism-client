import React from "react";
import { Radio, SquareTerminal, StopCircle } from "lucide-react";
import { RendererProps } from "../types";
import { tryParse } from "../utils";
import { StatusBadge, RawResultToggle } from "../SharedComponents";
import { TerminalRenderer } from "./TerminalAndGitRenderers";
import styles from "../ToolResultRenderersComponent.module.css";

// -- Background tasks: execute_command (run_in_background), monitor, task_stop

/** What a started background task's result says: its id, output file and deadline. */
interface BackgroundTaskStart {
  taskId: string | null;
  outputFile: string | null;
  timeoutMs: number | null;
}

/** The result's text: a plain string, or the message an object carries. */
function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  const parsed = tryParse(result) as Record<string, unknown> | null;
  if (!parsed) return "";
  for (const field of ["message", "result", "output", "content"]) {
    if (typeof parsed[field] === "string") return parsed[field] as string;
  }
  return "";
}

const SHELL_START = /Command running in background with ID: ([\w.-]+?)\.?\s+Output is being written to: (\S+)/;
const MONITOR_START = /Monitor started \(task id: ([\w.-]+), timeout (\d+) ms\)/;
const MONITOR_OUTPUT = /stderr goes to (\S+?)\.?(?:\s+Use task_stop|\s*$)/;

/**
 * The task a backgrounded `execute_command` or a `monitor` started, read
 * from its result — the fields of an object result, or Claude's line
 * ("Command running in background with ID: …", "Monitor started (task id: …").
 * Null when the result names no task (still running, or it failed).
 */
export function backgroundTaskStartOf(result: unknown): BackgroundTaskStart | null {
  const parsed = tryParse(result) as Record<string, unknown> | null;
  const text = resultText(result);
  const shellMatch = text.match(SHELL_START);
  const monitorMatch = text.match(MONITOR_START);
  const outputMatch = text.match(MONITOR_OUTPUT);
  const taskId =
    (typeof parsed?.taskId === "string" && parsed.taskId) || shellMatch?.[1] || monitorMatch?.[1] || null;
  if (!taskId) return null;
  const outputFile =
    (typeof parsed?.outputFile === "string" && parsed.outputFile) || shellMatch?.[2] || outputMatch?.[1] || null;
  const timeoutMs =
    typeof parsed?.timeoutMs === "number" ? parsed.timeoutMs : monitorMatch ? Number(monitorMatch[2]) : null;
  return { taskId, outputFile, timeoutMs };
}

/** "5 min", "90 s", "1500 ms" — a monitor's deadline. */
function formatTimeout(milliseconds: number): string {
  if (milliseconds >= 60_000 && milliseconds % 60_000 === 0) return `${milliseconds / 60_000} min`;
  if (milliseconds >= 1_000 && milliseconds % 1_000 === 0) return `${milliseconds / 1_000} s`;
  return `${milliseconds} ms`;
}

/** The error a failed call reports, if it reports one. */
function resultError(result: unknown): string | null {
  const parsed = tryParse(result) as Record<string, unknown> | null;
  if (parsed && typeof parsed.error === "string" && parsed.error) return parsed.error;
  if (parsed && parsed.success === false) {
    return typeof parsed.message === "string" && parsed.message ? parsed.message : "Failed";
  }
  return null;
}

/** The task line a started task shows: its id and where its output goes. */
function TaskStartLine({ start, label }: { start: BackgroundTaskStart; label: string }) {
  return (
    <div className={styles["background-task-line"]}>
      <span>{label}</span>
      {start.taskId && <code className={styles["inline-code"]}>{start.taskId}</code>}
      {start.outputFile && (
        <>
          <span>· output</span>
          <code className={styles["inline-code"]}>{start.outputFile}</code>
        </>
      )}
    </div>
  );
}

/**
 * `execute_command`: a foreground run is a terminal; one run with
 * `run_in_background` returns at once, so it shows the task it started
 * (its id and output file) instead of an empty terminal.
 */
export function ExecuteCommandRenderer(props: RendererProps) {
  const { result, args } = props;
  const start = backgroundTaskStartOf(result);
  const isBackground = args?.run_in_background === true || (tryParse(result) as { backgrounded?: unknown } | null)?.backgrounded === true;
  if (!isBackground && !start) return <TerminalRenderer {...props} />;
  const error = resultError(result);
  const command = typeof args?.command === "string" ? args.command : "";
  const description = typeof args?.description === "string" ? args.description : "";
  return (
    <div className={styles["renderer-block"]}>
      <div className={styles["renderer-header"]}>
        <SquareTerminal size={13} />
        <span className={styles["renderer-title"]}>
          Background command{description && <>: <strong>{description}</strong></>}
        </span>
        {result !== undefined && result !== null && (
          <StatusBadge success={!error} label={error ? "failed" : "started"} />
        )}
      </div>
      {command && (
        <pre className={styles["code-block"]}>
          <code>{command}</code>
        </pre>
      )}
      {typeof args?.cwd === "string" && args.cwd && (
        <div className={styles["background-task-meta"]}>cwd {args.cwd}</div>
      )}
      {start && <TaskStartLine start={start} label="Running in background as" />}
      {!start && !error && (result === undefined || result === null) && (
        <div className={styles["background-task-meta"]}>Starting in the background…</div>
      )}
      {error && <div className={styles["error-text"]}>{error}</div>}
    </div>
  );
}

/** `monitor`: what it watches (a command or a WebSocket), its deadline, and the task it started. */
export function MonitorRenderer({ result, args }: RendererProps) {
  const start = backgroundTaskStartOf(result);
  const error = resultError(result);
  const description = typeof args?.description === "string" ? args.description : "";
  const command = typeof args?.command === "string" ? args.command : "";
  const ws = args?.ws && typeof args.ws === "object" ? (args.ws as { url?: unknown; protocols?: unknown }) : null;
  const wsUrl = typeof ws?.url === "string" ? ws.url : "";
  const protocols = Array.isArray(ws?.protocols) ? (ws.protocols as unknown[]).filter((protocol) => typeof protocol === "string") : [];
  const requestedTimeout = typeof args?.timeout_ms === "number" ? args.timeout_ms : null;
  const timeoutMs = start?.timeoutMs ?? requestedTimeout;
  return (
    <div className={styles["renderer-block"]}>
      <div className={styles["renderer-header"]}>
        <Radio size={13} />
        <span className={styles["renderer-title"]}>
          Monitor{description && <>: <strong>{description}</strong></>}
        </span>
        {result !== undefined && result !== null && (
          <StatusBadge success={!error} label={error ? "failed" : "started"} />
        )}
      </div>
      {command && (
        <pre className={styles["code-block"]}>
          <code>{command}</code>
        </pre>
      )}
      {wsUrl && (
        <div className={styles["background-task-meta"]}>
          WebSocket <code className={styles["inline-code"]}>{wsUrl}</code>
          {protocols.length > 0 && <> · protocols {protocols.join(", ")}</>}
        </div>
      )}
      {timeoutMs !== null && (
        <div className={styles["background-task-meta"]}>
          Expires after {formatTimeout(timeoutMs)}
          {requestedTimeout !== null && start?.timeoutMs != null && start.timeoutMs !== requestedTimeout && (
            <> (asked for {formatTimeout(requestedTimeout)})</>
          )}
        </div>
      )}
      {start && <TaskStartLine start={start} label="Task" />}
      {error && <div className={styles["error-text"]}>{error}</div>}
      {!start && !error && result !== undefined && result !== null && <RawResultToggle result={result} />}
    </div>
  );
}

/** `task_stop`: which task it stopped, and whether it did. */
export function TaskStopRenderer({ result, args }: RendererProps) {
  const taskId =
    (typeof args?.task_id === "string" && args.task_id) || (typeof args?.shell_id === "string" && args.shell_id) || "";
  const isPending = result === undefined || result === null;
  const error = isPending ? null : resultError(result);
  const message = isPending ? "" : resultText(result);
  return (
    <div className={styles["renderer-block"]}>
      <div className={styles["renderer-header"]}>
        <StopCircle size={13} />
        <span className={styles["renderer-title"]}>
          Stop task <code className={styles["inline-code"]}>{taskId || "?"}</code>
        </span>
        {!isPending && <StatusBadge success={!error} label={error ? "not stopped" : "stopped"} />}
      </div>
      {error ? (
        <div className={styles["error-text"]}>{error}</div>
      ) : (
        message && <div className={styles["background-task-meta"]}>{message}</div>
      )}
    </div>
  );
}
