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
  onError = () => {},
}: {
  initialMessages: Message[];
  resend: (_payload: MessageActionResend) => void;
  isGenerating?: boolean;
  onError?: (_message: string) => void;
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
    onError,
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

/** Queries scoped to the rendered message whose text is `text`. */
function messageBubble(text: string) {
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

    fireEvent.click(messageBubble("second question").getByTitle("Edit message"));
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

  it("names every later message an edit of an early message discards", async () => {
    const resend = vi.fn();
    render(<MainChat initialMessages={CONVERSATION} resend={resend} />);

    fireEvent.click(messageBubble("first question").getByTitle("Edit message"));
    fireEvent.change(screen.getByDisplayValue("first question"), {
      target: { value: "first question, again" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("3 later messages");
    expect(patchSpy).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard and resend" }));

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledWith("conv-1", { messages: [] }, "prism-test");
    expect(resend.mock.calls[0][0].text).toBe("first question, again");
  });

  it("Rerun of the last turn resends the typed text and attachments without asking", async () => {
    const resend = vi.fn();
    const attachment = { name: "notes.txt", mimeType: "text/plain", url: "minio://notes.txt" };
    render(
      <MainChat
        initialMessages={[
          CONVERSATION[0],
          CONVERSATION[1],
          {
            role: "user",
            content: "[System Context - Local Time: 10:01]\n\nsecond question",
            rawContent: "second question",
            images: ["minio://shot.png"],
            files: [attachment],
          },
          CONVERSATION[3],
        ]}
        resend={resend}
      />,
    );

    fireEvent.click(messageBubble("second question").getByTitle("Rerun this turn"));

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(patchSpy).toHaveBeenCalledWith(
      "conv-1",
      { messages: CONVERSATION.slice(0, 2) },
      "prism-test",
    );
    expect(resend).toHaveBeenCalledWith({
      text: "second question",
      images: ["minio://shot.png"],
      uploadedFiles: [attachment],
    });
  });

  it("an edit discards the turn's persisted context note with it", async () => {
    const resend = vi.fn();
    const contextNote = (time: string): Message => ({
      role: "system",
      content: `<system-context>\n- Local Time: ${time}\n</system-context>`,
    });
    render(
      <MainChat
        initialMessages={[
          contextNote("2:12 PM"),
          CONVERSATION[0],
          CONVERSATION[1],
          contextNote("2:13 PM"),
          CONVERSATION[2],
          CONVERSATION[3],
        ]}
        resend={resend}
      />,
    );

    fireEvent.click(messageBubble("second question").getByTitle("Edit message"));
    fireEvent.change(screen.getByDisplayValue("second question"), {
      target: { value: "second question, again" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("1 later message");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard and resend" }));

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledWith(
      "conv-1",
      { messages: [contextNote("2:12 PM"), CONVERSATION[0], CONVERSATION[1]] },
      "prism-test",
    );
  });

  it("Rerun of an earlier turn confirms the later turns it discards", async () => {
    const resend = vi.fn();
    render(<MainChat initialMessages={CONVERSATION} resend={resend} />);

    fireEvent.click(messageBubble("first question").getByTitle("Rerun this turn"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("3 later messages");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard and resend" }));

    await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    expect(patchSpy).toHaveBeenCalledWith("conv-1", { messages: [] }, "prism-test");
    expect(resend.mock.calls[0][0].text).toBe("first question");
  });

  it("Delete and Restore patch the conversation index behind hidden messages", async () => {
    const notification: Message = {
      role: "user",
      content: "<task-notification>sub-agent done</task-notification>",
      _notificationSource: "task-complete",
    } as Message;
    const conversation: Message[] = [
      { role: "system", content: "system prompt" },
      CONVERSATION[0],
      CONVERSATION[1],
      notification,
      CONVERSATION[2],
      CONVERSATION[3],
    ];
    render(<MainChat initialMessages={conversation} resend={vi.fn()} />);

    fireEvent.click(messageBubble("second answer").getByTitle("Delete message"));

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    const deletedMessages = patchSpy.mock.calls[0][1].messages as Message[];
    expect(deletedMessages.map((message) => message.deleted ?? false)).toEqual([
      false, false, false, false, false, true,
    ]);
    // The server's own `_` metadata survives the round trip.
    expect(deletedMessages[3]).toMatchObject({ _notificationSource: "task-complete" });

    fireEvent.click(await screen.findByTitle("Restore message"));
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(2));
    const restoredMessages = patchSpy.mock.calls[1][1].messages as Message[];
    expect(restoredMessages[5]).toEqual(CONVERSATION[3]);
  });

  it("Edit of an assistant reply replaces its text in place", async () => {
    const resend = vi.fn();
    render(<MainChat initialMessages={CONVERSATION} resend={resend} />);

    fireEvent.click(messageBubble("first answer").getByTitle("Edit response"));
    fireEvent.change(screen.getByDisplayValue("first answer"), {
      target: { value: "first answer, corrected" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    const patched = patchSpy.mock.calls[0][1].messages as Message[];
    expect(patched[1].content).toBe("first answer, corrected");
    expect(patched).toHaveLength(4);
    expect(resend).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("puts the messages back and reports it when the save fails", async () => {
    patchSpy.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    const onError = vi.fn();
    render(<MainChat initialMessages={CONVERSATION} resend={vi.fn()} onError={onError} />);

    fireEvent.click(messageBubble("first answer").getByTitle("Delete message"));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toContain("503 Service Unavailable");
    expect(screen.queryByTitle("Restore message")).toBeNull();
    expect(screen.getByText("first answer")).toBeInTheDocument();
  });

  it("disables every message action while a turn generates", () => {
    render(<MainChat initialMessages={CONVERSATION} resend={vi.fn()} isGenerating />);
    const bubble = messageBubble("second question");
    for (const action of ["Edit message", "Rerun this turn", "Delete message"]) {
      expect(bubble.getByTitle(action)).toBeDisabled();
    }
  });

  it("a read-only list shows no Edit, Rerun or Delete", () => {
    render(<MessageList messages={CONVERSATION} readOnly />);
    for (const action of ["Edit message", "Rerun this turn", "Delete message"]) {
      expect(screen.queryByTitle(action)).toBeNull();
    }
  });
});
