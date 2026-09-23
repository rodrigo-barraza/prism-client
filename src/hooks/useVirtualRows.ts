"use client";

/**
 * Windowing for a long list of variable-height rows that scroll inside a
 * container the list does not own (the chat transcript, the admin viewer).
 *
 * Only the rows near the viewport mount: a range [start, end) that covers
 * the viewport plus `overscanPixels` above and below. The rows element
 * carries the rows it does not mount as padding, so the scroll height and
 * every mounted row's position are what they would be with all rows mounted.
 *
 * Rows sit back to back — spacing belongs inside a row (its padding), so a
 * row's measured height is all the room it takes.
 *
 * Heights. A row is measured while it is mounted (ResizeObserver) and
 * remembered by key; a row never mounted counts at `estimateSize(index)`.
 * When a row entirely above the viewport changes height — measured for the
 * first time as the user scrolls up into it, an image loading — the scroll
 * position moves by the same amount, so what the user is reading stays put.
 * A view pinned to the bottom stays pinned, and while it is pinned the
 * window is the tail, wherever the scroll position has got to so far.
 *
 * Without layout (jsdom, a container that never had a height) every row
 * renders: tests, snapshots and find-in-page see the whole list.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

/** Rows the list mounts before it has measured its scroll container: the tail. */
const INITIAL_ROW_COUNT = 40;
/** Within this many pixels of the bottom, the view counts as pinned there. */
export const PINNED_TO_BOTTOM_PIXELS = 150;
/** A programmatic smooth scroll holds the window still this long. */
const SMOOTH_SCROLL_HOLD_MILLISECONDS = 700;
/** Measured heights kept per list before the oldest are forgotten. */
const MAX_REMEMBERED_HEIGHTS = 20_000;

export interface VirtualRowsOptions {
  /** How many rows the list has. */
  count: number;
  /** A row's measurement key — the same row keeps it across renders. */
  getKey: (_index: number) => string;
  /** A row's height before it is measured. */
  estimateSize: (_index: number) => number;
  /** The element the list scrolls in. Absent: no windowing, every row renders. */
  scrollElementRef?: RefObject<HTMLElement | null> | null;
  /** The element holding the rows. It takes the rows it does not mount as padding. */
  rowsElementRef: RefObject<HTMLElement | null>;
  /** Pixels of rows mounted beyond each edge of the viewport. */
  overscanPixels?: number;
}

export interface ScrollToRowOptions {
  /** Added to the row's top (negative: stop short of it). */
  offset?: number;
  behavior?: ScrollBehavior;
  /** Align this element inside the row instead of the row itself. */
  selector?: string;
}

export interface VirtualRows {
  /** The mounted rows: [start, end). */
  start: number;
  end: number;
  /** The unmounted rows above and below, as the rows element's padding. */
  paddingTop: number;
  paddingBottom: number;
  /** True while only a window of the rows is mounted. */
  isWindowed: boolean;
  /** Ref for the element of the row with `key` (the same function per key). */
  measureRow: (_key: string) => (_element: HTMLElement | null) => void;
  /** Bring the row at `index` to the top of the viewport. */
  scrollToIndex: (_index: number, _options?: ScrollToRowOptions) => void;
}

interface RowsLayout {
  count: number;
  keys: string[];
  indexByKey: Map<string, number>;
  /** A row's top, relative to the rows element's top. */
  tops: Float64Array;
  heights: Float64Array;
  total: number;
}

type Mode = "pending" | "window" | "all";

function buildLayout(
  count: number,
  getKey: (_index: number) => string,
  estimateSize: (_index: number) => number,
  sizes: ReadonlyMap<string, number>,
): RowsLayout {
  const keys = new Array<string>(count);
  const indexByKey = new Map<string, number>();
  const tops = new Float64Array(count);
  const heights = new Float64Array(count);
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const key = getKey(index);
    keys[index] = key;
    indexByKey.set(key, index);
    const height = sizes.get(key) ?? estimateSize(index);
    tops[index] = cursor;
    heights[index] = height;
    cursor += height;
  }
  return { count, keys, indexByKey, tops, heights, total: cursor };
}

