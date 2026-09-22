/**
 * A live viewer socket tells prism-service whether its page is visible —
 * on open and on every visibilitychange — until reporting is stopped.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { reportViewerVisibility } from "../viewerVisibility";

class FakeSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;
  send = vi.fn();
  open() {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

const sent = (socket: FakeSocket) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));

describe("reportViewerVisibility", () => {
  afterEach(() => setVisibility("visible"));

  it("reports on open and on each visibility change, and stops when told", () => {
    const socket = new FakeSocket();
    const stop = reportViewerVisibility(socket as unknown as WebSocket);
    expect(socket.send).not.toHaveBeenCalled();

    socket.open();
    setVisibility("hidden");
    setVisibility("visible");
    expect(sent(socket)).toEqual([
      { type: "visibility", hidden: false },
      { type: "visibility", hidden: true },
      { type: "visibility", hidden: false },
    ]);

    stop();
    setVisibility("hidden");
    expect(socket.send).toHaveBeenCalledTimes(3);
  });

  it("never sends on a socket that is not open", () => {
    const socket = new FakeSocket();
    reportViewerVisibility(socket as unknown as WebSocket);
    setVisibility("hidden");
    expect(socket.send).not.toHaveBeenCalled();
  });
});
