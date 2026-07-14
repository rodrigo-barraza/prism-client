"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./StreamingCursorComponent.module.css";

/**
 * StreamingCursorComponent — Renders an inline rainbow caret cursor
 * with a rapidly-cycling random "scramble" character to its left.
 *
 * When `token` is provided (the trailing word split off the streaming
 * text via splitStreamingTail), it renders rainbow-tinted immediately
 * before the cursor so the newest word looks like it is being emitted
 * by the cursor itself.
 *
 * The scramble character rotates through letters, digits, and symbols
 * at ~30 fps, giving a glitchy/matrix-style feel while text streams in.
 */

const SCRAMBLE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/~`¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿×÷ΔΩπΣφψλαβγ∞∑∏√∂∫≈≠≤≥∈∉∩∪⊂⊃∀∃∇☰☷☶☵☴☳";
const SCRAMBLE_INTERVAL_MS = 35;

export default function StreamingCursorComponent({
  active,
  standalone,
  token,
}: {
  active?: boolean;
  standalone?: boolean;
  token?: string;
}) {
  const [char, setChar] = useState("_");
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setChar(
        SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
      );
    }, SCRAMBLE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);

  if (!active) return null;

  const cursor = (
    <span
      className={`streaming-cursor-component ${styles['streaming-cursor-wrapper']}`}
      aria-hidden="true"
    >
      {token ? (
        <>
          {" "}
          <span className={styles['streaming-token-text-display']}>
            {token}
          </span>
        </>
      ) : null}
      <span className={styles['scramble-char']}>{char}</span>
      <span className={styles['caret']}>▎</span>
    </span>
  );

  if (standalone) {
    return <div className={styles['standalone-cursor']}>{cursor}</div>;
  }

  return cursor;
}
