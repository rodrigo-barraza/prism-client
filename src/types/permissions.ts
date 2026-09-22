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
  draft?: { rule: string; decision: PermissionDecision };
}

/** "Would this call be allowed?" — the server's explanation. */
export interface PermissionTestResult {
  decision: PermissionDecision;
  /** Which layer decided: self_protection · rules · agent_policy · hook · tier · full_auto. */
  layer: string;
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
