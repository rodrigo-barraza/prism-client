/**
 * Accessibility basics of the agent chat's parts (prompt 26 Landing 3),
 * on the real chat through the characterization harness:
 *
 * - the composer is a labelled textbox;
 * - after a send, the keyboard is back in the composer (a click on Send
 *   moved it to the button);
 * - a message's actions are buttons the keyboard reaches, with names, and
 *   they show on keyboard focus, not only on hover;
 * - a polite live region says the streaming status: the phase as it
 *   changes, and that the reply finished.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

import {
  REGION_SELECTORS,
  loadTranscript,
  mountChat,
  sendAndReplay,
  type ChatHarness,
} from "./chat-characterization/chatHarness";
import { REPLY_FINISHED_ANNOUNCEMENT } from "../ChatStatusBarComponent";

let harness: ChatHarness | null = null;
afterEach(() => {
  harness?.unmount();
  harness = null;
});

const CONVERSATION_ID = "conv-a11y";

function savedConversation() {
  return {
    id: CONVERSATION_ID,
    title: "Ports",
    project: "coding",
    updatedAt: "2026-09-22T11:00:00.000Z",
    displayMessages: [
      { id: "m-1", role: "user", content: "Which port?", timestamp: "2026-09-22T11:00:00.000Z" },
      {
        id: "m-2",
        role: "assistant",
        content: "Port 3000.",
        timestamp: "2026-09-22T11:00:01.000Z",
        provider: "anthropic",
        model: "claude-test",
      },
    ],
  };
}

function composerOf(chat: ChatHarness): HTMLElement {
  const composer = chat.view.container.querySelector<HTMLElement>(REGION_SELECTORS.composer);
  if (!composer) throw new Error("composer not found");
  return composer;
}

function liveStatusOf(chat: ChatHarness): HTMLElement {
  const regions = [...chat.view.container.querySelectorAll<HTMLElement>("[role='status'][aria-live='polite']")].filter(
    (region) => !region.getAttribute("aria-label")?.startsWith("Live stream"),
  );
  expect(regions).toHaveLength(1);
  return regions[0];
}

describe("agent chat accessibility", { timeout: 60_000 }, () => {
  it("the composer is a textbox labelled for the agent", async () => {
    const chat = (harness = await mountChat());
    const composer = within(chat.view.container).getByRole("textbox", { name: /^Message / });
    expect(composer).toBe(composerOf(chat));
    expect(composer.getAttribute("aria-multiline")).toBe("true");
  });

  it("after a click on Send, the keyboard is back in the composer", async () => {
    const chat = (harness = await mountChat());
    const composer = composerOf(chat);
    await chat.settle(() => {
      composer.textContent = "Which port does the dev server use?";
      fireEvent.input(composer);
    });
    const sendButton = within(chat.view.container).getByRole("button", { name: "Send" });
    const nextStream = chat.network.nextStream();
    await chat.settle(() => {
      sendButton.focus();
      fireEvent.click(sendButton);
    });
    const stream = await nextStream;
    expect(document.activeElement).toBe(composer);
    expect(composer.textContent).toBe("");
    await chat.settle(() => stream.close());
  });

  it("a message's actions are named buttons the keyboard reaches, shown on keyboard focus", async () => {
    const chat = (harness = await mountChat(
      { initialConversationId: CONVERSATION_ID },
      { persisted: new Map([[CONVERSATION_ID, savedConversation()]]) },
    ));
    const userRow = chat.view.container.querySelector<HTMLElement>("[data-message-index='0']");
    if (!userRow) throw new Error("the user's row did not render");
    const actions = within(userRow).getAllByRole("button");
    const names = actions.map((button) => button.getAttribute("title"));
    expect(names).toEqual(
      expect.arrayContaining(["Edit message", "Rerun this turn", "Copy raw text", "Delete message"]),
    );
    for (const button of actions) {
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
      expect(button.closest("[aria-hidden='true']")).toBeNull();
      button.focus();
      expect(document.activeElement).toBe(button);
    }
    // The actions are transparent until the row is hovered — or, for the
    // keyboard, until focus is inside the row (jsdom applies no CSS modules).
    const stylesheet = readFileSync(resolve(__dirname, "../MessageListComponent.module.css"), "utf-8");
    expect(stylesheet).toMatch(/&:hover \.action-button,\s*&:focus-within \.action-button\s*\{\s*opacity: 1;/);
    expect(stylesheet).toMatch(/\n\.action-button \{[\s\S]*?&:focus-visible \{\s*opacity: 1;/);
  });

  it("a polite live region says the streaming status, and that the reply finished", async () => {
    const chat = (harness = await mountChat());
    const heard: string[] = [];
    await sendAndReplay(chat, "What port does the dev server use?", loadTranscript("agent-turn-with-tools.jsonl"), {
      onEvent: () => {
        const text = liveStatusOf(chat).textContent ?? "";
        if (text && heard[heard.length - 1] !== text) heard.push(text);
      },
    });
    await chat.settle();
    const finalAnnouncement = liveStatusOf(chat).textContent;
    expect(liveStatusOf(chat).getAttribute("aria-atomic")).toBe("true");
    // The phases as they changed — not a line per token.
    expect(heard.length).toBeGreaterThan(1);
    expect(heard.length).toBeLessThan(loadTranscript("agent-turn-with-tools.jsonl").length);
    expect(heard).toContain("Generating...");
    expect(finalAnnouncement).toBe(REPLY_FINISHED_ANNOUNCEMENT);
  });
});
