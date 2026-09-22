/**
 * Rewind and fork (prism-service POST /conversations/:id/rewind and /fork).
 *
 * Kept out of PrismService because a refused rewind (409) is not an error
 * to throw — its body carries the files the user changed, which the rewind
 * dialog shows so the user can decide whether to force it.
 */
import { PRISM_SERVICE_URL } from "@/config";
import { HTTP_METHODS } from "../constants";
import { getBaseHeaders } from "./serviceHeaders";
import type { ForkLineage } from "../types/types";

export type RewindRestore = "conversation" | "code" | "both";

export interface CodeWorkspaceReport {
  workspaceRoot: string;
  ref: string;
  status: "restored" | "would-restore" | "refused" | "failed";
  /** Files written back to their content at the rewind point. */
  restored: string[];
  /** Files created after the rewind point, which the restore deletes. */
  removed: string[];
  /** Files changed after the agent's last write — someone else's edits. */
  conflicts: string[];
  skipped: string[];
  truncated?: boolean;
  undoRef?: string;
  error?: string;
}

export interface RewindReport {
  conversationId: string;
  toMessageId: string;
  restore: RewindRestore;
  dryRun: boolean;
  conversation: {
    prunedCount: number;
    remainingCount: number;
    keptThroughMessageId: string | null;
  } | null;
  code: {
    status: "restored" | "dry-run" | "refused" | "failed" | "nothing-to-restore" | "unavailable";
    reason?: string;
    workspaces: CodeWorkspaceReport[];
  } | null;
}

export interface RewindOutcome {
  /** HTTP status: 200 done, 409 refused (see report.code), 207 partly failed. */
  status: number;
  report: RewindReport | null;
  /** Set when the request failed outright (no report). */
  error?: string;
}

export interface ForkResult {
  id: string;
  type: "direct" | "agent";
  title: string;
  messageCount: number;
  forkedFrom: ForkLineage;
}

function withProject(path: string, project?: string) {
  return project ? `${path}?project=${encodeURIComponent(project)}` : path;
}

async function post(path: string, body: unknown) {
  const response = await fetch(`${PRISM_SERVICE_URL}${path}`, {
    method: HTTP_METHODS.POST,
    headers: getBaseHeaders(),
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function errorText(payload: { error?: unknown }, status: number): string {
  if (typeof payload.error === "string") return payload.error;
  return `Prism API error: ${status}`;
}

export async function rewindConversation(
  conversationId: string,
  options: { toMessageId: string; restore: RewindRestore; force?: boolean; dryRun?: boolean },
  project?: string,
): Promise<RewindOutcome> {
  const { status, payload } = await post(
    withProject(`/conversations/${encodeURIComponent(conversationId)}/rewind`, project),
    options,
  );
  // A report comes back on success and on a refusal (409): both carry `restore`.
  if (payload && typeof payload === "object" && "restore" in payload) {
    return { status, report: payload as RewindReport };
  }
  return { status, report: null, error: errorText(payload, status) };
}

/**
 * Fork a conversation. `at` copies through the message (its tool results
 * included); `before` copies only what precedes it — edit-as-branch.
 */
export async function forkConversation(
  conversationId: string,
  messageId: string,
  { position = "at", project }: { position?: "at" | "before"; project?: string } = {},
): Promise<ForkResult> {
  const { status, payload } = await post(
    withProject(`/conversations/${encodeURIComponent(conversationId)}/fork`, project),
    position === "before" ? { beforeMessageId: messageId } : { atMessageId: messageId },
  );
  if (status !== 201) throw new Error(errorText(payload, status));
  return payload as ForkResult;
}