/** First row whose bottom reaches `top`; `count` when none does. */
function firstRowEndingAfter(layout: RowsLayout, top: number): number {
  let low = 0;
  let high = layout.count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (layout.tops[middle] + layout.heights[middle] >= top) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** First row that starts below `bottom`; `count` when none does. */
function firstRowStartingAfter(layout: RowsLayout, bottom: number): number {
  let low = 0;
  let high = layout.count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (layout.tops[middle] > bottom) high = middle;
    else low = middle + 1;
  }
  return low;
}

function rangeFor(layout: RowsLayout, top: number, bottom: number): { start: number; end: number } {
  if (layout.count === 0) return { start: 0, end: 0 };
  const start = Math.min(firstRowEndingAfter(layout, top), layout.count - 1);
  const end = Math.max(firstRowStartingAfter(layout, bottom), start + 1);
  return { start, end };
}

function paddingsFor(layout: RowsLayout, start: number, end: number): { paddingTop: number; paddingBottom: number } {
  if (layout.count === 0) return { paddingTop: 0, paddingBottom: 0 };
  if (start >= end) return { paddingTop: layout.total, paddingBottom: 0 };
  const paddingTop = start > 0 ? layout.tops[start] : 0;
  const mountedBottom = layout.tops[end - 1] + layout.heights[end - 1];
  const paddingBottom = end < layout.count ? layout.total - mountedBottom : 0;
  return { paddingTop, paddingBottom };
}

