/**
 * What the chat hands to the page around it, through the real component:
 *   - URL changes go to `onUrlChange` (the /chat page applies them with its
 *     router) — the conversation a send creates, a new chat, a changed view
 *     mode — and never the values the chat opens with;
 *   - the live phase's colours reach :root after commit, where the sidebar
 *     dot and the history bars read them, and leave with the turn.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, within } from "@testing-library/react";

vi.hoisted(() => {
  process.env.TZ = "UTC";
});
vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  PRISM_SERVICE_URL: "http://prism.test",
  PRISM_WEBSOCKET_URL: "ws://prism.test",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Test", email: "test@example.test" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: unknown }) => children,
}));

import { mountChat, type ChatHarness } from "./chatHarness";
import type { ChatUrlChange } from "../../AgentChatComponent";

let harness: ChatHarness | null = null;
afterEach(() => {
  harness?.unmount();
  harness = null;
  document.documentElement.removeAttribute("style");
});

describe("what the chat hands to its page", { timeout: 60_000 }, () => {
  it("reports URL changes through onUrlChange, and nothing on mount", async () => {
    const changes: ChatUrlChange[] = [];
    const chat = (harness = await mountChat({ onUrlChange: (change) => changes.push(change) }));
    expect(changes).toEqual([]);

    const nextStream = chat.network.nextStream();
    await chat.typeAndSend("What port does the dev server use?");
    const stream = await nextStream;
    const conversationId = chat.state().conversationId;
    expect(changes).toEqual([{ kind: "conversation", conversationId }]);

    await chat.replay(stream, [{ type: "chunk", content: "3000." }, { type: "done" }]);
    await chat.settle(() => stream.close());

    const viewModes = chat.view.container.querySelector<HTMLElement>(".chat-view-mode-control-component")!;
    await chat.settle(() => fireEvent.click(within(viewModes).getByRole("radio", { name: /Raw/ })));
    expect(changes.at(-1)).toEqual({ kind: "viewMode", viewMode: "raw" });

    const newChat = chat.view.container.querySelector<HTMLElement>("button[title='Start a new conversation']")!;
    await chat.settle(() => fireEvent.click(newChat));
    expect(changes.at(-1)).toEqual({ kind: "conversation", conversationId: null });
  });

  it("puts the live phase's colours on :root after commit, and takes them off with the turn", async () => {
    const chat = (harness = await mountChat());
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--generating-dot-phase-color")).toBe("");

    const nextStream = chat.network.nextStream();
    await chat.typeAndSend("What port does the dev server use?");
    const stream = await nextStream;
    await chat.replay(stream, [{ type: "chunk", content: "Checking the config", outputCharacters: 19 }]);
    expect(root.getPropertyValue("--generating-dot-phase-color")).not.toBe("");
    expect(root.getPropertyValue("--live-phase-gradient-stop-1")).not.toBe("");

    await chat.replay(stream, [{ type: "done" }]);
    await chat.settle(() => stream.close());
    expect(chat.state().isGenerating).toBe(false);
    expect(root.getPropertyValue("--generating-dot-phase-color")).toBe("");
    expect(root.getPropertyValue("--live-phase-gradient-stop-1")).toBe("");
  });
});
