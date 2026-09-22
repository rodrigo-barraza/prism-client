/**
 * Rewind to here / Fork from here / Edit as a branch (prism-service
 * docs/prompts/15), rendered the way AgentChatComponent renders them:
 * MessageList over the chat's filtered view with the handlers of both
 * useMessageActions and useConversationBranching spread onto it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React, { useMemo, useState } from "react";
import MessageList from "../MessageListComponent";
import useMessageActions, { type MessageActionResend } from "../../hooks/useMessageActions";
import useConversationBranching from "../../hooks/useConversationBranching";
import PrismService from "../../services/PrismService";
import type { ForkResult, RewindReport } from "../../services/conversationBranching";
import type { Message } from "../../types/types";

const CONVERSATION: Message[] = [
  { id: "m0", role: "user", content: "first question", timestamp: "2026-09-22T10:00:00Z" },
  { id: "m1", role: "assistant", content: "first answer", timestamp: "2026-09-22T10:00:05Z" },
  { id: "m2", role: "user", content: "second question", timestamp: "2026-09-22T10:01:00Z" },
  { id: "m3", role: "assistant", content: "second answer", timestamp: "2026-09-22T10:01:05Z" },
];

const FORK: ForkResult = {
  id: "fork-1",
  type: "agent",
  title: "Two turns (fork)",
  messageCount: 2,
  forkedFrom: { conversationId: "conv-1", messageId: "m1", position: "at", title: "Two turns" },
};

function dryRunReport(overrides: Partial<RewindReport> = {}): RewindReport {
  return {
    conversationId: "conv-1",
    toMessageId: "m1",
    restore: "both",
    dryRun: true,
    conversation: { prunedCount: 2, remainingCount: 2, keptThroughMessageId: "m1" },
    code: {
      status: "dry-run",
      workspaces: [
        { workspaceRoot: "/work/repo", ref: "refs/prism/checkpoints/conv-1/2-1", status: "would-restore", restored: ["a.txt"], removed: ["b.txt"], conflicts: [], skipped: [] },
      ],
    },
    ...overrides,
  };
}

type Route = (_body: Record<string, unknown>) => { status: number; body: unknown };
let routes: Record<string, Route>;
let requests: Array<{ path: string; body: Record<string, unknown> }>;

function stubFetch() {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(String(url), "http://prism.test").pathname.replace(/^.*(\/conversations\/)/, "$1");
      const body = JSON.parse(String(init?.body || "{}"));
      requests.push({ path, body });
      const answer = routes[path]?.(body) ?? { status: 404, body: { error: "no route" } };
      return { ok: answer.status < 400, status: answer.status, json: async () => answer.body } as Response;
    }),
  );
}

function BranchingChat({
  initialMessages = CONVERSATION,
  onOpen = () => {},
  onSend = () => {},
  onRewound = () => {},
  resend = () => {},
  onError = () => {},
}: {
  initialMessages?: Message[];
  onOpen?: (_fork: ForkResult) => void;
  onSend?: (_payload: MessageActionResend) => void;
  onRewound?: (_report: RewindReport) => void;
  resend?: (_payload: MessageActionResend) => void;
  onError?: (_message: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversationId, setConversationId] = useState("conv-1");
  const listMessages = useMemo(
    () => messages.filter((message) => message.role === "user" || message.role === "assistant"),
    [messages],
  );
  const branching = useConversationBranching({
    listMessages,
    conversationId,
    project: "prism-test",
    isGenerating: false,
    onRewound,
    openConversation: async (fork) => {
      onOpen(fork);
      // AgentChatComponent: handleSelectConversation → applyConversationData
      setMessages([]);
      setConversationId(fork.id);
    },
    send: onSend,
    onNotice: () => {},
    onError,
  });
  const messageActions = useMessageActions({
    messages,
    listMessages,
    commitMessages: setMessages,
    isGenerating: false,
    conversationId,
    project: "prism-test",
    resend,
    forkEdit: branching.forkForEdit,
    onError,
  });
  return (
    <>
      <MessageList messages={listMessages} {...messageActions.listProps} {...branching.listProps} />
      {messageActions.confirmDialog}
      {branching.dialog}
    </>
  );
}

function messageBubble(text: string) {
  const bubble = screen.getByText(text).closest("[data-message-index]") as HTMLElement;
  return within(bubble);
}

describe("conversation branching — rewind, fork, edit as a branch", () => {
  let patchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    routes = {
      "/conversations/conv-1/fork": () => ({ status: 201, body: FORK }),
      "/conversations/conv-1/rewind": (body) => ({
        status: 200,
        body: body.dryRun ? dryRunReport() : { ...dryRunReport(), dryRun: false, restore: body.restore },
      }),
    };
    stubFetch();
    patchSpy = vi
      .spyOn(PrismService, "patchConversation")
      .mockResolvedValue({} as Awaited<ReturnType<typeof PrismService.patchConversation>>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    patchSpy.mockRestore();
  });

  it("Fork from here calls the fork endpoint at that message and opens the fork", async () => {
    const onOpen = vi.fn();
    render(<BranchingChat onOpen={onOpen} />);

    fireEvent.click(messageBubble("first answer").getByTitle("Fork from here"));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(FORK));
    expect(requests).toEqual([{ path: "/conversations/conv-1/fork", body: { atMessageId: "m1" } }]);
  });

  it("Rewind to here opens a dialog listing the files from a dry run, then rewinds what was chosen", async () => {
    const onRewound = vi.fn();
    render(<BranchingChat onRewound={onRewound} />);

    fireEvent.click(messageBubble("first answer").getByTitle("Rewind to here…"));

    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText("a.txt");
    expect(within(dialog).getByText("b.txt")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Removes the 2 later messages");
    expect(requests[0]).toEqual({
      path: "/conversations/conv-1/rewind",
      body: { toMessageId: "m1", restore: "both", force: false, dryRun: true },
    });

    fireEvent.click(within(dialog).getByRole("radio", { name: "Conversation only" }));
    expect(within(dialog).queryByText("a.txt")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Rewind" }));

    await waitFor(() => expect(onRewound).toHaveBeenCalledTimes(1));
    expect(requests[1]).toEqual({
      path: "/conversations/conv-1/rewind",
      body: { toMessageId: "m1", restore: "conversation", force: false, dryRun: false },
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("files the user changed block the code rewind until overwriting them is ticked", async () => {
    routes["/conversations/conv-1/rewind"] = (body) => ({
      status: body.force ? 200 : 409,
      body: dryRunReport({
        dryRun: !!body.dryRun,
        code: {
          status: body.force ? "restored" : "refused",
          workspaces: [
            { workspaceRoot: "/work/repo", ref: "r", status: body.force ? "restored" : "refused", restored: ["a.txt", "c.txt"], removed: [], conflicts: ["c.txt"], skipped: [] },
          ],
        },
      }),
    });
    const onRewound = vi.fn();
    render(<BranchingChat onRewound={onRewound} />);

    fireEvent.click(messageBubble("first answer").getByTitle("Rewind to here…"));
    const dialog = await screen.findByRole("alertdialog");
    await within(dialog).findByText(/Changed since the agent's last edit/);
    const rewind = within(dialog).getByRole("button", { name: "Rewind" });
    expect(rewind).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Overwrite these changes too" }));
    expect(rewind).toBeEnabled();
    fireEvent.click(rewind);

    await waitFor(() => expect(onRewound).toHaveBeenCalledTimes(1));
    expect(requests.at(-1)?.body).toEqual({ toMessageId: "m1", restore: "both", force: true, dryRun: false });
  });

  it("Edit defaults to forking: the edited prompt is sent in a fork, the original is untouched", async () => {
    routes["/conversations/conv-1/fork"] = () => ({
      status: 201,
      body: { ...FORK, forkedFrom: { conversationId: "conv-1", messageId: "m0", position: "before" } },
    });
    const onOpen = vi.fn();
    const onSend = vi.fn();
    const resend = vi.fn();
    render(<BranchingChat onOpen={onOpen} onSend={onSend} resend={resend} />);

    fireEvent.click(messageBubble("first question").getByTitle("Edit message"));
    fireEvent.change(screen.getByDisplayValue("first question"), { target: { value: "first question, rephrased" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("radio", { name: /New branch/ })).toBeChecked();
    expect(dialog).toHaveTextContent("keeps its 3 later messages");
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit in a new branch" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(requests).toEqual([{ path: "/conversations/conv-1/fork", body: { beforeMessageId: "m0" } }]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ text: "first question, rephrased", images: [], uploadedFiles: [] });
    // Nothing was discarded from the original conversation.
    expect(patchSpy).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });

  it("Edit → Replace in place keeps the truncate-and-resend behaviour", async () => {
    const resend = vi.fn();
    render(<BranchingChat resend={resend} />);

    fireEvent.click(messageBubble("second question").getByTitle("Edit message"));
    fireEvent.change(screen.getByDisplayValue("second question"), { target: { value: "second, again" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Replace in place/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard and resend" }));

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledWith("conv-1", { messages: CONVERSATION.slice(0, 2) }, "prism-test");
    expect(requests).toEqual([]);
  });

  it("an action on a reply covers the whole reply — through its last message before the next prompt", async () => {
    const withSteps: Message[] = [
      CONVERSATION[0],
      { id: "m1a", role: "assistant", content: "working on it", timestamp: "2026-09-22T10:00:03Z" },
      CONVERSATION[1],
      ...CONVERSATION.slice(2),
    ];
    const onOpen = vi.fn();
    render(<BranchingChat initialMessages={withSteps} onOpen={onOpen} />);

    // The reply's actions sit on its first bubble.
    fireEvent.click(messageBubble("working on it").getByTitle("Fork from here"));

    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    expect(requests).toEqual([{ path: "/conversations/conv-1/fork", body: { atMessageId: "m1" } }]);
  });

  it("a message without a server id (not saved yet) cannot be rewound to or forked from", () => {
    const unsaved = CONVERSATION.map(({ id: _id, ...message }) => message as Message);
    render(<BranchingChat initialMessages={unsaved} />);

    expect(messageBubble("first answer").getByTitle("Rewind — available once saved")).toBeDisabled();
    expect(messageBubble("first answer").getByTitle("Fork — available once saved")).toBeDisabled();
  });
});