export default function useVirtualRows({
  count,
  getKey,
  estimateSize,
  scrollElementRef,
  rowsElementRef,
  overscanPixels = 1200,
}: VirtualRowsOptions): VirtualRows {
  const isEnabled = !!scrollElementRef;
  const [mode, setMode] = useState<Mode>(isEnabled ? "pending" : "all");
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  // Bumped when a measured height changes: the layout is rebuilt from `sizes`.
  const [sizesVersion, setSizesVersion] = useState(0);

  const sizesRef = useRef(new Map<string, number>());
  const elementsByKeyRef = useRef(new Map<string, HTMLElement>());
  const keysByElementRef = useRef(new Map<Element, string>());
  const measureCallbacksRef = useRef(new Map<string, (_element: HTMLElement | null) => void>());
  const rowObserverRef = useRef<ResizeObserver | null>(null);
  const pinnedToBottomRef = useRef(true);
  const holdUntilRef = useRef(0);
  const holdTimerRef = useRef(0);
  const frameRef = useRef(0);

  const layout = useMemo(
    () => buildLayout(count, getKey, estimateSize, sizesRef.current),
    // `sizes` is a ref: sizesVersion says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, getKey, estimateSize, sizesVersion],
  );
  const layoutRef = useRef(layout);
  const modeRef = useRef(mode);
  useLayoutEffect(() => {
    layoutRef.current = layout;
    modeRef.current = mode;
  });

  /** The viewport's top and bottom, relative to the rows element's top. */
  const measureViewport = useCallback((): { top: number; bottom: number; height: number } | null => {
    const scrollElement = scrollElementRef?.current;
    const rowsElement = rowsElementRef.current;
    if (!scrollElement || !rowsElement) return null;
    const height = scrollElement.clientHeight;
    if (height <= 0) return null;
    const viewportTop = scrollElement.getBoundingClientRect().top + scrollElement.clientTop;
    const top = viewportTop - rowsElement.getBoundingClientRect().top;
    return { top, bottom: top + height, height };
  }, [scrollElementRef, rowsElementRef]);

  const updateRangeRef = useRef<() => void>(() => {});
  /** Recompute the mounted range from the scroll position. */
  const updateRange = useCallback(() => {
    if (modeRef.current !== "window") return;
    const remainingHold = holdUntilRef.current - performance.now();
    if (remainingHold > 0) {
      if (!holdTimerRef.current) {
        holdTimerRef.current = window.setTimeout(() => {
          holdTimerRef.current = 0;
          updateRangeRef.current();
        }, remainingHold + 16);
      }
      return;
    }
    const viewport = measureViewport();
    if (!viewport) return;
    const currentLayout = layoutRef.current;
    // Pinned: the tail — the scroll position may not have caught up with
    // rows just added (a conversation loading, a reply growing).
    const next = pinnedToBottomRef.current
      ? rangeFor(currentLayout, currentLayout.total - viewport.height - overscanPixels, currentLayout.total)
      : rangeFor(currentLayout, viewport.top - overscanPixels, viewport.bottom + overscanPixels);
    setRange((previous) => (previous.start === next.start && previous.end === next.end ? previous : next));
  }, [measureViewport, overscanPixels]);
  useLayoutEffect(() => {
    updateRangeRef.current = updateRange;
  }, [updateRange]);

  // Mode: a window once the scroll container has a height; every row while
  // it has none (no layout at all — jsdom — or hidden since it mounted).
  useLayoutEffect(() => {
    if (!isEnabled) return;
    const scrollElement = scrollElementRef?.current;
    const hasLayout = !!scrollElement && scrollElement.clientHeight > 0;
    setMode((current) => (hasLayout ? "window" : current === "window" ? current : "all"));
    if (!scrollElement || typeof ResizeObserver === "undefined") return;
    // The container gaining a height (shown, resized) switches to — or
    // re-sizes — the window.
    const containerObserver = new ResizeObserver(() => {
      if (scrollElement.clientHeight <= 0) return;
      setMode("window");
      updateRangeRef.current();
    });
    containerObserver.observe(scrollElement);
    return () => containerObserver.disconnect();
  }, [isEnabled, scrollElementRef]);

  // Scrolling moves the window; it also says whether the view is pinned to the bottom.
  useLayoutEffect(() => {
    const scrollElement = scrollElementRef?.current;
    if (!isEnabled || !scrollElement) return;
    const onScroll = () => {
      pinnedToBottomRef.current =
        scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight <=
        PINNED_TO_BOTTOM_PIXELS;
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        updateRangeRef.current();
      });
    };
    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", onScroll);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = 0;
    };
  }, [isEnabled, scrollElementRef]);

  // A new layout (rows added, a height measured) or the window mode: the
  // range follows before the browser paints.
  useLayoutEffect(() => {
    if (mode === "window") updateRange();
  }, [mode, layout, updateRange]);

  // Measured heights: one observer for every mounted row.
  const getRowObserver = useCallback((): ResizeObserver | null => {
    if (rowObserverRef.current || typeof ResizeObserver === "undefined") return rowObserverRef.current;
    rowObserverRef.current = new ResizeObserver((entries) => {
      const scrollElement = scrollElementRef?.current;
      const currentLayout = layoutRef.current;
      const sizes = sizesRef.current;
      let hasChanged = false;
      let shiftAbove = 0;
      const viewportTop = scrollElement
        ? scrollElement.getBoundingClientRect().top + scrollElement.clientTop
        : 0;
      for (const entry of entries) {
        const key = keysByElementRef.current.get(entry.target);
        if (key === undefined) continue;
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
        // A hidden row (display: none) reports 0: keep what it measured.
        if (height === 0) continue;
        const index = currentLayout.indexByKey.get(key);
        const previous = sizes.get(key) ?? (index !== undefined ? currentLayout.heights[index] : height);
        if (height === previous && sizes.has(key)) continue;
        if (sizes.size >= MAX_REMEMBERED_HEIGHTS) sizes.clear();
        sizes.set(key, height);
        hasChanged = true;
        if (scrollElement && entry.target.getBoundingClientRect().bottom <= viewportTop) {
          shiftAbove += height - previous;
        }
      }
      if (!hasChanged) return;
      if (scrollElement && modeRef.current === "window") {
        if (pinnedToBottomRef.current) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        } else if (shiftAbove !== 0) {
          scrollElement.scrollTop += shiftAbove;
        }
      }
      setSizesVersion((version) => version + 1);
    });
    return rowObserverRef.current;
  }, [scrollElementRef]);

  useLayoutEffect(
    () => () => {
      rowObserverRef.current?.disconnect();
      rowObserverRef.current = null;
    },
    [],
  );

  const measureRow = useCallback(
    (key: string) => {
      // One function per key for the list's life: a new one would make
      // React detach and re-attach the row's ref on every render.
      let callback = measureCallbacksRef.current.get(key);
      if (!callback) {
        callback = (element: HTMLElement | null) => {
          const observer = isEnabled ? getRowObserver() : null;
          const previous = elementsByKeyRef.current.get(key);
          if (previous && previous !== element) {
            observer?.unobserve(previous);
            keysByElementRef.current.delete(previous);
            elementsByKeyRef.current.delete(key);
          }
          if (element) {
            elementsByKeyRef.current.set(key, element);
            keysByElementRef.current.set(element, key);
            observer?.observe(element);
          }
        };
        if (measureCallbacksRef.current.size >= MAX_REMEMBERED_HEIGHTS) measureCallbacksRef.current.clear();
        measureCallbacksRef.current.set(key, callback);
      }
      return callback;
    },
    [isEnabled, getRowObserver],
  );

  const scrollToIndex = useCallback(
    (index: number, { offset = 0, behavior = "auto", selector }: ScrollToRowOptions = {}) => {
      const scrollElement = scrollElementRef?.current;
      const rowsElement = rowsElementRef.current;
      if (!scrollElement || !rowsElement) return;
      const currentLayout = layoutRef.current;
      if (index < 0 || index >= currentLayout.count) return;
      const key = currentLayout.keys[index];
      const viewportTop = () => scrollElement.getBoundingClientRect().top + scrollElement.clientTop;
      const mountedTarget = (): Element | null => {
        const rowElement = elementsByKeyRef.current.get(key);
        if (!rowElement) return null;
        return (selector && rowElement.querySelector(selector)) || rowElement;
      };
      const alignTo = (element: Element, alignBehavior: ScrollBehavior) => {
        const top = scrollElement.scrollTop + element.getBoundingClientRect().top - viewportTop() + offset;
        if (alignBehavior === "smooth") holdUntilRef.current = performance.now() + SMOOTH_SCROLL_HOLD_MILLISECONDS;
        pinnedToBottomRef.current = false;
        scrollElement.scrollTo({ top, behavior: alignBehavior });
      };
      const mounted = mountedTarget();
      if (mounted) {
        alignTo(mounted, behavior);
        return;
      }
      // Not mounted: jump to where the layout puts it, then align exactly
      // once it has mounted and the rows above it have measured.
      const rowTop =
        scrollElement.scrollTop +
        rowsElement.getBoundingClientRect().top +
        currentLayout.tops[index] -
        viewportTop() +
        offset;
      pinnedToBottomRef.current = false;
      scrollElement.scrollTo({ top: rowTop, behavior: "auto" });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const target = mountedTarget();
          if (target) alignTo(target, "auto");
        }),
      );
    },
    [scrollElementRef, rowsElementRef],
  );

  let start = 0;
  let end = count;
  if (mode === "pending") {
    start = Math.max(0, count - INITIAL_ROW_COUNT);
  } else if (mode === "window") {
    start = Math.min(range.start, count);
    end = Math.min(range.end, count);
    if (start >= end && count > 0) {
      // The range predates the rows (a conversation just loaded): the tail
      // until the layout effect computes the real one, before paint.
      start = Math.max(0, count - 1);
      end = count;
    }
  }
  const { paddingTop, paddingBottom } =
    mode === "all" ? { paddingTop: 0, paddingBottom: 0 } : paddingsFor(layout, start, end);

  return {
    start,
    end,
    paddingTop,
    paddingBottom,
    isWindowed: mode !== "all",
    measureRow,
    scrollToIndex,
  };
}
