"use client";

import { useCallback, useEffect, useRef } from "react";

interface LoaderState {
  active: boolean;
  controller: AbortController | null;
  queued: boolean;
  lastStartedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Runs `load` whenever it changes (its inputs changed) and again on each call
 * of the returned `reload` — a live page's refresh on change events — so that:
 *
 * - a newer run aborts the older one, and a stale response never lands over
 *   fresher data (`load` returns without setting state once its signal is
 *   aborted);
 * - runs never overlap: a reload asked for during a run is queued, and any
 *   number of asks during that run collapse into that one;
 * - reloads start at most once per `minIntervalMs`. A trailing debounce never
 *   fires while an agent keeps writing requests; this refreshes steadily.
 *
 * Nothing runs until `enabled`. Changed inputs start at once, unthrottled.
 */
export function useCoalescedLoader(
  load: (signal: AbortSignal) => Promise<void>,
  { enabled = true, minIntervalMs }: { enabled?: boolean; minIntervalMs: number },
): () => void {
  const loadRef = useRef(load);
  const stateRef = useRef<LoaderState>({
    active: false,
    controller: null,
    queued: false,
    lastStartedAt: 0,
    timer: null,
  });

  const run = useCallback(
    function run() {
      const state = stateRef.current;
      if (!state.active) return;
      if (state.controller) {
        state.queued = true;
        return;
      }
      const wait = state.lastStartedAt + minIntervalMs - Date.now();
      if (wait > 0) {
        state.timer ??= setTimeout(() => {
          state.timer = null;
          run();
        }, wait);
        return;
      }
      const controller = new AbortController();
      state.controller = controller;
      state.lastStartedAt = Date.now();
      loadRef.current(controller.signal)
        .catch(() => {})
        .finally(() => {
          if (state.controller !== controller) return;
          state.controller = null;
          if (state.queued) {
            state.queued = false;
            run();
          }
        });
    },
    [minIntervalMs],
  );

  useEffect(() => {
    loadRef.current = load;
    if (!enabled) return;
    const state = stateRef.current;
    state.active = true;
    state.lastStartedAt = 0;
    run();
    return () => {
      state.active = false;
      state.controller?.abort();
      state.controller = null;
      state.queued = false;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    };
  }, [load, enabled, run]);

  return run;
}
