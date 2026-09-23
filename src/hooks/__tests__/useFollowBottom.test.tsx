/**
 * useFollowBottom with a stubbed scroller: jsdom lays nothing out, so the
 * scroll position and sizes come from `metrics`, the test fires the scroll
 * events, and scrolling the end into view lands on the bottom.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import useFollowBottom from "../useFollowBottom";

const metrics = { scrollTop: 0, scrollHeight: 10_000, clientHeight: 600 };
const scrollIntoView = vi.fn(() => {
  metrics.scrollTop = metrics.scrollHeight - metrics.clientHeight;
});
let stickToBottom: ((_behavior?: ScrollBehavior) => void) | null = null;

function stubScroller(element: HTMLElement) {
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => metrics.scrollTop,
    set: (value: number) => {
      metrics.scrollTop = value;
    },
  });
  Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => metrics.scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, get: () => metrics.clientHeight });
}

function Transcript({ trigger }: { trigger: number }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const follow = useFollowBottom(scrollRef, endRef, [trigger]);
  useLayoutEffect(() => {
    stickToBottom = follow.stickToBottom;
  });
  return (
    <div
      data-testid="scroller"
      ref={(element) => {
        if (element) stubScroller(element);
        scrollRef.current = element;
      }}
    >
      <div
        ref={(element) => {
          if (element) element.scrollIntoView = scrollIntoView;
          endRef.current = element;
        }}
      />
    </div>
  );
}

/** Move the stubbed scroller and tell the listener. */
function scrollTo(element: HTMLElement, top: number) {
  metrics.scrollTop = top;
  fireEvent.scroll(element);
}

const behaviors = () => scrollIntoView.mock.calls.map((call) => (call as unknown as [ScrollIntoViewOptions])[0].behavior);

beforeEach(() => {
  metrics.scrollTop = 9_400; // at the bottom: 10,000 − 600
  metrics.scrollHeight = 10_000;
  metrics.clientHeight = 600;
  scrollIntoView.mockClear();
});

afterEach(() => {
  stickToBottom = null;
});

describe("useFollowBottom", () => {
  it("glides to a bottom a line or two away, while a reply streams", () => {
    const view = render(<Transcript trigger={0} />);
    scrollIntoView.mockClear();
    metrics.scrollHeight += 60;
    view.rerender(<Transcript trigger={1} />);
    expect(behaviors()).toEqual(["smooth"]);
  });

  it("jumps to a bottom that moved far: a smooth scroll that long would read as the user leaving", () => {
    const view = render(<Transcript trigger={0} />);
    scrollIntoView.mockClear();
    // A burst lands: the output a reconnect recovered, 3,000 px of it.
    metrics.scrollHeight += 3_000;
    view.rerender(<Transcript trigger={1} />);
    expect(behaviors()).toEqual(["instant"]);
    // At the bottom again, the next lines glide.
    metrics.scrollHeight += 60;
    view.rerender(<Transcript trigger={2} />);
    expect(behaviors()).toEqual(["instant", "smooth"]);
  });

  it("stops following once the user scrolls away, and follows again at the bottom", () => {
    const view = render(<Transcript trigger={0} />);
    const scroller = view.getByTestId("scroller");
    scrollIntoView.mockClear();
    scrollTo(scroller, 5_000);
    view.rerender(<Transcript trigger={1} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    scrollTo(scroller, 9_300);
    view.rerender(<Transcript trigger={2} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("follows again on stickToBottom, jumping back to the bottom", () => {
    const view = render(<Transcript trigger={0} />);
    scrollTo(view.getByTestId("scroller"), 2_000);
    scrollIntoView.mockClear();
    act(() => stickToBottom?.());
    view.rerender(<Transcript trigger={1} />);
    expect(behaviors()).toEqual(["instant"]);
  });
});
