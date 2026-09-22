/**
 * The main chat's message actions, rendered the way AgentChatComponent
 * renders them: MessageList over the chat's filtered view, with the
 * handlers and confirm dialog from useMessageActions spread onto it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React, { useMemo, useState } from "react";
import MessageList from "../MessageListComponent";
import useMessageActions, {
  type MessageActionResend,
} from "../../hooks/useMessageActions";
import PrismService from "../../services/PrismService";
import type { Message } from "../../types/types";

const CONVERSATION: Message[] = [
  { role: "user", content: "first question", timestamp: "2026-09-22T10:00:00Z" },
  { role: "assistant", content: "first answer", timestamp: "2026-09-22T10:00:05Z" },
  { role: "user", content: "second question", timestamp: "2026-09-22T10:01:00Z" },
  { role: "assistant", content: "second answer", timestamp: "2026-09-22T10:01:05Z" },
];

function MainChat({
  initialMessages,
  resend,
  isGenerating = false,
}: {
  initialMessages: Message[];
  resend: (_payload: MessageActionResend) => void;
  isGenerating?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // AgentChatComponent's filteredMessages
  const listMessages = useMemo(
    () => messages.filter((message) => message.role === "user" || message.role === "assistant"),
    [messages],
  );
  const messageActions = useMessageActions({
    messages,
    listMessages,
    commitMessages: setMessages,
    isGenerating,
    conversationId: "conv-1",
    project: "prism-test",
    resend,
    onError: () => {},
  });
  return (
    <>
      <MessageList
        messages={listMessages}
        isGenerating={isGenerating}
        {...messageActions.listProps}
      />
      {messageActions.confirmDialog}
    </>
  );
}

function userMessageActions(text: string) {
  const bubble = screen.getByText(text).closest("[data-message-index]") as HTMLElement;
  return within(bubble);
}

describe("main chat message actions", () => {
  let patchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    patchSpy = vi
      .spyOn(PrismService, "patchConversation")
      .mockResolvedValue({} as Awaited<ReturnType<typeof PrismService.patchConversation>>);
  });

  afterEach(() => {
    patchSpy.mockRestore();
  });

  it("Edit → change the text → Save reaches the handler without throwing", async () => {
    const resend = vi.fn();
    render(<MainChat initialMessages={CONVERSATION} resend={resend} />);

    fireEvent.click(userMessageActions("second question").getByTitle("Edit message"));
    const editor = screen.getByDisplayValue("second question");
    fireEvent.change(editor, { target: { value: "second question, rephrased" } });
    // React reports an event handler's throw on window, not to the caller.
    const uncaught: unknown[] = [];
    const recordUncaught = (event: ErrorEvent) => {
      uncaught.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", recordUncaught);
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    window.removeEventListener("error", recordUncaught);
    expect(uncaught).toEqual([]);

    // One later message (the second answer) is discarded — confirm first.
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("1 later message");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard and resend" }));

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledWith(
      "conv-1",
      { messages: CONVERSATION.slice(0, 2) },
      "prism-test",
    );
    expect(resend).toHaveBeenCalledWith({
      text: "second question, rephrased",
      images: [],
      uploadedFiles: [],
    });
  });
});
