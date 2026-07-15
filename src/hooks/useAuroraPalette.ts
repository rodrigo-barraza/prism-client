"use client";

import { useEffect, useState } from "react";
import {
  buildAuroraPalette,
  DEFAULT_AURORA_ACCENTS,
  getThemeAuroraPalette,
  type RgbTriplet,
} from "@/utils/rainbow";
import { EVENT_NAME_PRISM_SETTINGS_UPDATED } from "@/constants";

function palettesEqual(a: RgbTriplet[], b: RgbTriplet[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((stop, index) =>
    stop.every((channel, channelIndex) => channel === b[index][channelIndex]),
  );
}

/**
 * Aurora palette derived from the active theme's accent variables.
 * Recomputes when the theme attribute changes or Prism settings update.
 */
export default function useAuroraPalette(): RgbTriplet[] {
  const [palette, setPalette] = useState<RgbTriplet[]>(() =>
    buildAuroraPalette(DEFAULT_AURORA_ACCENTS),
  );

  useEffect(() => {
    const refresh = () => {
      const nextPalette = getThemeAuroraPalette();
      setPalette((currentPalette) =>
        palettesEqual(currentPalette, nextPalette) ? currentPalette : nextPalette,
      );
    };

    refresh();
    window.addEventListener(EVENT_NAME_PRISM_SETTINGS_UPDATED, refresh);

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });

    return () => {
      window.removeEventListener(EVENT_NAME_PRISM_SETTINGS_UPDATED, refresh);
      observer.disconnect();
    };
  }, []);

  return palette;
}
