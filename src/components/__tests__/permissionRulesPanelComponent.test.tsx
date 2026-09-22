import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import PermissionRulesPanel, { validateDraft } from "../PermissionRulesPanelComponent";
import PermissionRulesService from "../../services/PermissionRulesService";
import type { PermissionRule } from "../../types/permissions";

vi.mock("../PermissionRulesPanelComponent.module.css", () => ({
  default: new Proxy({}, { get: (_target, property: string) => property }),
}));

vi.mock("@rodrigo-barraza/components-library", () => ({
  ButtonComponent: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  ToggleComponent: ({ checked, onChange }: any) => (
    <input type="checkbox" data-testid="mock-toggle" checked={Boolean(checked)} onChange={(event) => onChange?.(event.target.checked)} />
  ),
  InputComponent: ({ value, onChange, placeholder, type }: any) => (
    <input data-testid="mock-input" type={type} value={value ?? ""} placeholder={placeholder} onChange={onChange} />
  ),
  TextAreaComponent: ({ value, onChange }: any) => <textarea data-testid="mock-textarea" value={value ?? ""} onChange={onChange} />,
  SearchInputComponent: ({ value, onChange, placeholder }: any) => (
    <input data-testid="search-input" value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />
  ),
  SegmentedControlComponent: ({ value, onChange, segments }: any) => (
    <div data-testid="segmented-control">
      {(segments ?? []).map((segment: { value: string; label: string }) => (
        <button key={segment.value} data-testid={`segment-${segment.value}`} data-active={value === segment.value} onClick={() => onChange?.(segment.value)}>
          {segment.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../services/PermissionRulesService", () => ({
  default: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    test: vi.fn(),
    propose: vi.fn(),
    suggestions: vi.fn(),
  },
}));

const RULES: PermissionRule[] = [
  {
    id: "r1",
    rule: "execute_shell(rm *)",
    decision: "deny",
    scope: "profile",
    project: "prism-client",
    agent: null,
    conversationId: null,
    origin: "user",
    enabled: true,
    description: "never delete",
  },
  {
    id: "r2",
    rule: "write_file(src/**)",
    decision: "allow",
    scope: "conversation",
    project: "prism-client",
    agent: "CODING",
    conversationId: "0c9d6f3a-1111-2222-3333-444455556666",
    origin: "approval",
    enabled: false,
  },
  {
    id: "r3",
    rule: "execute_shell(/(/)",
    decision: "deny",
    scope: "project",
    project: "prism-client",
    agent: null,
    conversationId: null,
    origin: "user",
    enabled: true,
    invalid: true,
    error: "Invalid regular expression /(/: Unterminated group",
  },
];

/** Labels have no htmlFor — reach the control through its group. */
function inputForLabel(labelText: string): HTMLInputElement {
  const group = screen.getByText(labelText).parentElement as HTMLElement;
  return group.querySelector("input, textarea") as HTMLInputElement;
}

async function renderPanel() {
  render(<PermissionRulesPanel />);
  await waitFor(() => expect(PermissionRulesService.list).toHaveBeenCalled());
}

describe("PermissionRulesPanel", () => {
  beforeEach(() => {
    vi.mocked(PermissionRulesService.list).mockReset().mockResolvedValue(RULES);
    vi.mocked(PermissionRulesService.suggestions).mockReset().mockResolvedValue([]);
    vi.mocked(PermissionRulesService.create).mockReset();
    vi.mocked(PermissionRulesService.update).mockReset();
    vi.mocked(PermissionRulesService.remove).mockReset();
    vi.mocked(PermissionRulesService.test).mockReset();
  });

  describe("list", () => {
    it("renders each rule with its decision, scope, origin and agent", async () => {
      await renderPanel();
      const rows = await screen.findAllByTestId("permission-rule-row");
      expect(rows).toHaveLength(3);

      const deny = within(rows[0]);
      expect(deny.getByText("execute_shell(rm *)")).toBeInTheDocument();
      expect(deny.getByText("Deny")).toBeInTheDocument();
      expect(deny.getByText("every project")).toBeInTheDocument();
      expect(deny.getByText("added here")).toBeInTheDocument();
      expect(deny.getByText("never delete")).toBeInTheDocument();

      const allow = within(rows[1]);
      expect(allow.getByText("Allow")).toBeInTheDocument();
      expect(allow.getByText("conversation 0c9d6f3a…")).toBeInTheDocument();
      expect(allow.getByText("CODING")).toBeInTheDocument();
      expect(allow.getByText("from an approval")).toBeInTheDocument();
      expect(rows[1].className).toContain("rule-row-disabled");
    });

    it("flags a rule the server can no longer parse", async () => {
      await renderPanel();
      const rows = await screen.findAllByTestId("permission-rule-row");
      const badge = within(rows[2]).getByText(/invalid — fails closed/);
      expect(badge.getAttribute("title")).toMatch(/Unterminated group/);
    });

    it("filters by search", async () => {
      await renderPanel();
      await screen.findAllByTestId("permission-rule-row");
      fireEvent.change(screen.getByTestId("search-input"), { target: { value: "write_file" } });
      expect(screen.getAllByTestId("permission-rule-row")).toHaveLength(1);
    });

    it("toggles a rule on and off", async () => {
      vi.mocked(PermissionRulesService.update).mockResolvedValue({ ...RULES[1], enabled: true });
      await renderPanel();
      const rows = await screen.findAllByTestId("permission-rule-row");
      fireEvent.click(within(rows[1]).getByTestId("mock-toggle"));
      await waitFor(() => expect(PermissionRulesService.update).toHaveBeenCalledWith("r2", { enabled: true }));
    });

    it("deletes only after confirming", async () => {
      vi.mocked(PermissionRulesService.remove).mockResolvedValue({ success: true });
      await renderPanel();
      const rows = await screen.findAllByTestId("permission-rule-row");
      fireEvent.click(within(rows[0]).getByTitle("Delete rule"));
      expect(PermissionRulesService.remove).not.toHaveBeenCalled();
      fireEvent.click(within(rows[0]).getByText("Delete"));
      await waitFor(() => expect(PermissionRulesService.remove).toHaveBeenCalledWith("r1"));
    });

    it("offers suggestions from approval history", async () => {
      vi.mocked(PermissionRulesService.suggestions).mockResolvedValue([
        { rule: "read_file(src/**)", toolName: "read_file", count: 5, lastApprovedAt: "2026-09-22T00:00:00Z" },
      ]);
      vi.mocked(PermissionRulesService.create).mockResolvedValue(RULES[0]);
      await renderPanel();
      const suggestions = await screen.findByTestId("permission-suggestions");
      expect(within(suggestions).getByText("allowed 5×")).toBeInTheDocument();
      fireEvent.click(within(suggestions).getByText("Allow in project"));
      await waitFor(() =>
        expect(PermissionRulesService.create).toHaveBeenCalledWith({
          rule: "read_file(src/**)",
          decision: "allow",
          scope: "project",
          origin: "suggestion",
        }),
      );
    });
  });

  describe("form", () => {
    it("validates before saving: empty rule, missing conversation, missing parenthesis", () => {
      const base = { id: null, rule: "", decision: "allow" as const, scope: "project" as const, conversationId: "", agent: "", description: "", enabled: true };
      expect(validateDraft(base)).toMatch(/Write a rule/);
      expect(validateDraft({ ...base, rule: "read_file", scope: "conversation" })).toMatch(/conversation's id/);
      expect(validateDraft({ ...base, rule: "read_file(src/**" })).toMatch(/Missing "\)"/);
      expect(validateDraft({ ...base, rule: "read_file(src/**)" })).toBeNull();
    });

    it("shows the validation error and does not call the server", async () => {
      await renderPanel();
      fireEvent.click(screen.getByText("Add rule"));
      fireEvent.click(screen.getByText("Create rule"));
      expect(screen.getByRole("alert").textContent).toMatch(/Write a rule/);
      expect(PermissionRulesService.create).not.toHaveBeenCalled();
    });

    it("creates a rule with the chosen decision and scope", async () => {
      vi.mocked(PermissionRulesService.create).mockResolvedValue(RULES[0]);
      await renderPanel();
      fireEvent.click(screen.getByText("Add rule"));
      fireEvent.change(inputForLabel("Rule"), { target: { value: "capability:network" } });
      fireEvent.click(screen.getByTestId("segment-deny"));
      fireEvent.click(screen.getByTestId("segment-conversation"));
      fireEvent.change(inputForLabel("Conversation id"), { target: { value: "conv-9" } });
      fireEvent.click(screen.getByText("Create rule"));
      await waitFor(() =>
        expect(PermissionRulesService.create).toHaveBeenCalledWith({
          rule: "capability:network",
          decision: "deny",
          scope: "conversation",
          conversationId: "conv-9",
          agent: null,
          description: "",
          enabled: true,
          origin: "user",
        }),
      );
    });

    it("shows the server's validation error inline", async () => {
      vi.mocked(PermissionRulesService.create).mockRejectedValue(new Error("rule: Unknown capability \"telepathy\"."));
      await renderPanel();
      fireEvent.click(screen.getByText("Add rule"));
      fireEvent.change(inputForLabel("Rule"), { target: { value: "capability:telepathy" } });
      fireEvent.click(screen.getByText("Create rule"));
      expect(await screen.findByRole("alert")).toHaveTextContent(/Unknown capability/);
    });

    it("edits an existing rule", async () => {
      vi.mocked(PermissionRulesService.update).mockResolvedValue(RULES[0]);
      await renderPanel();
      const rows = await screen.findAllByTestId("permission-rule-row");
      fireEvent.click(within(rows[0]).getByTitle("Edit rule"));
      expect(inputForLabel("Rule").value).toBe("execute_shell(rm *)");
      fireEvent.click(screen.getByTestId("segment-ask"));
      fireEvent.click(screen.getByText("Save changes"));
      await waitFor(() =>
        expect(PermissionRulesService.update).toHaveBeenCalledWith("r1", expect.objectContaining({ rule: "execute_shell(rm *)", decision: "ask" })),
      );
    });
  });

  describe("test a call", () => {
    it("asks the server and shows the deciding layer, rule and every match", async () => {
      vi.mocked(PermissionRulesService.test).mockResolvedValue({
        decision: "deny",
        layer: "rules",
        rule: "execute_shell(rm *)",
        ruleScope: "profile",
        reason: "Denied by permission rule `execute_shell(rm *)` (profile scope)",
        tier: 3,
        tierLabel: "danger",
        capabilities: ["shell", "fs_write", "network"],
        matchedRules: [
          { id: "r1", rule: "execute_shell(rm *)", decision: "deny", scope: "profile" },
          { id: "r9", rule: "capability:shell", decision: "ask", scope: "project" },
        ],
      });
      await renderPanel();
      const box = screen.getByTestId("permission-test-box");
      fireEvent.change(within(box).getAllByTestId("mock-textarea")[0], { target: { value: '{"command":"rm -rf build"}' } });
      fireEvent.click(within(box).getByText("Test"));

      await waitFor(() =>
        expect(PermissionRulesService.test).toHaveBeenCalledWith({ toolName: "execute_shell", args: { command: "rm -rf build" }, conversationId: null }),
      );
      const result = await screen.findByTestId("permission-test-result");
      expect(result).toHaveTextContent("Deny");
      expect(result).toHaveTextContent("by permission rule");
      expect(result).toHaveTextContent("capability:shell");
    });

    it("refuses arguments that aren't a JSON object", async () => {
      await renderPanel();
      const box = screen.getByTestId("permission-test-box");
      fireEvent.change(within(box).getAllByTestId("mock-textarea")[0], { target: { value: "[1,2" } });
      expect(within(box).getByText(/Invalid JSON/)).toBeInTheDocument();
      expect(within(box).getByText("Test").closest("button")).toBeDisabled();
    });

    it("includes the rule being edited as a draft", async () => {
      vi.mocked(PermissionRulesService.test).mockResolvedValue({
        decision: "allow", layer: "rules", reason: "ok", tier: 3, tierLabel: "danger", capabilities: [], matchedRules: [],
      });
      await renderPanel();
      fireEvent.click(screen.getByText("Add rule"));
      fireEvent.change(inputForLabel("Rule"), { target: { value: "execute_shell(git *)" } });
      fireEvent.click(within(screen.getByTestId("permission-test-box")).getByText("Test"));
      await waitFor(() =>
        expect(PermissionRulesService.test).toHaveBeenCalledWith(
          expect.objectContaining({ draft: { rule: "execute_shell(git *)", decision: "allow" } }),
        ),
      );
    });
  });
});
