import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCoalescedLoader } from "../useCoalescedLoader";

/** A load whose runs finish when the test says so. */
function controllableLoad() {
  const runs: Array<{ signal: AbortSignal; finish: () => void }> = [];
  const load = vi.fn(
    (signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        runs.push({ signal, finish: resolve });
      }),
  );
  return { load, runs };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useCoalescedLoader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits until enabled, then loads at once", () => {
    const { load } = controllableLoad();
    const { rerender } = renderHook(
      ({ enabled }) => useCoalescedLoader(load, { enabled, minIntervalMs: 5000 }),
      { initialProps: { enabled: false } },
    );
    expect(load).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never overlaps runs: reloads during a run collapse into ONE more", async () => {
    const { load, runs } = controllableLoad();
    const { result } = renderHook(() => useCoalescedLoader(load, { minIntervalMs: 0 }));
    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(load).toHaveBeenCalledTimes(1);
    runs[0].finish();
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    runs[1].finish();
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("starts reloads at most once per interval, and never drops the last one", async () => {
    const { load, runs } = controllableLoad();
    const { result } = renderHook(() => useCoalescedLoader(load, { minIntervalMs: 5000 }));
    runs[0].finish();
    await settle();

    act(() => result.current());
    expect(load).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(2000);
      result.current();
    });
    expect(load).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(3000));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("aborts the running load when its inputs change, and starts the new one at once", () => {
    const first = controllableLoad();
    const second = controllableLoad();
    const { rerender } = renderHook(
      ({ load }) => useCoalescedLoader(load, { minIntervalMs: 5000 }),
      { initialProps: { load: first.load } },
    );
    expect(first.runs[0].signal.aborted).toBe(false);
    rerender({ load: second.load });
    expect(first.runs[0].signal.aborted).toBe(true);
    expect(second.load).toHaveBeenCalledTimes(1);
    expect(second.runs[0].signal.aborted).toBe(false);
  });

  it("stops everything on unmount", () => {
    const { load, runs } = controllableLoad();
    const { result, unmount } = renderHook(() =>
      useCoalescedLoader(load, { minIntervalMs: 5000 }),
    );
    const reload = result.current;
    unmount();
    expect(runs[0].signal.aborted).toBe(true);
    reload();
    act(() => vi.advanceTimersByTime(10_000));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
