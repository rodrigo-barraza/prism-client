/**
 * Per-call approval cards: one card per tool call, decided on its own.
 *
 * Driven the way AgentChatComponent drives them — `approval_required`
 * events become cards through approvalFromEvent, the list state lives in
 * the parent, and ApprovalCardsComponent posts one decision per click.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import React, { useState } from "react";
import ApprovalCardsComponent from "../ApprovalCardsComponent";
import { approvalFromEvent, type PendingApproval } from "../../utils/approvalCards";
import type { ApprovalRequiredEvent } from "../../types/types";
import { LOCAL_STORAGE_KEY_AUTO_APPROVE_ENABLED } from "../../constants";
import writeFileEvent from "../../__fixtures__/approvals/approval-required-write-file.json";

const sendApprovalDecision = vi.fn();
vi.mock("../../services/PrismService", () => ({
  default: { sendApprovalDecision: (...args: unknown[]) => sendApprovalDecision(...args) },
}));

function approvalRequired(toolCallId: string, batchId = "batch-1"): ApprovalRequiredEvent {
  return {
    type: "approval_required",
    toolCallId,
    batchId,
    batchSize: 1,
    toolCall: { id: toolCallId, name: "write_file", args: { path: `${toolCallId}.txt`, content: toolCallId } },
    tier: 2,
  };
}

function cardsFrom(events: ApprovalRequiredEvent[]): PendingApproval[] {
  return events.map((event) => approvalFromEvent(event)!).filter(Boolean);
}

/** The parent's side: approvals state per conversation, as AgentChatComponent holds it. */
function Harness({
  conversationId,
  initial,
  onNotify,
}: {
  conversationId: string;
  initial: PendingApproval[];
  onNotify: (_message: string, _type: string) => void;
}) {
  const [approvals, setApprovals] = useState(initial);
  return (
    <ApprovalCardsComponent
      conversationId={conversationId}
      approvals={approvals}
      setApprovals={setApprovals}
      onNotify={onNotify}
    />
  );
}

const card = (toolName: string, index: number) =>
  screen.getAllByRole("group", { name: `Approval for ${toolName}` })[index];

