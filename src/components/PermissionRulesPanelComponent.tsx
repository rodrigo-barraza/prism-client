"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  AlertTriangle,
  Play,
  Sparkles,
} from "lucide-react";
import {
  ButtonComponent,
  ToggleComponent,
  InputComponent,
  TextAreaComponent,
  SearchInputComponent,
  SegmentedControlComponent,
} from "@rodrigo-barraza/components-library";
import PermissionRulesService from "../services/PermissionRulesService";
import { getErrorMessage } from "../utils/errorMessage";
import {
  PERMISSION_DECISIONS,
  PERMISSION_SCOPES,
  type PermissionDecision,
  type PermissionRule,
  type PermissionRuleInput,
  type PermissionRuleSuggestion,
  type PermissionScope,
  type PermissionTestResult,
} from "../types/permissions";
import styles from "./PermissionRulesPanelComponent.module.css";

const DECISION_LABELS: Record<PermissionDecision, string> = {
  allow: "Allow",
  ask: "Ask",
  deny: "Deny",
};

const DECISION_ICONS: Record<PermissionDecision, typeof ShieldCheck> = {
  allow: ShieldCheck,
  ask: ShieldQuestion,
  deny: ShieldX,
};

const SCOPE_LABELS: Record<PermissionScope, string> = {
  conversation: "This conversation",
  project: "Project",
  profile: "Profile",
};

const ORIGIN_LABELS: Record<PermissionRule["origin"], string> = {
  user: "added here",
  approval: "from an approval",
  suggestion: "from a suggestion",
};

const LAYER_LABELS: Record<string, string> = {
  self_protection: "self-protection",
  rules: "permission rule",
  agent_policy: "agent policy",
  hook: "configured hook",
  tier: "default tier",
  full_auto: "auto-approve",
};

interface RuleDraft {
  id: string | null;
  rule: string;
  decision: PermissionDecision;
  scope: PermissionScope;
  conversationId: string;
  agent: string;
  description: string;
  enabled: boolean;
}

const EMPTY_DRAFT: RuleDraft = {
  id: null,
  rule: "",
  decision: "allow",
  scope: "project",
  conversationId: "",
  agent: "",
  description: "",
  enabled: true,
};

function draftFrom(rule: PermissionRule): RuleDraft {
  return {
    id: rule.id,
    rule: rule.rule,
    decision: rule.decision,
    scope: rule.scope,
    conversationId: rule.conversationId ?? "",
    agent: rule.agent ?? "",
    description: rule.description ?? "",
    enabled: rule.enabled,
  };
}

/** Client-side check; the server's zod schema (and rule parser) is authoritative. */
export function validateDraft(draft: RuleDraft): string | null {
  if (!draft.rule.trim()) return "Write a rule, e.g. execute_shell(git *) or capability:network.";
  if (draft.scope === "conversation" && !draft.conversationId.trim()) {
    return "A conversation-scoped rule needs the conversation's id.";
  }
  const openIndex = draft.rule.indexOf("(");
  if (openIndex !== -1 && !draft.rule.trim().endsWith(")")) return 'Missing ")" at the end of the rule.';
  return null;
}

function describeScope(rule: PermissionRule): string {
  if (rule.scope === "conversation") return `conversation ${String(rule.conversationId ?? "").slice(0, 8)}…`;
  if (rule.scope === "project") return `project ${rule.project ?? ""}`.trim();
  return "every project";
}

/**
 * PermissionRulesPanel — the user's permission rules.
 *
 * Deny beats ask beats allow, across every scope — a profile-wide deny is
 * never undone by a conversation allow. A rule whose pattern the server can
 * no longer parse is flagged and fails closed (an allow allows nothing; an
 * ask or deny covers every call of its tool).
 */
