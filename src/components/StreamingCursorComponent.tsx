"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./StreamingCursorComponent.module.css";

/**
 * StreamingCursorComponent — Renders an inline rainbow caret cursor
 * with a rapidly-cycling random "scramble" character to its left.
 *
 * The scramble character rotates through letters, digits, and symbols
 * at ~30 fps, giving a glitchy/matrix-style feel while text streams in.
 *
 * Props:
 *   @param {boolean} active     - Whether streaming is in progress
 *   @param {boolean} standalone - Render as block-level element (pre-text cursor)
 */

const SCRAMBLE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/~`¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿×÷ΔΩπΣφψλαβγ∞∑∏√∂∫≈≠≤≥∈∉∩∪⊂⊃∀∃∇☰☷☶☵☴☳";
const SCRAMBLE_INTERVAL_MS = 35;

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function StreamingCursorComponent({ active: any, standalone: any }) {
  const [char, setChar] = useState<any>("_");
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    // @ts-ignore
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setChar(
        SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
      );
    }, SCRAMBLE_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  // @ts-ignore
  }, [active]);

  // @ts-ignore
  if (!active) return null;

  const cursor = (
    <span className={styles.streamingCursorWrapper} aria-hidden="true">
      <span className={styles.scrambleChar}>{char}</span>
      <span className={styles.caret}>▎</span>
    </span>
  );

  // @ts-ignore
  if (standalone) {
    return <div className={styles.standaloneCursor}>{cursor}</div>;
  }

  return cursor;
}
