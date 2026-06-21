import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import SoundService from "../src/services/SoundService";

// --- Web Audio API Mocks ---

class MockAudioBuffer {
  sampleRate: number;
  length: number;
  duration: number;
  numberOfChannels: number;
  private channelData: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number) {
    return this.channelData[channel];
  }
}

class MockAudioNode {
  connect(target: any, output?: number, input?: number) {}
  disconnect() {}
}

class MockAudioParam {
  value = 1;
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: any = null;
  playbackRate = new MockAudioParam();
  start(when?: number) {}
  stop(when?: number) {}
}

class MockAudioContext {
  state = "suspended";
  sampleRate = 44100;
  destination = {};

  async resume() {
    this.state = "running";
  }

  async close() {
    this.state = "closed";
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }

  createChannelSplitter(numberOfOutputs?: number) {
    return new MockAudioNode();
  }

  createChannelMerger(numberOfInputs?: number) {
    return new MockAudioNode();
  }

  createGain() {
    return new MockGainNode();
  }
}

describe("SoundService", () => {
  beforeEach(() => {
    Object.defineProperty(global, "AudioContext", {
      value: MockAudioContext,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "AudioContext", {
      value: MockAudioContext,
      writable: true,
      configurable: true,
    });
    // Set window.innerWidth for spatial calculations
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    SoundService.dispose();
  });

  it("should initialize AudioContext and cache all buffers", () => {
    // Initial plays (creates buffers)
    SoundService.playHover();
    SoundService.playClick();
    SoundService.playHoverButton();
    SoundService.playClickButton();
    SoundService.playGenerationStart();
    SoundService.playGenerationEnd();

    // Subsequent plays (uses cached buffers)
    SoundService.playHover();
    SoundService.playClick();
    SoundService.playHoverButton();
    SoundService.playClickButton();
    SoundService.playGenerationStart();
    SoundService.playGenerationEnd();
  });

  it("should support webkitAudioContext fallback for Safari compatibility", () => {
    // Force AudioContext to be undefined
    Object.defineProperty(global, "AudioContext", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    // Define webkitAudioContext instead
    Object.defineProperty(window, "webkitAudioContext", {
      value: MockAudioContext,
      writable: true,
      configurable: true,
    });

    SoundService.playHover();
  });

  it("should support explicit left/right panning values", () => {
    SoundService.playHover({ left: 20, right: 80 });
    SoundService.playClick({ left: 0, right: 100 });
  });

  it("should parse element bounds to derive spatial panning", () => {
    const mockElement = {
      getBoundingClientRect: () => ({
        left: 200,
        width: 100,
        top: 0,
        right: 300,
        bottom: 50,
      }),
    };
    const mockEvent = {
      target: mockElement,
    } as unknown as Event;

    SoundService.playHover({ event: mockEvent });
  });

  it("should fallback to currentTarget bounding rect if target is missing it", () => {
    const mockElement = {
      getBoundingClientRect: () => ({
        left: 800,
        width: 100,
        top: 0,
        right: 900,
        bottom: 50,
      }),
    };
    const mockEvent = {
      target: null,
      currentTarget: mockElement,
    } as unknown as Event;

    SoundService.playHover({ event: mockEvent });
  });

  it("should fallback to centered panning if target lacks getBoundingClientRect", () => {
    const mockEvent = {
      target: {},
    } as unknown as Event;

    SoundService.playHover({ event: mockEvent });
  });

  it("should generate interactive listeners that route plays", () => {
    const clickSpy = vi.fn();
    const enterSpy = vi.fn();
    const handlers = SoundService.interactive(clickSpy, enterSpy);

    const mockEvent = {
      nativeEvent: {} as any,
    } as any;

    handlers.onMouseEnter(mockEvent);
    expect(enterSpy).toHaveBeenCalled();

    handlers.onClick(mockEvent);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("should dispose resources and close the AudioContext cleanly", () => {
    SoundService.playHover();
    SoundService.dispose();
  });
});
