import { HTTP_METHODS } from "@/constants";
import PrismService from "./PrismService";
import type {
  PermissionMode,
  PermissionModeState,
  PermissionRule,
  PermissionRuleInput,
  PermissionRuleProposal,
  PermissionRuleSuggestion,
  PermissionTestRequest,
  PermissionTestResult,
} from "../types/permissions";

/**
 * Client for prism-service `/permissions`. Rides PrismService's request
 * helper, so identity headers (username, project, profile) and error shapes
 * are the same as every other call.
 */
export default class PermissionRulesService {
  static list(filters: { scope?: string; conversationId?: string; agent?: string } = {}): Promise<PermissionRule[]> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    const suffix = query.toString();
    return PrismService._request<PermissionRule[]>(
      `/permissions/rules${suffix ? `?${suffix}` : ""}`,
      { method: HTTP_METHODS.GET },
    );
  }

  static create(input: PermissionRuleInput): Promise<PermissionRule> {
    return PrismService._request<PermissionRule>("/permissions/rules", {
      method: HTTP_METHODS.POST,
      body: input,
    });
  }

  static update(id: string, updates: Partial<PermissionRuleInput>): Promise<PermissionRule> {
    return PrismService._request<PermissionRule>(`/permissions/rules/${encodeURIComponent(id)}`, {
      method: HTTP_METHODS.PUT,
      body: updates,
    });
  }

  static remove(id: string): Promise<{ success: boolean }> {
    return PrismService._request<{ success: boolean }>(`/permissions/rules/${encodeURIComponent(id)}`, {
      method: HTTP_METHODS.DELETE,
    });
  }

  static test(request: PermissionTestRequest): Promise<PermissionTestResult> {
    return PrismService._request<PermissionTestResult>("/permissions/rules/test", {
      method: HTTP_METHODS.POST,
      body: request,
    });
  }

  static propose(call: { toolName: string; args: Record<string, unknown>; workspaceRoot?: string | null }): Promise<PermissionRuleProposal> {
    return PrismService._request<PermissionRuleProposal>("/permissions/rules/propose", {
      method: HTTP_METHODS.POST,
      body: call,
    });
  }

  /**
   * A conversation's mode (or, without one, the default a new conversation
   * starts in) and the modes on offer. `project` is the one the conversation
   * is stored under — an agent's (`prism-chat`, `coding`), which this
   * client's own project header is not; without it an agent conversation's
   * stored mode is never found.
   */
  static getMode(conversationId?: string | null, project?: string | null): Promise<PermissionModeState> {
    const query = new URLSearchParams();
    if (conversationId) query.set("conversationId", conversationId);
    if (conversationId && project) query.set("project", project);
    const suffix = query.toString();
    return PrismService._request<PermissionModeState>(`/permissions/mode${suffix ? `?${suffix}` : ""}`, {
      method: HTTP_METHODS.GET,
    });
  }

  /**
   * Switch a conversation's mode — its running turn too, at the next tool
   * call. `project` as for getMode; it rides the query because the body
   * takes nothing but the conversation and the mode.
   */
  static setMode(
    conversationId: string,
    mode: PermissionMode,
    project?: string | null,
  ): Promise<{ conversationId: string; mode: PermissionMode; stored: boolean; live: boolean }> {
    const suffix = project ? `?project=${encodeURIComponent(project)}` : "";
    return PrismService._request(`/permissions/mode${suffix}`, {
      method: HTTP_METHODS.PUT,
      body: { conversationId, mode },
    });
  }

  /** The mode new conversations start in. Never `bypass`. */
  static setDefaultMode(mode: PermissionMode): Promise<{ defaultMode: PermissionMode }> {
    return PrismService._request("/permissions/mode/default", {
      method: HTTP_METHODS.PUT,
      body: { mode },
    });
  }

  static suggestions(): Promise<PermissionRuleSuggestion[]> {
    return PrismService._request<PermissionRuleSuggestion[]>("/permissions/rules/suggestions", {
      method: HTTP_METHODS.GET,
    });
  }
}
