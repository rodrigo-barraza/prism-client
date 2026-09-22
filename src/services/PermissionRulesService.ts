import { HTTP_METHODS } from "@/constants";
import PrismService from "./PrismService";
import type {
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

  static suggestions(): Promise<PermissionRuleSuggestion[]> {
    return PrismService._request<PermissionRuleSuggestion[]>("/permissions/rules/suggestions", {
      method: HTTP_METHODS.GET,
    });
  }
}
