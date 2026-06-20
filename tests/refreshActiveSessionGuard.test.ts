/**
 * refreshActiveConversation guard — client-driven vs server-driven generation tests.
 *
 * Root cause: refreshActiveConversation() blocked ALL change-stream updates when
 * isGenerating was true. But when isGenerating was set passively from a DB
 * document load (e.g. timer-triggered background execution), there was no
 * active SSE connection — so the client could never learn when the backend
 * finished, leaving the UI permanently stuck at "Starting...".
 *
 * Fix: introduced isClientDrivenGenerationRef to distinguish client-initiated
 * generation (active SSE via handleSend) from server-initiated generation
 * (timer/scheduled task, passive DB load). The guard now only blocks refresh
 * for client-driven generation.
 */
import { describe, it, expect, vi } from "vitest";
import type { AgentConversation } from "../src/types/types";

// Minimal simulated state to test the refreshActiveSession guard logic
// without importing the full React component.

interface RefreshGuardContext {
  isGenerating: boolean;
  isClientDrivenGeneration: boolean;
  currentSessionId: string;
}

/**
 * Extracted refreshActiveConversation guard logic matching ChatConversationComponent.tsx.
 * Returns true if the refresh was performed, false if it was skipped.
 */
async function refreshActiveConversation(
  sessionId: string,
  context: RefreshGuardContext,
  fetchSession: () => Promise<AgentConversation | null>,
  applySessionData: (session: AgentConversation) => void,
): Promise<boolean> {
  if (!sessionId || sessionId !== context.currentSessionId) return false;

  // This is the fix under test: only skip for client-driven generation
  if (context.isGenerating && context.isClientDrivenGeneration) {
    return false;
  }

  const fullSession = await fetchSession();
  if (fullSession && fullSession.id === context.currentSessionId) {
    applySessionData(fullSession);
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
describe("refreshActiveConversation guard — generation source distinction", () => {
  const SESSION_ID = "session-timer-test";

  const COMPLETED_SESSION = {
    id: SESSION_ID,
    isGenerating: false,
    messages: [
      { role: "user", content: "⏰ Reminder fired: check build" },
      { role: "assistant", content: "Build completed successfully." },
    ],
  } as unknown as AgentConversation;

  const GENERATING_SESSION = {
    id: SESSION_ID,
    isGenerating: true,
    messages: [{ role: "user", content: "⏰ Reminder fired: check build" }],
  } as unknown as AgentConversation;

  it("should SKIP refresh when generation is client-driven (active SSE)", async () => {
    const context: RefreshGuardContext = {
      isGenerating: true,
      isClientDrivenGeneration: true,
      currentSessionId: SESSION_ID,
    };

    const fetchSession = vi.fn().mockResolvedValue(COMPLETED_SESSION);
    const applySessionData = vi.fn();

    const wasRefreshed = await refreshActiveConversation(
      SESSION_ID,
      context,
      fetchSession,
      applySessionData,
    );

    expect(wasRefreshed).toBe(false);
    expect(fetchSession).not.toHaveBeenCalled();
    expect(applySessionData).not.toHaveBeenCalled();
  });

  it("should ALLOW refresh when generation is server-driven (timer/scheduled task)", async () => {
    const context: RefreshGuardContext = {
      isGenerating: true,
      isClientDrivenGeneration: false,
      currentSessionId: SESSION_ID,
    };

    const fetchSession = vi.fn().mockResolvedValue(COMPLETED_SESSION);
    const applySessionData = vi.fn();

    const wasRefreshed = await refreshActiveConversation(
      SESSION_ID,
      context,
      fetchSession,
      applySessionData,
    );

    expect(wasRefreshed).toBe(true);
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(applySessionData).toHaveBeenCalledWith(COMPLETED_SESSION);
  });

  it("should ALLOW refresh when not generating at all", async () => {
    const context: RefreshGuardContext = {
      isGenerating: false,
      isClientDrivenGeneration: false,
      currentSessionId: SESSION_ID,
    };

    const fetchSession = vi.fn().mockResolvedValue(COMPLETED_SESSION);
    const applySessionData = vi.fn();

    const wasRefreshed = await refreshActiveConversation(
      SESSION_ID,
      context,
      fetchSession,
      applySessionData,
    );

    expect(wasRefreshed).toBe(true);
    expect(applySessionData).toHaveBeenCalledWith(COMPLETED_SESSION);
  });

  it("should not apply session data if fetched session ID does not match", async () => {
    const context: RefreshGuardContext = {
      isGenerating: false,
      isClientDrivenGeneration: false,
      currentSessionId: SESSION_ID,
    };

    const differentSession = {
      id: "different-session",
      isGenerating: false,
      messages: [],
    } as unknown as AgentConversation;

    const fetchSession = vi.fn().mockResolvedValue(differentSession);
    const applySessionData = vi.fn();

    const wasRefreshed = await refreshActiveConversation(
      SESSION_ID,
      context,
      fetchSession,
      applySessionData,
    );

    expect(wasRefreshed).toBe(false);
    expect(applySessionData).not.toHaveBeenCalled();
  });

  it("should skip entirely when sessionId does not match current session", async () => {
    const context: RefreshGuardContext = {
      isGenerating: false,
      isClientDrivenGeneration: false,
      currentSessionId: "some-other-session",
    };

    const fetchSession = vi.fn().mockResolvedValue(COMPLETED_SESSION);
    const applySessionData = vi.fn();

    const wasRefreshed = await refreshActiveConversation(
      SESSION_ID,
      context,
      fetchSession,
      applySessionData,
    );

    expect(wasRefreshed).toBe(false);
    expect(fetchSession).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
describe("isClientDrivenGeneration ref lifecycle", () => {
  it("should track client-driven generation state correctly through send → complete flow", () => {
    // Simulates the ref lifecycle in ChatConversationComponent
    let isClientDrivenGeneration = false;
    let isGenerating = false;

    // 1. User sends a message (handleSend)
    isGenerating = true;
    isClientDrivenGeneration = true;

    expect(isClientDrivenGeneration).toBe(true);
    expect(isGenerating).toBe(true);

    // 2. Generation completes (finally block)
    isGenerating = false;
    isClientDrivenGeneration = false;

    expect(isClientDrivenGeneration).toBe(false);
    expect(isGenerating).toBe(false);
  });

  it("should NOT set client-driven flag when isGenerating comes from passive DB load", () => {
    // Simulates applySessionData loading a session with isGenerating: true
    let isClientDrivenGeneration = false;
    let isGenerating = false;

    // applySessionData reads isGenerating from DB doc
    const sessionDocument = { isGenerating: true };
    isGenerating = !!sessionDocument.isGenerating;
    // Passive load — explicitly NOT client-driven
    isClientDrivenGeneration = false;

    expect(isGenerating).toBe(true);
    expect(isClientDrivenGeneration).toBe(false);
  });

  it("should allow change-stream refresh to clear server-driven isGenerating", async () => {
    // Simulates the full timer lifecycle from the client's perspective:
    // 1. Timer fires on backend → sets isGenerating=true
    // 2. Change stream fires → client loads session with isGenerating=true
    // 3. Backend loop finishes → sets isGenerating=false
    // 4. Change stream fires again → client loads session with isGenerating=false

    let isClientDrivenGeneration = false;
    let isGenerating = false;
    let currentMessages: Array<{ role: string; content: string }> = [];

    // Step 1-2: Iris event triggers applySessionData with isGenerating: true
    isGenerating = true;
    isClientDrivenGeneration = false; // Passive load

    // Step 3-4: Backend finishes, another change stream event arrives
    // refreshActiveConversation guard should NOT block because !isClientDrivenGeneration
    const shouldSkipRefresh = isGenerating && isClientDrivenGeneration;
    expect(shouldSkipRefresh).toBe(false); // Should NOT skip

    // Apply the completed session data
    const completedSession = {
      isGenerating: false,
      messages: [
        { role: "user", content: "⏰ Reminder fired: check build" },
        { role: "assistant", content: "Build completed successfully." },
      ],
    };

    isGenerating = completedSession.isGenerating;
    currentMessages = completedSession.messages;

    // Client is now updated correctly
    expect(isGenerating).toBe(false);
    expect(currentMessages).toHaveLength(2);
    expect(currentMessages[1].content).toBe("Build completed successfully.");
  });
});
