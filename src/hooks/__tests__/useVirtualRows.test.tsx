/**
 * useVirtualRows with a stubbed layout: jsdom lays nothing out, so the
 * scroll container's height, scroll position and element rects come from
 * the test. Every row estimates 100 px; the viewport is 600 px.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { useCallback, useLayoutEffect, useRef } from "react";
import useVirtualRows from "../useVirtualRows";

const ROW_HEIGHT = 100;
const VIEWPORT_HEIGHT = 600;
const OVERSCAN = 200;

/** The layout the stubs report. */
const layout = {
  viewportHeight: VIEWPORT_HEIGHT,
  scrollTop: 0,
  scrollHeight: 0,
};

/** Every ResizeObserver the hook made, with what each observes. */
const observers: Array<{ callback: ResizeObserverCallback; observed: Set<Element> }> = [];

/** Report `target` at `height` to the observer that watches it. */
function resize(target: Element, height: number) {
  const observer = observers.find((candidate) => candidate.observed.has(target));
  if (!observer) throw new Error("nothing observes that element");
  observer.callback(
    [{ target, borderBoxSize: [{ blockSize: height, inlineSize: 0 }] } as unknown as ResizeObserverEntry],
    {} as ResizeObserver,
  );
}
const restorers: Array<() => void> = [];

function stubProperty(target: object, key: string, descriptor: PropertyDescriptor) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  restorers.push(() => {
    if (original) Object.defineProperty(target, key, original);
    else delete (target as Record<string, unknown>)[key];
  });
}

beforeEach(() => {
  layout.viewportHeight = VIEWPORT_HEIGHT;
  layout.scrollTop = 0;
  layout.scrollHeight = 0;
  observers.length = 0;
  const isScroller = (element: Element) => (element as HTMLElement).dataset?.testid === "scroller";
  stubProperty(HTMLElement.prototype, "clientHeight", {
    get(this: HTMLElement) {
      return isScroller(this) ? layout.viewportHeight : 0;
    },
  });
  stubProperty(HTMLElement.prototype, "scrollTop", {
    get(this: HTMLElement) {
      return isScroller(this) ? layout.scrollTop : 0;
    },
    set(this: HTMLElement, value: number) {
      if (isScroller(this)) layout.scrollTop = value;
    },
  });
  stubProperty(HTMLElement.prototype, "scrollHeight", {
    get(this: HTMLElement) {
      return isScroller(this) ? layout.scrollHeight : 0;
    },
  });
  // The rows element sits at the top of the scroll content; a row at its
  // index × 100 (the tests grow none but the one they measure).
  stubProperty(Element.prototype, "getBoundingClientRect", {
    value(this: HTMLElement) {
      const top = isScroller(this)
        ? 0
        : this.dataset?.testid === "rows"
          ? -layout.scrollTop
          : this.dataset?.index !== undefined
            ? Number(this.dataset.index) * ROW_HEIGHT - layout.scrollTop
            : 0;
      const height = this.dataset?.index !== undefined ? ROW_HEIGHT : 0;
      return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) };
    },
  });
  stubProperty(globalThis, "ResizeObserver", {
    value: class {
      private readonly entry: { callback: ResizeObserverCallback; observed: Set<Element> };
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, observed: new Set() };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.observed.add(target);
      }
      unobserve(target: Element) {
        this.entry.observed.delete(target);
      }
      disconnect() {
        this.entry.observed.clear();
      }
    },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
});

afterEach(() => {
  for (const restore of restorers.splice(0).reverse()) restore();
  vi.unstubAllGlobals();
});

let latest: ReturnType<typeof useVirtualRows> | null = null;

