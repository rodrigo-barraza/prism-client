import { describe, it, expect, vi } from "vitest";

// Mock types to match the real application
interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
}

interface AgentSession {
  id: string;
  messages: Message[];
}

// Pure helper function to mimic prepareDisplayMessages without CSS module imports
function prepareDisplayMessages(
  rawMessages: Message[] | undefined | null,
): Message[] {
  if (!rawMessages || rawMessages.length === 0) return [];
  return rawMessages.filter((message) => {
    if (message.role === "tool") return false;
    if (message.role === "system") return false;
    const isEmptyAssistant =
      message.role === "assistant" && !message.content?.trim();
    return !isEmptyAssistant;
  });
}

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

    // Database is stale (e.g. paused/suspended state) and only contains 0 messages for this turn
    const databaseSession: AgentSession = {
      id: "session-123",
      messages: [],
    };

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

    // Database is up-to-date and matches local messages count
    const databaseSession: AgentSession = {
      id: "session-123",
      messages: [
        { role: "user", content: "hey" },
        { role: "assistant", content: "hello" },
      ],
    };

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
});
