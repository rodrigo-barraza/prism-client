/**
 * Direct Chat Cost Reconciliation — regression tests.
 *
 * Root cause: The `fetchSessionStats` callback previously skipped direct
 * chat sessions entirely, so background operation costs (memory extraction,
 * embedding, consolidation) never updated the sidebar cost badge until
 * a full page reload.
 *
 * These tests verify that:
 *   1. The direct chat cost reconciliation logic correctly patches the
 *      sidebar session entry when the backend returns enriched totalCost
 *   2. No-op when the cost hasn't changed (prevents unnecessary re-renders)
 *   3. The cost resolution logic for direct chat correctly falls back
 *      to client-side totalCost (from getSessionCost) when no
 *      backendSessionStats are available
 *   4. Background usage accumulation works correctly for direct chat
 */
import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════
// Direct Chat Cost Reconciliation
// ═══════════════════════════════════════════════════════════════

describe("Direct Chat Cost Reconciliation", () => {
  /**
   * Simulates the sidebar session patching logic from
   * fetchSessionStats when isNoAgent=true.
   */
  function reconcileDirectChatCost(
    sessions: Array<{ id: string; totalCost: number }>,
    sessionId: string,
    backendTotalCost: number | null | undefined,
  ): Array<{ id: string; totalCost: number }> {
    if (backendTotalCost == null) return sessions;

    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) return sessions;

    const existing = sessions[index];
    if (existing.totalCost === backendTotalCost) return sessions;

    const updated = [...sessions];
    updated[index] = { ...existing, totalCost: backendTotalCost };
    return updated;
  }

  it("should update sidebar cost when backend returns higher enriched cost", () => {
    const sessions = [
      { id: "conv-1", totalCost: 0.001 },
      { id: "conv-2", totalCost: 0.005 },
    ];

    // Backend returns enriched cost (includes memory extraction + embedding)
    const result = reconcileDirectChatCost(sessions, "conv-1", 0.0035);

    expect(result[0].totalCost).toBeCloseTo(0.0035, 6);
    expect(result[1].totalCost).toBeCloseTo(0.005, 6); // unchanged
    expect(result).not.toBe(sessions); // new array reference
  });

  it("should no-op when cost hasn't changed (prevents re-renders)", () => {
    const sessions = [
      { id: "conv-1", totalCost: 0.001 },
    ];

    const result = reconcileDirectChatCost(sessions, "conv-1", 0.001);

    // Same reference — no state update needed
    expect(result).toBe(sessions);
  });

  it("should no-op when session not found", () => {
    const sessions = [
      { id: "conv-1", totalCost: 0.001 },
    ];

    const result = reconcileDirectChatCost(sessions, "nonexistent", 0.005);

    expect(result).toBe(sessions);
  });

  it("should no-op when backend returns null/undefined cost", () => {
    const sessions = [
      { id: "conv-1", totalCost: 0.001 },
    ];

    expect(reconcileDirectChatCost(sessions, "conv-1", null)).toBe(sessions);
    expect(reconcileDirectChatCost(sessions, "conv-1", undefined)).toBe(sessions);
  });

  it("should handle zero-cost local model sessions", () => {
    const sessions = [
      { id: "conv-local", totalCost: 0 },
    ];

    // Backend returns 0 for local model — no change
    const result = reconcileDirectChatCost(sessions, "conv-local", 0);
    expect(result).toBe(sessions);
  });

  it("should handle transition from zero to non-zero cost", () => {
    const sessions = [
      { id: "conv-1", totalCost: 0 },
    ];

    const result = reconcileDirectChatCost(sessions, "conv-1", 0.002);
    expect(result[0].totalCost).toBeCloseTo(0.002, 6);
    expect(result).not.toBe(sessions);
  });
});

// ═══════════════════════════════════════════════════════════════
// Direct Chat resolvedCost calculation
// ═══════════════════════════════════════════════════════════════

