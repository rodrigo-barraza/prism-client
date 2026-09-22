import { describe, it, expect, vi } from "vitest";

vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  PRISM_SERVICE_URL: "http://prism.test",
  PRISM_WEBSOCKET_URL: undefined,
}));

import PrismService from "../PrismService";

describe("PrismService without a WebSocket URL", () => {
  it("reports the unconfigured state instead of failing silently", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const states: string[] = [];
    const cleanup = PrismService.subscribeToAutoResponse("conv-1", {}, {
      onStateChange: (state) => states.push(state),
    });
    expect(states).toEqual(["unconfigured"]);
    cleanup();

    await expect(
      PrismService.followLiveTurn("conv-1", {}, {
        isTurnRunning: async () => true,
        timeoutMilliseconds: 1_000,
      }),
    ).resolves.toBe("unconfigured");
    expect(PrismService.liveSocketUrl()).toBeNull();
  });
});