/** Rows of 100 px in a 600 px viewport; call `layoutFor(count)` before rendering it. */
function Rows({ count, windowed = true }: { count: number; windowed?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const getKey = useCallback((index: number) => `row-${index}`, []);
  const estimateSize = useCallback(() => ROW_HEIGHT, []);
  const virtual = useVirtualRows({
    count,
    getKey,
    estimateSize,
    scrollElementRef: windowed ? scrollRef : null,
    rowsElementRef: rowsRef,
    overscanPixels: OVERSCAN,
  });
  useLayoutEffect(() => {
    latest = virtual;
  });
  return (
    <div ref={scrollRef} data-testid="scroller">
      <div ref={rowsRef} data-testid="rows">
        {Array.from({ length: virtual.end - virtual.start }, (_, offset) => {
          const index = virtual.start + offset;
          return <div key={index} ref={virtual.measureRow(`row-${index}`)} data-index={index} />;
        })}
      </div>
    </div>
  );
}

function layoutFor(count: number) {
  layout.scrollHeight = count * ROW_HEIGHT;
}

async function flushFrames() {
  await act(async () => {
    await new Promise((resolveFrame) => setTimeout(resolveFrame, 10));
  });
}

function mountedCount(container: HTMLElement) {
  return container.querySelectorAll("[data-index]").length;
}

describe("useVirtualRows", () => {
  it("renders every row without windowing, and without layout", async () => {
    layoutFor(500);
    const plain = render(<Rows count={500} windowed={false} />);
    expect(mountedCount(plain.container)).toBe(500);
    plain.unmount();
    layout.viewportHeight = 0;
    layoutFor(500);
    const hidden = render(<Rows count={500} />);
    await flushFrames();
    expect(mountedCount(hidden.container)).toBe(500);
    expect(latest?.isWindowed).toBe(false);
  });

  it("mounts the tail while the view is pinned to the bottom, and pads for the rest", async () => {
    layoutFor(1_000);
    const view = render(<Rows count={1_000} />);
    await flushFrames();
    const virtual = latest!;
    expect(virtual.isWindowed).toBe(true);
    expect(virtual.end).toBe(1_000);
    // The viewport (600) plus the overscan above it (200): 8 rows, then one partly in.
    expect(mountedCount(view.container)).toBeLessThanOrEqual(10);
    expect(virtual.paddingTop + (virtual.end - virtual.start) * ROW_HEIGHT + virtual.paddingBottom).toBe(1_000 * ROW_HEIGHT);
  });

  it("moves the window with the scroll position once the user scrolls away from the bottom", async () => {
    layoutFor(1_000);
    const view = render(<Rows count={1_000} />);
    await flushFrames();
    const scroller = view.getByTestId("scroller");
    await act(async () => {
      layout.scrollTop = 25_000;
      fireEvent.scroll(scroller);
    });
    await flushFrames();
    const virtual = latest!;
    // Rows 248–257 cover 24,800–25,800: the viewport, and 200 px either side.
    expect(virtual.start).toBe(248);
    expect(virtual.end).toBe(258);
    expect(virtual.paddingTop).toBe(248 * ROW_HEIGHT);
  });

  it("keeps what the user reads in place when a row above the viewport grows", async () => {
    layoutFor(1_000);
    const view = render(<Rows count={1_000} />);
    await flushFrames();
    const scroller = view.getByTestId("scroller");
    await act(async () => {
      layout.scrollTop = 25_000;
      fireEvent.scroll(scroller);
    });
    await flushFrames();
    const rowAbove = view.container.querySelector<HTMLElement>(`[data-index='${latest!.start}']`)!;
    expect(rowAbove.getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
    await act(async () => resize(rowAbove, ROW_HEIGHT + 50));
    expect(layout.scrollTop).toBe(25_050);
  });

  it("scrolls a row that is not mounted to the top of the viewport", async () => {
    layoutFor(1_000);
    const view = render(<Rows count={1_000} />);
    await flushFrames();
    const scrollTo = vi.fn(({ top }: { top: number }) => {
      layout.scrollTop = top;
    });
    view.getByTestId("scroller").scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
    await act(async () => latest!.scrollToIndex(120));
    expect(scrollTo).toHaveBeenCalledWith({ top: 120 * ROW_HEIGHT, behavior: "auto" });
  });
});