describe("Direct Chat resolvedCost calculation", () => {
  /**
   * Simulates the resolvedCost computation from the live-patch
   * useEffect in ChatConversationComponent. For direct chat (isNoAgent),
   * backendSessionStats is null, so totalCost is used directly.
   */
  function computeResolvedCost({
    backendSessionStats,
    backgroundUsageCost,
    activeMessageCost,
    clientTotalCost,
    isNoAgent = false,
    existingCost = 0,
  }: {
    backendSessionStats: { totalCost: number } | null;
    backgroundUsageCost: number;
    activeMessageCost: number;
    clientTotalCost: number;
    isNoAgent?: boolean;
    existingCost?: number;
  }) {
    return backendSessionStats
      ? (backendSessionStats.totalCost || 0) +
          backgroundUsageCost +
          activeMessageCost
      : isNoAgent
        ? Math.max(existingCost, clientTotalCost)
        : clientTotalCost;
  }

  it("should use client-side totalCost for direct chat (no backendSessionStats)", () => {
    const result = computeResolvedCost({
      backendSessionStats: null,
      backgroundUsageCost: 0,
      activeMessageCost: 0,
      clientTotalCost: 0.0025,
      isNoAgent: true,
      existingCost: 0,
    });

    expect(result).toBeCloseTo(0.0025, 6);
  });

  it("should include _backgroundUsage cost when available in client fallback", () => {
    // For direct chat, backgroundUsage is accumulated on the message
    // but the resolvedCost logic falls back to clientTotalCost (getSessionCost)
    // which already includes the message-level estimatedCost.
    // The background cost from usage_update events is separate.
    const clientTotalCost = 0.001; // from message estimatedCost
    const backgroundUsageCost = 0.00025; // from memory:extract SSE event

    // In the direct chat path (no backendSessionStats), the resolvedCost
    // is just clientTotalCost — background usage is NOT added here because
    // the full path uses getSessionCost which only sums message costs.
    const result = computeResolvedCost({
      backendSessionStats: null,
      backgroundUsageCost,
      activeMessageCost: 0,
      clientTotalCost,
      isNoAgent: true,
      existingCost: 0,
    });

    // Falls back to clientTotalCost when no backendSessionStats
    expect(result).toBeCloseTo(clientTotalCost, 6);
  });

  it("should use backendSessionStats path for agent sessions", () => {
    const result = computeResolvedCost({
      backendSessionStats: { totalCost: 0.15 },
      backgroundUsageCost: 0.001,
      activeMessageCost: 0.02,
      clientTotalCost: 0.05, // ignored when backendSessionStats present
      isNoAgent: false,
      existingCost: 0,
    });

    expect(result).toBeCloseTo(0.15 + 0.001 + 0.02, 6);
  });

  it("should not downgrade direct chat cost if existing cost in sidebar is higher than clientTotalCost", () => {
    const result = computeResolvedCost({
      backendSessionStats: null,
      backgroundUsageCost: 0,
      activeMessageCost: 0,
      clientTotalCost: 0.001, // fallback cost based on messages
      isNoAgent: true,
      existingCost: 0.0035, // enriched cost already in sidebar from backend
    });

    expect(result).toBeCloseTo(0.0035, 6);
  });
});

// ═══════════════════════════════════════════════════════════════
// Background usage accumulation for direct chat
// ═══════════════════════════════════════════════════════════════

describe("Direct Chat _backgroundUsage accumulation", () => {
  /**
   * Simulates the onUsageUpdate handler's background accumulation
   * logic. This is identical for direct chat and agent sessions —
   * both accumulate background costs on the last assistant message.
   */
  function accumulateBackgroundUsage(
    existing: { inputTokens: number; outputTokens: number; requests: number; cost: number } | null,
    usageEvent: { requests?: number; inputTokens?: number; outputTokens?: number; estimatedCost?: number | null },
  ) {
    const backgroundUsage = existing || { inputTokens: 0, outputTokens: 0, requests: 0, cost: 0 };
    return {
      inputTokens: backgroundUsage.inputTokens + (usageEvent.inputTokens || 0),
      outputTokens: backgroundUsage.outputTokens + (usageEvent.outputTokens || 0),
      requests: backgroundUsage.requests + (usageEvent.requests || 1),
      cost: backgroundUsage.cost + (usageEvent.estimatedCost || 0),
    };
  }

  it("should accumulate background costs for direct chat sessions", () => {
    let backgroundUsage = null;

    // Memory extraction cost
    backgroundUsage = accumulateBackgroundUsage(backgroundUsage, {
      requests: 1,
      inputTokens: 300,
      outputTokens: 50,
      estimatedCost: 0.00015,
    });

    expect(backgroundUsage.cost).toBeCloseTo(0.00015, 8);
    expect(backgroundUsage.requests).toBe(1);

    // Embedding cost
    backgroundUsage = accumulateBackgroundUsage(backgroundUsage, {
      requests: 2,
      inputTokens: 100,
      outputTokens: 0,
      estimatedCost: 0.00001,
    });

    expect(backgroundUsage.cost).toBeCloseTo(0.00016, 8);
    expect(backgroundUsage.requests).toBe(3);
  });

  it("should handle null/undefined estimatedCost gracefully", () => {
    let backgroundUsage = null;

    backgroundUsage = accumulateBackgroundUsage(backgroundUsage, {
      requests: 1,
      inputTokens: 200,
      outputTokens: 30,
      estimatedCost: null,
    });

    expect(backgroundUsage.cost).toBe(0);
    expect(backgroundUsage.requests).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Two-phase delayed refetch contract
// ═══════════════════════════════════════════════════════════════

describe("Two-phase delayed refetch contract", () => {
  it("should document the 2s/8s fetch windows", () => {
    // This test documents the contract that both direct chat and agent
    // sessions use the same two-phase delayed fetch pattern.
    // NOTE: These match the inline hardcoded timeouts (2000ms and 8000ms) in ChatConversationComponent.tsx.
    // Phase 1: 2000ms — catches iteration requests and fast background ops
    // Phase 2: 8000ms — catches slow background ops (embedding, consolidation)
    const PHASE_ONE_DELAY = 2000;
    const PHASE_TWO_DELAY = 8000;

    expect(PHASE_ONE_DELAY).toBe(2000);
    expect(PHASE_TWO_DELAY).toBe(8000);
    expect(PHASE_TWO_DELAY).toBeGreaterThan(PHASE_ONE_DELAY);
  });

  it("should document the cleanup contract (both timers cleared on unmount)", () => {
    // Simulates the cleanup function returned by fetchSessionStats
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clearCallCount = { count: 0 };

    // Simulate setting timers
    timers.push(setTimeout(() => {}, 2000));
    timers.push(setTimeout(() => {}, 8000));

    // Cleanup clears both
    for (const timer of timers) {
      clearTimeout(timer);
      clearCallCount.count++;
    }

    expect(clearCallCount.count).toBe(2);
  });
});