export default function PermissionRulesPanel() {
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [suggestions, setSuggestions] = useState<PermissionRuleSuggestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const [testToolName, setTestToolName] = useState("execute_shell");
  const [testArgsText, setTestArgsText] = useState('{\n  "command": "git status"\n}');
  const [testConversationId, setTestConversationId] = useState("");
  const [testResult, setTestResult] = useState<PermissionTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedRules, loadedSuggestions] = await Promise.all([
        PermissionRulesService.list(),
        PermissionRulesService.suggestions().catch(() => []),
      ]);
      setRules(loadedRules || []);
      setSuggestions(loadedSuggestions || []);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filteredRules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rules;
    return rules.filter((rule) =>
      [rule.rule, rule.decision, rule.scope, rule.description ?? "", rule.agent ?? ""]
        .some((field) => field.toLowerCase().includes(query)),
    );
  }, [rules, searchQuery]);

  const testArgsError = useMemo(() => {
    try {
      const parsed = JSON.parse(testArgsText || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? null : "Arguments must be a JSON object.";
    } catch (error: unknown) {
      return getErrorMessage(error);
    }
  }, [testArgsText]);

  const updateDraft = (changes: Partial<RuleDraft>) => {
    setDraft((previous) => (previous ? { ...previous, ...changes } : previous));
    setFormError(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    const problem = validateDraft(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    const input: PermissionRuleInput = {
      rule: draft.rule.trim(),
      decision: draft.decision,
      scope: draft.scope,
      conversationId: draft.scope === "conversation" ? draft.conversationId.trim() : null,
      agent: draft.agent.trim() || null,
      description: draft.description,
      enabled: draft.enabled,
    };
    setSaving(true);
    try {
      if (draft.id) await PermissionRulesService.update(draft.id, input);
      else await PermissionRulesService.create({ ...input, origin: "user" });
      setDraft(null);
      await load();
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: PermissionRule, enabled: boolean) => {
    setRules((previous) => previous.map((candidate) => (candidate.id === rule.id ? { ...candidate, enabled } : candidate)));
    try {
      await PermissionRulesService.update(rule.id, { enabled });
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
      await load();
    }
  };

  const confirmDelete = async (id: string) => {
    setConfirmingDeleteId(null);
    try {
      await PermissionRulesService.remove(id);
      await load();
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
    }
  };

  const adoptSuggestion = async (suggestion: PermissionRuleSuggestion, scope: PermissionScope) => {
    try {
      await PermissionRulesService.create({ rule: suggestion.rule, decision: "allow", scope, origin: "suggestion" });
      await load();
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error));
    }
  };

  const handleTest = async () => {
    if (testArgsError || !testToolName.trim()) return;
    setTesting(true);
    setTestError(null);
    try {
      const includeDraft = draft && !validateDraft(draft);
      const result = await PermissionRulesService.test({
        toolName: testToolName.trim(),
        args: JSON.parse(testArgsText || "{}"),
        conversationId: testConversationId.trim() || null,
        ...(includeDraft && draft ? { draft: { rule: draft.rule.trim(), decision: draft.decision } } : {}),
      });
      setTestResult(result);
    } catch (error: unknown) {
      setTestResult(null);
      setTestError(getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  // ── Test box (shown under the list and under the form) ───────────

  const testBox = (
    <div className={styles["test-box"]} data-testid="permission-test-box">
      <div className={styles["test-box-title"]}>
        <Play size={11} />
        Would this call be allowed?
        {draft && !validateDraft(draft) && (
          <span className={styles["hint"]}>— including the rule you are editing</span>
        )}
      </div>
      <div className={styles["field-grid"]}>
        <div className={styles["form-group"]}>
          <label>Tool</label>
          <InputComponent
            type="text"
            value={testToolName}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTestToolName(event.target.value)}
            placeholder="execute_shell"
          />
        </div>
        <div className={styles["form-group"]}>
          <label>Conversation (optional)</label>
          <InputComponent
            type="text"
            value={testConversationId}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTestConversationId(event.target.value)}
            placeholder="for conversation-scoped rules"
          />
        </div>
      </div>
      <div className={styles["form-group"]}>
        <label>Arguments (JSON)</label>
        <TextAreaComponent
          className={styles["code-textarea"]}
          value={testArgsText}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setTestArgsText(event.target.value)}
          minRows={3}
          autoResize={false}
        />
        {testArgsError && <span className={styles["field-error"]}>Invalid JSON — {testArgsError}</span>}
      </div>
      <div className={styles["test-actions"]}>
        <button
          className={styles["test-button"]}
          onClick={handleTest}
          disabled={testing || Boolean(testArgsError) || !testToolName.trim()}
        >
          <Play size={11} />
          {testing ? "Testing…" : "Test"}
        </button>
      </div>
      {testError && <div className={styles["field-error"]}>{testError}</div>}
      {testResult && (
        <div className={`${styles["test-result"]} ${styles[`test-result-${testResult.decision}`]}`} data-testid="permission-test-result">
          <div className={styles["test-result-header"]}>
            <span className={`${styles["decision-badge"]} ${styles[`decision-${testResult.decision}`]}`}>
              {DECISION_LABELS[testResult.decision]}
            </span>
            <span className={styles["test-result-layer"]}>
              by {LAYER_LABELS[testResult.layer] ?? testResult.layer}
              {testResult.rule ? <> · <code>{testResult.rule}</code></> : null}
            </span>
          </div>
          <div className={styles["test-result-reason"]}>{testResult.reason}</div>
          <div className={styles["test-result-meta"]}>
            tier {testResult.tierLabel}
            {testResult.capabilities.length > 0 && <> · {testResult.capabilities.join(", ")}</>}
          </div>
          {testResult.matchedRules.length > 1 && (
            <ul className={styles["test-result-matches"]}>
              {testResult.matchedRules.map((match) => (
                <li key={match.id}>
                  {DECISION_LABELS[match.decision]} <code>{match.rule}</code> ({match.scope})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  // ── Form view ────────────────────────────────────────────────────

  if (draft) {
    return (
      <div className={`permission-rules-panel-component ${styles["container"]}`}>
        <div className={styles["form-header"]}>
          <h3>{draft.id ? "Edit rule" : "New rule"}</h3>
          <button className={styles["cancel-button"]} onClick={() => setDraft(null)} title="Cancel">
            <X size={14} />
          </button>
        </div>
        <div className={styles["form"]}>
          <div className={styles["form-group"]}>
            <label>Rule</label>
            <InputComponent
              type="text"
              className={styles["rule-input"]}
              value={draft.rule}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft({ rule: event.target.value })}
              placeholder="execute_shell(git *)"
            />
            <span className={styles["hint"]}>
              <code>tool</code>, <code>tool(glob)</code>, <code>tool(arg=glob)</code>, <code>tool(/regex/)</code> (anchored) or{" "}
              <code>capability:network</code>. <code>*</code> stays in one folder, <code>**</code> crosses them;{" "}
              <code>npm run test:*</code> is a prefix.
            </span>
          </div>

          <div className={styles["form-group"]}>
            <label>Decision</label>
            <SegmentedControlComponent
              value={draft.decision}
              onChange={(value: string) => updateDraft({ decision: value as PermissionDecision })}
              fullWidth
              compact
              segments={PERMISSION_DECISIONS.map((decision) => {
                const DecisionIcon = DECISION_ICONS[decision];
                return { value: decision, label: DECISION_LABELS[decision], icon: <DecisionIcon size={13} /> };
              })}
            />
          </div>

          <div className={styles["form-group"]}>
            <label>Scope</label>
            <SegmentedControlComponent
              value={draft.scope}
              onChange={(value: string) => updateDraft({ scope: value as PermissionScope })}
              fullWidth
              compact
              segments={PERMISSION_SCOPES.map((scope) => ({ value: scope, label: SCOPE_LABELS[scope] }))}
            />
          </div>

          {draft.scope === "conversation" && (
            <div className={styles["form-group"]}>
              <label>Conversation id</label>
              <InputComponent
                type="text"
                value={draft.conversationId}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft({ conversationId: event.target.value })}
                placeholder="the conversation this rule is for"
              />
            </div>
          )}

          <div className={styles["field-grid"]}>
            <div className={styles["form-group"]}>
              <label>Agent</label>
              <InputComponent
                type="text"
                value={draft.agent}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft({ agent: event.target.value })}
                placeholder="all agents"
              />
            </div>
            <div className={styles["form-group"]}>
              <label>Enabled</label>
              <div className={styles["toggle-field"]}>
                <ToggleComponent checked={draft.enabled} onChange={(checked: boolean) => updateDraft({ enabled: checked })} size="mini" />
              </div>
            </div>
          </div>

          <div className={styles["form-group"]}>
            <label>Note</label>
            <InputComponent
              type="text"
              value={draft.description}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft({ description: event.target.value })}
              placeholder="why this rule exists (optional)"
            />
          </div>

          {formError && <div className={styles["field-error"]} role="alert">{formError}</div>}

          {testBox}

          <div className={styles["form-actions"]}>
            <button className={styles["save-button"]} onClick={handleSave} disabled={saving}>
              <Save size={14} />
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create rule"}
            </button>
            <button className={styles["cancel-form-button"]} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────

  return (
    <div className={`permission-rules-panel-component ${styles["container"]}`}>
      <div className={styles["toolbar"]}>
        {rules.length > 0 && (
          <SearchInputComponent value={searchQuery} onChange={setSearchQuery} placeholder="Search rules…" compact />
        )}
        <ButtonComponent variant="disabled" icon={Plus} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          Add rule
        </ButtonComponent>
      </div>

      {loadError && <div className={styles["field-error"]} role="alert">{loadError}</div>}

      {rules.length === 0 && !loadError && (
        <div className={styles["empty-state"]}>
          <div className={styles["empty-icon"]}>
            <ShieldCheck size={24} />
          </div>
          <div className={styles["empty-title"]}>No permission rules yet</div>
          <div className={styles["empty-subtitle"]}>
            Tools ask by their tier until a rule says otherwise. Add one here, or choose <strong>Always allow</strong> on
            an approval card.
          </div>
        </div>
      )}

      {filteredRules.length > 0 && (
        <div className={styles["list"]} data-testid="permission-rule-list">
          {filteredRules.map((rule) => {
            const DecisionIcon = DECISION_ICONS[rule.decision];
            return (
              <div
                key={rule.id}
                data-testid="permission-rule-row"
                className={`${styles["rule-row"]} ${!rule.enabled ? styles["rule-row-disabled"] : ""}`}
              >
                <div className={`${styles["rule-leading-icon"]} ${styles[`decision-${rule.decision}`]}`}>
                  <DecisionIcon size={13} />
                </div>
                <div className={styles["rule-body"]}>
                  <div className={styles["rule-title-line"]}>
                    <code className={styles["rule-text"]}>{rule.rule}</code>
                    <ToggleComponent checked={rule.enabled} onChange={(checked: boolean) => handleToggle(rule, checked)} size="mini" />
                    <div className={styles["rule-actions"]}>
                      <button className={styles["rule-action-button"]} onClick={() => setDraft(draftFrom(rule))} title="Edit rule">
                        <Edit3 size={12} />
                      </button>
                      <button
                        className={`${styles["rule-action-button"]} ${styles["rule-delete-button"]}`}
                        onClick={() => setConfirmingDeleteId(rule.id)}
                        title="Delete rule"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className={styles["rule-meta"]}>
                    <span className={`${styles["decision-badge"]} ${styles[`decision-${rule.decision}`]}`}>
                      {DECISION_LABELS[rule.decision]}
                    </span>
                    <span className={styles["chip"]}>{describeScope(rule)}</span>
                    {rule.agent && <span className={styles["chip"]}>{rule.agent}</span>}
                    <span className={styles["origin-chip"]}>{ORIGIN_LABELS[rule.origin] ?? rule.origin}</span>
                    {rule.invalid && (
                      <span className={styles["invalid-chip"]} title={rule.error}>
                        <AlertTriangle size={10} />
                        invalid — fails closed
                      </span>
                    )}
                  </div>
                  {rule.description && <div className={styles["rule-description"]}>{rule.description}</div>}
                  {confirmingDeleteId === rule.id && (
                    <div className={styles["confirm-layout-row"]}>
                      <span className={styles["confirm-label"]}>Delete this rule?</span>
                      <button className={`${styles["confirm-button"]} ${styles["confirm-button-yes"]}`} onClick={() => confirmDelete(rule.id)}>
                        Delete
                      </button>
                      <button className={`${styles["confirm-button"]} ${styles["confirm-button-no"]}`} onClick={() => setConfirmingDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className={styles["suggestions"]} data-testid="permission-suggestions">
          <div className={styles["test-box-title"]}>
            <Sparkles size={11} />
            Suggested from your approvals
          </div>
          {suggestions.map((suggestion) => (
            <div key={suggestion.rule} className={styles["suggestion-row"]}>
              <code className={styles["rule-text"]}>{suggestion.rule}</code>
              <span className={styles["hint"]}>allowed {suggestion.count}×</span>
              <button className={styles["suggestion-button"]} onClick={() => adoptSuggestion(suggestion, "project")}>
                Allow in project
              </button>
              <button className={styles["suggestion-button"]} onClick={() => adoptSuggestion(suggestion, "profile")}>
                Allow everywhere
              </button>
            </div>
          ))}
        </div>
      )}

      {testBox}
    </div>
  );
}
