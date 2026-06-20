import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import SSEManager from "../src/services/SSEManager";

class MockEventSource {
  static instancesList: MockEventSource[] = [];

  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instancesList.push(this);
  }

  static clearMockInstances(): void {
    MockEventSource.instancesList = [];
  }

  simulateIncomingMessage(payload: unknown): void {
    if (this.onmessage) {
      this.onmessage({
        data: JSON.stringify(payload),
      } as MessageEvent);
    }
  }
}

describe("SSEManager", () => {
  beforeEach(() => {
    MockEventSource.clearMockInstances();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should create a single EventSource connection for a unique URL", () => {
    const firstCallback = vi.fn();
    const subscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      firstCallback,
    );

    expect(MockEventSource.instancesList).toHaveLength(1);
    expect(MockEventSource.instancesList[0].url).toBe(
      "https://api.prism.rod.dev/stream",
    );

    subscription.unsubscribe();
  });

  it("should reuse the existing EventSource connection for multiple subscribers to the same URL", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const firstSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      firstCallback,
    );
    const secondSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      secondCallback,
    );

    expect(MockEventSource.instancesList).toHaveLength(1);

    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });

  it("should fan out messages to all active subscribers", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const firstSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      firstCallback,
    );
    const secondSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      secondCallback,
    );

    const testPayload = { status: "running", progress: 0.5 };
    MockEventSource.instancesList[0].simulateIncomingMessage(testPayload);

    expect(firstCallback).toHaveBeenCalledWith(testPayload);
    expect(secondCallback).toHaveBeenCalledWith(testPayload);

    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });

  it("should continue fanning out to other subscribers if one subscriber throws an error", () => {
    const failingCallback = vi.fn().mockImplementation(() => {
      throw new Error("Callback failed");
    });
    const succeedingCallback = vi.fn();

    const firstSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      failingCallback,
    );
    const secondSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      succeedingCallback,
    );

    const testPayload = { updated: true };
    MockEventSource.instancesList[0].simulateIncomingMessage(testPayload);

    expect(failingCallback).toHaveBeenCalledWith(testPayload);
    expect(succeedingCallback).toHaveBeenCalledWith(testPayload);

    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });

  it("should ignore invalid JSON payloads without throwing errors", () => {
    const successCallback = vi.fn();
    const subscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      successCallback,
    );

    const mockSource = MockEventSource.instancesList[0];
    if (mockSource.onmessage) {
      expect(() => {
        mockSource.onmessage!({
          data: "{invalid-json-string}",
        } as MessageEvent);
      }).not.toThrow();
    }

    expect(successCallback).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it("should not close EventSource connection if some subscribers remain", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const firstSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      firstCallback,
    );
    const secondSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      secondCallback,
    );

    const mockSource = MockEventSource.instancesList[0];

    firstSubscription.unsubscribe();
    expect(mockSource.close).not.toHaveBeenCalled();

    secondSubscription.unsubscribe();
  });

  it("should close EventSource connection and delete pool when the last subscriber unsubscribes", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const firstSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      firstCallback,
    );
    const secondSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      secondCallback,
    );

    const mockSource = MockEventSource.instancesList[0];

    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();

    expect(mockSource.close).toHaveBeenCalledTimes(1);

    // Subscribing again to the same URL should create a new EventSource
    const thirdSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream",
      vi.fn(),
    );
    expect(MockEventSource.instancesList).toHaveLength(2);

    thirdSubscription.unsubscribe();
  });

  it("should create separate EventSource connections for different URLs", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const firstSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream-a",
      firstCallback,
    );
    const secondSubscription = SSEManager.subscribe(
      "https://api.prism.rod.dev/stream-b",
      secondCallback,
    );

    expect(MockEventSource.instancesList).toHaveLength(2);
    expect(MockEventSource.instancesList[0].url).toBe("https://api.prism.rod.dev/stream-a");
    expect(MockEventSource.instancesList[1].url).toBe("https://api.prism.rod.dev/stream-b");

    MockEventSource.instancesList[0].simulateIncomingMessage({ source: "a" });
    expect(firstCallback).toHaveBeenCalledWith({ source: "a" });
    expect(secondCallback).not.toHaveBeenCalled();

    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });
});
