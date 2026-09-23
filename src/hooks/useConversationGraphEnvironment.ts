"use client";

import { useSyncExternalStore } from "react";

/* ═══════════════════════════════════════════════════════════════════
   Root-style facts the Nodes view reacts to
   ═══════════════════════════════════════════════════════════════════
   One MutationObserver on <html> (style, data-theme, class) and <head>
   (custom themes inject <style> tags) serves every mounted graph. Reads
   are cached and only refreshed when something mutates — getSnapshot
   runs on every render, and the canvas re-renders per animation frame,
   so a getComputedStyle there would force a style recalc per frame. */

interface RootSnapshot {
  phaseColor: string | null;
  isLightCanvas: boolean;
}

const listeners = new Set<() => void>();
let observers: MutationObserver[] = [];
let cachedSnapshot: RootSnapshot | null = null;

function readIsLightCanvas(): boolean {
  // Every built-in and custom theme defines this: near-black on light
  // bases, near-white on dark ones.
  const contrast = getComputedStyle(document.documentElement)
    .getPropertyValue("--calculated-background-base-contrast")
    .trim();
  const oklchMatch = contrast.match(/^oklch\(\s*([\d.]+)(%?)/i);
  if (oklchMatch) return parseFloat(oklchMatch[1]) / (oklchMatch[2] ? 100 : 1) < 0.5;
  const rgbMatch = contrast.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgbMatch) {
    const [red, green, blue] = rgbMatch.slice(1, 4).map(Number);
    return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
  }
  return false;
}

function readSnapshot(): RootSnapshot {
  return {
    phaseColor: document.documentElement.style.getPropertyValue("--generating-dot-phase-color").trim() || null,
    isLightCanvas: readIsLightCanvas(),
  };
}

function getSnapshot(): RootSnapshot {
  if (!cachedSnapshot) cachedSnapshot = readSnapshot();
  return cachedSnapshot;
}

function refresh() {
  const next = readSnapshot();
  const previous = cachedSnapshot;
  if (previous && previous.phaseColor === next.phaseColor && previous.isLightCanvas === next.isLightCanvas) return;
  cachedSnapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (observers.length === 0) {
    const rootObserver = new MutationObserver(refresh);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-theme", "class"],
    });
    const headObserver = new MutationObserver(refresh);
    headObserver.observe(document.head, { childList: true });
    observers = [rootObserver, headObserver];
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      for (const observer of observers) observer.disconnect();
      observers = [];
      cachedSnapshot = null;
    }
  };
}

const serverSnapshot: RootSnapshot = { phaseColor: null, isLightCanvas: false };

/** The status bar's current phase colour while a turn runs, else null. */
export function usePhaseColor(): string | null {
  return useSyncExternalStore(subscribe, () => getSnapshot().phaseColor, () => serverSnapshot.phaseColor);
}

/** True on light canvases (Daylight, Overcast, light custom themes). */
export function useIsLightCanvas(): boolean {
  return useSyncExternalStore(subscribe, () => getSnapshot().isLightCanvas, () => serverSnapshot.isLightCanvas);
}