describe("ApprovalCardsComponent — one card per tool call", () => {
  beforeEach(() => {
    sendApprovalDecision.mockReset();
  });

  it("Allow on card #2 posts only #2's toolCallId, and only that card changes", async () => {
    sendApprovalDecision.mockResolvedValue({
      ok: true,
      approved: true,
      decision: "allow",
      scope: "call",
      batchId: "batch-1",
      decidedToolCallIds: ["call-2"],
      remaining: 2,
    });
    render(
      <Harness
        conversationId="conversation-a"
        initial={cardsFrom([approvalRequired("call-1"), approvalRequired("call-2"), approvalRequired("call-3")])}
        onNotify={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("group")).toHaveLength(3);

    fireEvent.click(within(card("write_file", 1)).getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(screen.getAllByRole("group")).toHaveLength(2));
    expect(sendApprovalDecision).toHaveBeenCalledTimes(1);
    expect(sendApprovalDecision).toHaveBeenCalledWith("conversation-a", {
      toolCallId: "call-2",
      batchId: "batch-1",
      decision: "allow",
    });
    // #1 and #3 are untouched: still pending, still actionable.
    const remaining = screen.getAllByRole("group");
    expect(remaining.map((group) => within(group).getByText(/\.txt/).textContent)).toEqual([
      expect.stringContaining("call-1.txt"),
      expect.stringContaining("call-3.txt"),
    ]);
    for (const group of remaining) {
      expect(within(group).getByText("Waiting for your approval")).toBeInTheDocument();
      expect(within(group).getByRole("button", { name: "Allow" })).toBeEnabled();
    }
  });

  it("a sub-agent's card is labelled and decided on the sub-agent's own conversation", async () => {
    sendApprovalDecision.mockResolvedValue({ ok: true, decidedToolCallIds: ["sub-call"], remaining: 0 });
    const forwarded: ApprovalRequiredEvent = {
      ...approvalRequired("sub-call", "sub-batch"),
      subAgentId: "worker-1",
      subAgentDescription: "Refactor the parser",
      approvalConversationId: "sub-agent-conversation",
    };
    render(<Harness conversationId="conversation-a" initial={cardsFrom([forwarded])} onNotify={vi.fn()} />);

    const subAgentCard = card("write_file", 0);
    expect(within(subAgentCard).getByText("sub-agent: Refactor the parser")).toBeInTheDocument();
    fireEvent.click(within(subAgentCard).getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(screen.queryAllByRole("group")).toHaveLength(0));
    expect(sendApprovalDecision).toHaveBeenCalledWith("sub-agent-conversation", {
      toolCallId: "sub-call",
      batchId: "sub-batch",
      decision: "allow",
    });
  });

  it("a failed POST puts the card back and raises a toast", async () => {
    let rejectRequest: (_error: Error) => void = () => {};
    sendApprovalDecision.mockImplementation(
      () => new Promise((_resolve, reject) => (rejectRequest = reject)),
    );
    const onNotify = vi.fn();
    render(<Harness conversationId="conversation-a" initial={cardsFrom([approvalRequired("call-1")])} onNotify={onNotify} />);

    fireEvent.click(within(card("write_file", 0)).getByRole("button", { name: "Allow" }));
    // In flight: the card says so and cannot be clicked twice.
    expect(within(card("write_file", 0)).getByText("Sending…")).toBeInTheDocument();
    expect(within(card("write_file", 0)).getByRole("button", { name: "Allow" })).toBeDisabled();

    await act(async () => rejectRequest(Object.assign(new Error("Prism API error: 502"), { status: 502 })));

    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining("Could not send your decision"), "error");
    expect(within(card("write_file", 0)).getByText("Waiting for your approval")).toBeInTheDocument();
    expect(within(card("write_file", 0)).getByRole("button", { name: "Allow" })).toBeEnabled();
  });

  it("a denial carries the typed reason", async () => {
    sendApprovalDecision.mockResolvedValue({ ok: true, approved: false, decision: "deny", scope: "call", batchId: "batch-1", decidedToolCallIds: ["call-1"], remaining: 0 });
    render(<Harness conversationId="conversation-a" initial={cardsFrom([approvalRequired("call-1")])} onNotify={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Deny…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for denying (optional)" }), {
      target: { value: "wrong directory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));

    await waitFor(() => expect(screen.queryAllByRole("group")).toHaveLength(0));
    expect(sendApprovalDecision).toHaveBeenCalledWith("conversation-a", {
      toolCallId: "call-1",
      batchId: "batch-1",
      decision: "deny",
      reason: "wrong directory",
    });
  });

  it("edited arguments: invalid JSON never leaves the card; the server's 400 is shown beside the editor", async () => {
    sendApprovalDecision.mockRejectedValue(
      Object.assign(new Error("editedArgs rejected: content: Invalid input"), { status: 400 }),
    );
    const onNotify = vi.fn();
    render(<Harness conversationId="conversation-a" initial={cardsFrom([approvalRequired("call-1")])} onNotify={onNotify} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit arguments" }));
    const editor = screen.getByRole("textbox", { name: "Edited arguments (JSON)" });
    fireEvent.change(editor, { target: { value: "{ not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Allow with these arguments" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Not valid JSON");
    expect(sendApprovalDecision).not.toHaveBeenCalled();

    fireEvent.change(editor, { target: { value: '{ "path": "renamed.txt" }' } });
    fireEvent.click(screen.getByRole("button", { name: "Allow with these arguments" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("editedArgs rejected"));
    expect(sendApprovalDecision).toHaveBeenCalledWith("conversation-a", {
      toolCallId: "call-1",
      batchId: "batch-1",
      decision: "allow",
      editedArgs: { path: "renamed.txt" },
    });
    expect(onNotify).not.toHaveBeenCalled();
    expect(screen.getAllByRole("group")).toHaveLength(1);
  });

  it("auto-approving conversation A does not carry over to conversation B", async () => {
    sendApprovalDecision.mockResolvedValue({
      ok: true,
      approved: true,
      decision: "allow",
      scope: "conversation",
      batchId: "batch-a",
      decidedToolCallIds: ["a-1", "a-2"],
      remaining: 0,
      persisted: true,
    });
    const onNotify = vi.fn();
    const { rerender } = render(
      <Harness
        key="conversation-a"
        conversationId="conversation-a"
        initial={cardsFrom([approvalRequired("a-1", "batch-a"), approvalRequired("a-2", "batch-a")])}
        onNotify={onNotify}
      />,
    );

    fireEvent.click(within(card("write_file", 0)).getByRole("button", { name: "Auto-approve this conversation" }));
    await waitFor(() => expect(screen.queryAllByRole("group")).toHaveLength(0));
    expect(sendApprovalDecision).toHaveBeenCalledWith("conversation-a", {
      toolCallId: "a-1",
      batchId: "batch-a",
      decision: "allow",
      scope: "conversation",
    });

    // Switch to conversation B: its call still asks, and nothing is sent for it.
    rerender(
      <Harness
        key="conversation-b"
        conversationId="conversation-b"
        initial={cardsFrom([approvalRequired("b-1", "batch-b")])}
        onNotify={onNotify}
      />,
    );
    expect(within(card("write_file", 0)).getByText("Waiting for your approval")).toBeInTheDocument();
    expect(sendApprovalDecision).toHaveBeenCalledTimes(1);
    // The tab-wide toggle a new conversation would inherit was never touched.
    expect(localStorage.getItem(LOCAL_STORAGE_KEY_AUTO_APPROVE_ENABLED)).toBeNull();
  });

  it("renders the diff preview of a recorded approval_required event", () => {
    // Recorded from the live UI check (scratch path normalized).
    render(
      <Harness
        conversationId="conversation-a"
        initial={cardsFrom([writeFileEvent as ApprovalRequiredEvent])}
        onNotify={vi.fn()}
      />,
    );
    const diff = screen.getByLabelText("Changes to /workspace/scratch-repo/README.md");
    expect(within(diff).getByText("--- a/workspace/scratch-repo/README.md")).toHaveClass("diff-header");
    expect(within(diff).getByText("@@ -1,3 +1,4 @@")).toHaveClass("diff-hunk");
    expect(within(diff).getByText("# Scratch", { exact: false })).toHaveClass("diff-context");
    expect(within(diff).getByText("+One approval card per tool call.")).toHaveClass("diff-added");
    // With a diff to read, the raw arguments start folded; they unfold in full.
    const toggle = screen.getByRole("button", { name: "Arguments" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/"path": "\/workspace\/scratch-repo\/README\.md"/)).toBeInTheDocument();
  });

  it("offers 'Allow the rest of this batch' only when other calls of the batch wait", async () => {
    sendApprovalDecision.mockResolvedValue({
      ok: true,
      approved: true,
      decision: "allow",
      scope: "batch",
      batchId: "batch-1",
      decidedToolCallIds: ["call-1", "call-2"],
      remaining: 0,
    });
    render(
      <Harness
        conversationId="conversation-a"
        initial={cardsFrom([approvalRequired("call-1"), approvalRequired("call-2"), approvalRequired("other", "batch-2")])}
        onNotify={vi.fn()}
      />,
    );
    expect(within(card("write_file", 2)).queryByRole("button", { name: /Allow the rest/ })).toBeNull();

    fireEvent.click(within(card("write_file", 0)).getByRole("button", { name: "Allow the rest of this batch (2)" }));

    await waitFor(() => expect(screen.getAllByRole("group")).toHaveLength(1));
    expect(sendApprovalDecision).toHaveBeenCalledWith("conversation-a", {
      toolCallId: "call-1",
      batchId: "batch-1",
      decision: "allow",
      scope: "batch",
    });
  });
});
