/**
 * Side-channel events of a turn that have no message of their own:
 * `todo_update` (write_todo), `brief_update` (summarize_conversation),
 * and the provider-native `webSearchResult` / `executableCode` /
 * `codeExecutionResult` chunks. None of them are persisted on messages, so
 * the chat keeps them here, per conversation, and renders them in
 * TurnActivityPanelComponent.
 */
import type { SSEData, WebSearchResult } from "../types/types";

export interface TodoItem {
  content: string;
  status: string;
  priority?: string;
}

export interface TurnBrief {
  summary: string;
  keyFiles: string[];
  openQuestions: string[];
  timestamp?: string;
}

export interface CodeRun {
  code: string;
  language: string;
  output?: string;
  outcome?: string;
}

export interface TurnActivity {
  /** The agent's checklist — replaced whole by every write_todo call. */
  todos: TodoItem[] | null;
  brief: TurnBrief | null;
  /** This turn's web search sources, de-duplicated by URL. */
  sources: WebSearchResult[];
  /** This turn's provider code executions, in order. */
  codeRuns: CodeRun[];
}

export const EMPTY_TURN_ACTIVITY: TurnActivity = {
  todos: null,
  brief: null,
  sources: [],
  codeRuns: [],
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** A new turn: its sources and code runs start empty; the checklist and brief carry over. */
export function startTurn(activity: TurnActivity): TurnActivity {
  return { ...activity, sources: [], codeRuns: [] };
}

export function applyTodoUpdate(activity: TurnActivity, event: SSEData): TurnActivity {
  if (!Array.isArray(event.items)) return activity;
  const todos = (event.items as Array<Record<string, unknown>>)
    .filter((item) => item && typeof item.content === "string")
    .map((item) => ({
      content: item.content as string,
      status: typeof item.status === "string" ? item.status : "pending",
      ...(typeof item.priority === "string" ? { priority: item.priority } : {}),
    }));
  return { ...activity, todos };
}

export function applyBriefUpdate(activity: TurnActivity, event: SSEData): TurnActivity {
  const brief = event.brief as Record<string, unknown> | undefined;
  if (!brief || typeof brief.summary !== "string") return activity;
  return {
    ...activity,
    brief: {
      summary: brief.summary,
      keyFiles: stringList(brief.keyFiles),
      openQuestions: stringList(brief.openQuestions),
      ...(typeof brief.timestamp === "string" ? { timestamp: brief.timestamp } : {}),
    },
  };
}

export function applyWebSearchResults(
  activity: TurnActivity,
  results: WebSearchResult[] | undefined,
): TurnActivity {
  if (!Array.isArray(results) || results.length === 0) return activity;
  const seenUrls = new Set(activity.sources.map((source) => source.url));
  const added = results.filter((result) => {
    if (!result?.url || seenUrls.has(result.url)) return false;
    seenUrls.add(result.url);
    return true;
  });
  return added.length > 0 ? { ...activity, sources: [...activity.sources, ...added] } : activity;
}

export function applyExecutableCode(
  activity: TurnActivity,
  code: string | undefined,
  language: string | undefined,
): TurnActivity {
  if (!code) return activity;
  return {
    ...activity,
    codeRuns: [...activity.codeRuns, { code, language: (language || "").toLowerCase() }],
  };
}

/** Output belongs to the latest run still waiting for one. */
export function applyCodeExecutionResult(
  activity: TurnActivity,
  output: string | undefined,
  outcome: string | undefined,
): TurnActivity {
  const runs = [...activity.codeRuns];
  const waitingIndex = runs.map((run) => run.output === undefined).lastIndexOf(true);
  const result = { output: output ?? "", ...(outcome ? { outcome } : {}) };
  if (waitingIndex === -1) {
    runs.push({ code: "", language: "", ...result });
  } else {
    runs[waitingIndex] = { ...runs[waitingIndex], ...result };
  }
  return { ...activity, codeRuns: runs };
}

export function hasTurnActivity(activity: TurnActivity): boolean {
  return (
    (activity.todos?.length ?? 0) > 0 ||
    activity.brief !== null ||
    activity.sources.length > 0 ||
    activity.codeRuns.length > 0
  );
}
