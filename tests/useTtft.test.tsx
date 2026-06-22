import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import useTimeToFirstToken from "../src/hooks/useTtft";
import type { ConversationTokenStats } from "../src/utils/utilities";

function TestTimeToFirstTokenComponent({
  initialStats,
  initialNeedsTicker,
}: {
  initialStats: Partial<ConversationTokenStats> | null;
  initialNeedsTicker: boolean;
}) {
  const [stats, setStats] = useState<Partial<ConversationTokenStats> | null>(initialStats);
  const [needsTicker, setNeedsTicker] = useState<boolean>(initialNeedsTicker);
  const [perfNow, setPerfNow] = useState<number>(1000);

  const { liveTimeToFirstToken, isLiveTimeToFirstToken } = useTimeToFirstToken(stats, perfNow, needsTicker);

  return (
    <div>
      <div data-testid="live-ttft">{liveTimeToFirstToken === null ? "null" : liveTimeToFirstToken.toFixed(3)}</div>
      <div data-testid="is-live-ttft">{String(isLiveTimeToFirstToken)}</div>
      
      <button data-testid="set-prefill" onClick={() => setStats({ liveProcessingPhase: "prefilling", liveProcessingStartTime: 500 })}>
        Set Prefilling
      </button>
      <button data-testid="set-generating" onClick={() => setStats({ liveProcessingPhase: "generating", liveProcessingStartTime: 500 })}>
        Set Generating
      </button>
      <button data-testid="set-samples-1" onClick={() => setStats({ liveTtftSamples: [0.5, 0.7] })}>
        Set Samples 1
      </button>
      <button data-testid="set-samples-2" onClick={() => setStats({ liveTtftSamples: [0.5, 0.7, 1.2] })}>
        Set Samples 2
      </button>
      <button data-testid="set-needs-ticker" onClick={() => setNeedsTicker(true)}>
        Set Ticker True
      </button>
      <button data-testid="set-needs-ticker-false" onClick={() => setNeedsTicker(false)}>
        Set Ticker False
      </button>
      <button data-testid="update-perf" onClick={() => setPerfNow(1500)}>
        Update Perf
      </button>
      <button data-testid="set-phase-only" onClick={() => setStats({ liveProcessingPhase: "some-other-phase" })}>
        Set Phase Only
      </button>
    </div>
  );
}

describe("useTtft Hook", () => {
  it("should initialize with null value and false live state when inactive", () => {
    render(<TestTimeToFirstTokenComponent initialStats={null} initialNeedsTicker={false} />);
    expect(screen.getByTestId("live-ttft").textContent).toBe("null");
    expect(screen.getByTestId("is-live-ttft").textContent).toBe("false");
  });

  it("should calculate live client-side TTFT during prefilling phase when active", () => {
    render(<TestTimeToFirstTokenComponent initialStats={null} initialNeedsTicker={true} />);
    
    // Set phase to prefilling with startTime = 500. perfNow is 1000.
    // Expected TTFT: (1000 - 500) / 1000 = 0.500
    fireEvent.click(screen.getByTestId("set-prefill"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.500");
    expect(screen.getByTestId("is-live-ttft").textContent).toBe("true");

    // Update perfNow to 1500. Expected TTFT: (1500 - 500) / 1000 = 1.000
    fireEvent.click(screen.getByTestId("update-perf"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("1.000");
  });

  it("should latch final value and disable live state when phase transitions away from prefilling", () => {
    render(<TestTimeToFirstTokenComponent initialStats={null} initialNeedsTicker={true} />);

    // Enter prefilling
    fireEvent.click(screen.getByTestId("set-prefill"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.500");
    expect(screen.getByTestId("is-live-ttft").textContent).toBe("true");

    // Transition to generating phase
    fireEvent.click(screen.getByTestId("set-generating"));
    // Value should be latched at 0.500, but isLiveTtft becomes false
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.500");
    expect(screen.getByTestId("is-live-ttft").textContent).toBe("false");

    // Dispatch generating again to hit line 81 return prev (no change)
    fireEvent.click(screen.getByTestId("set-generating"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.500");

    // Change phase again to verify latch preservation
    fireEvent.click(screen.getByTestId("set-phase-only"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.500");
  });

  it("should calculate running average of server-computed TTFT samples", () => {
    render(<TestTimeToFirstTokenComponent initialStats={null} initialNeedsTicker={true} />);

    // Provide 2 samples: [0.5, 0.7]. Average = 0.600
    fireEvent.click(screen.getByTestId("set-samples-1"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.600");
    expect(screen.getByTestId("is-live-ttft").textContent).toBe("false");

    // Provide 3 samples: [0.5, 0.7, 1.2]. Average = 0.800
    fireEvent.click(screen.getByTestId("set-samples-2"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.800");
  });

  it("should reset state when needsTicker is cleared (turn completes)", () => {
    render(<TestTimeToFirstTokenComponent initialStats={null} initialNeedsTicker={true} />);

    // Set samples to get a value
    fireEvent.click(screen.getByTestId("set-samples-1"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("0.600");

    // Disable ticker
    fireEvent.click(screen.getByTestId("set-needs-ticker-false"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("null");

    // Trigger disable ticker again (should return early since it's already initial state)
    fireEvent.click(screen.getByTestId("set-needs-ticker-false"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("null");
  });

  it("should set phase only on initial pass if no data exists yet", () => {
    render(<TestTimeToFirstTokenComponent initialStats={null} initialNeedsTicker={true} />);
    fireEvent.click(screen.getByTestId("set-phase-only"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("null");

    // Redundant phase dispatch
    fireEvent.click(screen.getByTestId("set-phase-only"));
    expect(screen.getByTestId("live-ttft").textContent).toBe("null");
  });
});
