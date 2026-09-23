/**
 * Permission rules — mirrors prism-service `src/services/permissions/types.ts`
 * and the `/permissions` routes.
 *
 * A rule is one line of text plus a decision and a scope:
 *   execute_shell(git *)        a tool, with a glob over its command/path/URL
 *   read_file(path=src/**)      one named argument
 *   execute_shell(/git (status|log)/)   an anchored regex
 *   capability:network          every tool that declares the capability
 */

export const PERMISSION_DECISIONS = ["allow", "ask", "deny"] as const;
export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];

export const PERMISSION_SCOPES = ["conversation", "project", "profile"] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export type PermissionRuleOrigin = "user" | "approval" | "suggestion";

export interface PermissionRule {
  id: string;
  username?: string;
  profileId?: string;
  project?: string;
  agent: string | null;
  conversationId: string | null;
  scope: PermissionScope;
  rule: string;
  decision: PermissionDecision;
  origin: PermissionRuleOrigin;
  description?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Set by the server when the stored text no longer parses (it fails closed). */
  invalid?: boolean;
  error?: string;
}

export interface PermissionRuleInput {
  rule: string;
  decision: PermissionDecision;
  scope: PermissionScope;
  conversationId?: string | null;
  agent?: string | null;
  description?: string;
  enabled?: boolean;
  origin?: PermissionRuleOrigin;
}

export interface PermissionTestRequest {
  toolName: string;
  args: Record<string, unknown>;
  conversationId?: string | null;
  agent?: string | null;
  workspaceRoot?: string | null;
  /** Judge the call in this mode (default: `default`). */
  permissionMode?: PermissionMode;
  draft?: { rule: string; decision: PermissionDecision };
}

/** "Would this call be allowed?" — the server's explanation. */
export interface PermissionTestResult {
  decision: PermissionDecision;
  /** Which layer decided: self_protection · rules · agent_policy · hook · mode · protected_path · tier · full_auto. */
  layer: string;
  /** The permission mode the call was judged in. */
  mode?: PermissionMode;
  rule?: string;
  ruleScope?: PermissionScope;
  reason: string;
  tier: number;
  tierLabel: string;
  capabilities: string[];
  matchedRules: Array<{ id: string; rule: string; decision: PermissionDecision; scope: PermissionScope }>;
}

export interface PermissionRuleProposal {
  rule: string;
  /** Whether the proposed rule covers this exact call (a compound command may not). */
  coversCall: boolean;
  capabilities: string[];
}

export interface PermissionRuleSuggestion {
  rule: string;
  toolName: string;
  count: number;
  lastApprovedAt: string;
}

// ── Permission modes ───────────────────────────────────────────────
// Mirrors prism-service `src/services/permissions/PermissionModes.ts`.

export const PERMISSION_MODES = ["default", "plan", "acceptEdits", "auto", "dontAsk", "bypass"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && (PERMISSION_MODES as readonly string[]).includes(value);
}

/** One mode as `GET /permissions/mode` describes it, for this user. */
export interface PermissionModeInfo {
  id: PermissionMode;
  label: string;
  description: string;
  /** False when this user cannot pick it (bypass without the owner flag). */
  available: boolean;
  unavailableReason?: string;
  note?: string;
}

/** `GET /permissions/mode` */
export interface PermissionModeState {
  conversationId: string | null;
  mode: PermissionMode;
  /** running (a turn is in it) · conversation (stored) · default (settings). */
  source: "running" | "conversation" | "default";
  defaultMode: PermissionMode;
  bypassAllowed: boolean;
  modes: PermissionModeInfo[];
}
