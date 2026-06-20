import { describe, it, expect, vi } from "vitest";

vi.mock("@rodrigo-barraza/components-library", () => ({
  CopyButtonComponent: () => null,
  IconButtonComponent: () => null,
}));

import type { Message, AgentConversation } from "../src/types/types";
import { prepareDisplayMessages } from "../src/components/MessageListComponent";

describe("Post-Stream Refresh Guard", () => {
  it("should retry if the database has fewer messages, but ultimately skip updating to prevent disappearing messages", async () => {
    // Local streaming state has 2 messages (user send, assistant reply)
    const localMessages: Message[] = [
      { role: "user", content: "hey" },
      { role: "assistant", content: "hello" },
    ];
    let messagesState = [...localMessages];
    const setMessages = (newMessages: Message[]) => {
      messagesState = newMessages;
    };

    const messagesRef = { current: localMessages };

    const databaseSession = {
      id: "session-123",
      messages: [],
    } as unknown as AgentConversation;

    let fetchAttemptsCount = 0;
    const mockGetAgentSession = vi.fn().mockImplementation(async () => {
      fetchAttemptsCount++;
      return databaseSession;
    });

    // Mimic the attemptPostStreamRefresh orchestration function
    const attemptPostStreamRefresh = async (attempt = 1): Promise<void> => {
      const full = await mockGetAgentSession();
      if (full && full.messages) {
        const displayMessages = prepareDisplayMessages(full.messages);
        const currentCount = messagesRef.current.length;

        if (displayMessages.length < currentCount) {
          if (attempt < 3) {
            // In test, resolve instantly instead of waiting 2 seconds
            await new Promise((resolve) => resolve(null));
            return attemptPostStreamRefresh(attempt + 1);
          } else {
            // Max retries reached; skip updating to prevent overwriting with stale DB data
            return;
          }
        }

        const lastStreamingUserMessage = [...messagesRef.current]
          .reverse()
          .find((message: Message) => message.role === "user");
        if (lastStreamingUserMessage?.content) {
          const databaseUserContents = displayMessages
            .filter((message: Message) => message.role === "user")
            .map((message: Message) =>
              message.content?.toString().trim(),
            );
          const streamingUserContent = lastStreamingUserMessage.content
            .toString()
            .trim();
          if (
            streamingUserContent &&
            !databaseUserContents.includes(streamingUserContent)
          ) {
            if (attempt < 3) {
              await new Promise((resolve) => resolve(null));
              return attemptPostStreamRefresh(attempt + 1);
            } else {
              return;
            }
          }
        }

        setMessages(displayMessages);
      }
    };

    await attemptPostStreamRefresh();

    // Verify it retried 3 times
    expect(fetchAttemptsCount).toBe(3);
    // Verify it did NOT overwrite state (it kept the local/streaming messages)
    expect(messagesState).toEqual(localMessages);
  });

  it("should successfully update the UI messages if the database matches the expected messages count", async () => {
    const localMessages: Message[] = [
      { role: "user", content: "hey" },
      { role: "assistant", content: "hello" },
    ];
    let messagesState = [...localMessages];
    const setMessages = (newMessages: Message[]) => {
      messagesState = newMessages;
    };

    const messagesRef = { current: localMessages };

    const databaseSession = {
      id: "session-123",
      messages: [
        { role: "user", content: "hey" },
        { role: "assistant", content: "hello" },
      ],
    } as unknown as AgentConversation;

    let fetchAttemptsCount = 0;
    const mockGetAgentSession = vi.fn().mockImplementation(async () => {
      fetchAttemptsCount++;
      return databaseSession;
    });

    const attemptPostStreamRefresh = async (attempt = 1): Promise<void> => {
      const full = await mockGetAgentSession();
      if (full && full.messages) {
        const displayMessages = prepareDisplayMessages(full.messages);
        const currentCount = messagesRef.current.length;

        if (displayMessages.length < currentCount) {
          if (attempt < 3) {
            await new Promise((resolve) => resolve(null));
            return attemptPostStreamRefresh(attempt + 1);
          } else {
            return;
          }
        }

        const lastStreamingUserMessage = [...messagesRef.current]
          .reverse()
          .find((message: Message) => message.role === "user");
        if (lastStreamingUserMessage?.content) {
          const databaseUserContents = displayMessages
            .filter((message: Message) => message.role === "user")
            .map((message: Message) =>
              message.content?.toString().trim(),
            );
          const streamingUserContent = lastStreamingUserMessage.content
            .toString()
            .trim();
          if (
            streamingUserContent &&
            !databaseUserContents.includes(streamingUserContent)
          ) {
            if (attempt < 3) {
              await new Promise((resolve) => resolve(null));
              return attemptPostStreamRefresh(attempt + 1);
            } else {
              return;
            }
          }
        }

        setMessages(displayMessages);
      }
    };

    await attemptPostStreamRefresh();

    // Verify it succeeded on the first attempt
    expect(fetchAttemptsCount).toBe(1);
    // Verify it updated the messages state
    expect(messagesState).toHaveLength(2);
    expect(messagesState[0].content).toBe("hey");
  });

  it("should retry and skip updating if database matches the expected count but misses the latest user message content (Guard 2)", async () => {
    // Local streaming state has 2 messages (user send "hey", assistant reply "hello")
    const localMessages: Message[] = [
      { role: "user", content: "hey" },
      { role: "assistant", content: "hello" },
    ];
    let messagesState = [...localMessages];
    const setMessages = (newMessages: Message[]) => {
      messagesState = newMessages;
    };

    const messagesRef = { current: localMessages };

    // Database matches count (2 messages) but has different user content ("different query")
    const databaseSession = {
      id: "session-123",
      messages: [
        { role: "user", content: "different query" },
        { role: "assistant", content: "hello" },
      ],
    } as unknown as AgentConversation;

    let fetchAttemptsCount = 0;
    const mockGetAgentSession = vi.fn().mockImplementation(async () => {
      fetchAttemptsCount++;
      return databaseSession;
    });

    const attemptPostStreamRefresh = async (attempt = 1): Promise<void> => {
      const full = await mockGetAgentSession();
      if (full && full.messages) {
        const displayMessages = prepareDisplayMessages(full.messages);
        const currentCount = messagesRef.current.length;

        if (displayMessages.length < currentCount) {
          if (attempt < 3) {
            await new Promise((resolve) => resolve(null));
            return attemptPostStreamRefresh(attempt + 1);
          } else {
            return;
          }
        }

        const lastStreamingUserMessage = [...messagesRef.current]
          .reverse()
          .find((message: Message) => message.role === "user");
        if (lastStreamingUserMessage?.content) {
          const databaseUserContents = displayMessages
            .filter((message: Message) => message.role === "user")
            .map((message: Message) =>
              message.content?.toString().trim(),
            );
          const streamingUserContent = lastStreamingUserMessage.content
            .toString()
            .trim();
          if (
            streamingUserContent &&
            !databaseUserContents.includes(streamingUserContent)
          ) {
            if (attempt < 3) {
              await new Promise((resolve) => resolve(null));
              return attemptPostStreamRefresh(attempt + 1);
            } else {
              return;
            }
          }
        }

        setMessages(displayMessages);
      }
    };

    await attemptPostStreamRefresh();

    // Verify it retried 3 times due to mismatch in user message content (Guard 2)
    expect(fetchAttemptsCount).toBe(3);
    // Verify it did NOT overwrite state (it kept the local/streaming messages)
    expect(messagesState).toEqual(localMessages);
  });
});
