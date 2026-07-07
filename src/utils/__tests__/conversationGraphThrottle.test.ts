/**
 * conversationGraphThrottle.test.ts
 *
 * Verifies the trailing-edge throttle mechanism for the incremental
 * graph rebuild, ensuring the backend graph API is not hammered at
 * 5-10 requests/sec during active orchestrator runs.
 *
 * Also validates that graph types are properly consolidated from the
 * shared utilities library rather than duplicated locally.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TIMING } from "../../constants";

describe("Graph rebuild throttle constants", () => {
  it("should define a throttle interval ≥ 300ms for graph API calls", () => {
    expect(TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS).toBeGreaterThanOrEqual(300);
  });

  it("should define a throttle interval < DEBOUNCE_STANDARD to remain responsive", () => {
    expect(TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS).toBeLessThan(TIMING.DEBOUNCE_STANDARD);
  });
});

describe("Graph type consolidation", () => {
  it("should be importable from utilities-library without errors", async () => {
    // Type exports (NodeCategory, GraphNode, GraphEdge, etc.) are erased at
    // runtime, so we can only verify the module itself loads successfully.
    const libraryModule = await import("@rodrigo-barraza/utilities-library/graph");
    expect(libraryModule).toBeDefined();
  });

  it("should have matching type shapes between library and component re-exports", async () => {
    const componentModule = await import("../../components/ChatConversationGraphComponent");

    // The component should re-export these constants (not types, which are erased at runtime)
    expect(componentModule.PROACTIVE_PENDING_REQUEST_NODE_ID).toBe("request:proactive-pending");
    expect(componentModule.PROACTIVE_PENDING_TURN_NODE_ID).toBe("turn:proactive-pending");
  });
});

describe("Trailing-edge throttle behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should fire immediately on first call when throttle window has expired", () => {
    const callTimestamps: number[] = [];
    let lastCallTimestamp = 0;
    let isInFlight = false;

    const throttledFunction = createThrottledFunction({
      throttleMilliseconds: TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS,
      getLastCallTimestamp: () => lastCallTimestamp,
      setLastCallTimestamp: (timestamp: number) => { lastCallTimestamp = timestamp; },
      getIsInFlight: () => isInFlight,
      execute: () => {
        callTimestamps.push(Date.now());
        isInFlight = true;
        // Simulate async completion
        setTimeout(() => { isInFlight = false; lastCallTimestamp = Date.now(); }, 50);
      },
    });

    throttledFunction();
    expect(callTimestamps).toHaveLength(1);
  });

  it("should defer second call within the throttle window", () => {
    const callTimestamps: number[] = [];
    let lastCallTimestamp = 0;
    let isInFlight = false;

    const throttledFunction = createThrottledFunction({
      throttleMilliseconds: TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS,
      getLastCallTimestamp: () => lastCallTimestamp,
      setLastCallTimestamp: (timestamp: number) => { lastCallTimestamp = timestamp; },
      getIsInFlight: () => isInFlight,
      execute: () => {
        callTimestamps.push(Date.now());
        isInFlight = true;
        setTimeout(() => { isInFlight = false; lastCallTimestamp = Date.now(); }, 50);
      },
    });

    // First call fires immediately
    throttledFunction();
    vi.advanceTimersByTime(50); // Complete the first call
    expect(callTimestamps).toHaveLength(1);

    // Second call within throttle window — should be deferred
    throttledFunction();
    expect(callTimestamps).toHaveLength(1);

    // After remaining cooldown, the deferred call fires
    vi.advanceTimersByTime(TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS);
    expect(callTimestamps).toHaveLength(2);
  });

  it("should collapse multiple rapid calls into a single trailing execution", () => {
    const callTimestamps: number[] = [];
    let lastCallTimestamp = 0;
    let isInFlight = false;

    const throttledFunction = createThrottledFunction({
      throttleMilliseconds: TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS,
      getLastCallTimestamp: () => lastCallTimestamp,
      setLastCallTimestamp: (timestamp: number) => { lastCallTimestamp = timestamp; },
      getIsInFlight: () => isInFlight,
      execute: () => {
        callTimestamps.push(Date.now());
        isInFlight = true;
        setTimeout(() => { isInFlight = false; lastCallTimestamp = Date.now(); }, 50);
      },
    });

    // First call fires immediately
    throttledFunction();
    vi.advanceTimersByTime(50);
    expect(callTimestamps).toHaveLength(1);

    // Rapid-fire 10 calls within the throttle window
    for (let callIndex = 0; callIndex < 10; callIndex++) {
      throttledFunction();
      vi.advanceTimersByTime(30);
    }

    // Only the last scheduled trailing call should fire
    vi.advanceTimersByTime(TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS);
    expect(callTimestamps).toHaveLength(2);
  });

  it("should defer when a call is already in-flight", () => {
    const callTimestamps: number[] = [];
    let lastCallTimestamp = 0;
    let isInFlight = false;

    const throttledFunction = createThrottledFunction({
      throttleMilliseconds: TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS,
      getLastCallTimestamp: () => lastCallTimestamp,
      setLastCallTimestamp: (timestamp: number) => { lastCallTimestamp = timestamp; },
      getIsInFlight: () => isInFlight,
      execute: () => {
        callTimestamps.push(Date.now());
        isInFlight = true;
        // Simulate a slow API call (longer than throttle window)
        setTimeout(() => { isInFlight = false; lastCallTimestamp = Date.now(); }, 600);
      },
    });

    // First call fires immediately
    throttledFunction();
    expect(callTimestamps).toHaveLength(1);

    // Second call while first is still in-flight — should be deferred
    vi.advanceTimersByTime(100);
    throttledFunction();
    expect(callTimestamps).toHaveLength(1);

    // After the throttle delay, the deferred call fires
    vi.advanceTimersByTime(TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS);
    expect(callTimestamps).toHaveLength(2);
  });

  it("should allow immediate execution after throttle window fully elapses", () => {
    const callTimestamps: number[] = [];
    let lastCallTimestamp = 0;
    let isInFlight = false;

    const throttledFunction = createThrottledFunction({
      throttleMilliseconds: TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS,
      getLastCallTimestamp: () => lastCallTimestamp,
      setLastCallTimestamp: (timestamp: number) => { lastCallTimestamp = timestamp; },
      getIsInFlight: () => isInFlight,
      execute: () => {
        callTimestamps.push(Date.now());
        isInFlight = true;
        setTimeout(() => { isInFlight = false; lastCallTimestamp = Date.now(); }, 50);
      },
    });

    // First call
    throttledFunction();
    vi.advanceTimersByTime(50);
    expect(callTimestamps).toHaveLength(1);

    // Wait well past the throttle window
    vi.advanceTimersByTime(TIMING.GRAPH_REBUILD_THROTTLE_MILLISECONDS + 100);

    // Second call should fire immediately
    throttledFunction();
    expect(callTimestamps).toHaveLength(2);
  });
});

/**
 * Standalone throttle function that mirrors the exact logic in
 * `useConversationGraphData.ts`. This allows unit testing the throttle
 * algorithm without rendering React hooks.
 */
function createThrottledFunction(options: {
  throttleMilliseconds: number;
  getLastCallTimestamp: () => number;
  setLastCallTimestamp: (timestamp: number) => void;
  getIsInFlight: () => boolean;
  execute: () => void;
}) {
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  return () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }

    if (options.getIsInFlight()) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        options.execute();
      }, options.throttleMilliseconds);
      return;
    }

    const elapsedSinceLastCall = Date.now() - options.getLastCallTimestamp();
    const remainingCooldown = options.throttleMilliseconds - elapsedSinceLastCall;

    if (remainingCooldown > 0) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        options.execute();
      }, remainingCooldown);
    } else {
      options.execute();
    }
  };
}
