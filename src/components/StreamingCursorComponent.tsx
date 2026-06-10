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


 */

const SCRAMBLE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/~`¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿×÷ΔΩπΣφψλαβγ∞∑∏√∂∫≈≠≤≥∈∉∩∪⊂⊃∀∃∇☰☷☶☵☴☳";
const SCRAMBLE_INTERVAL_MS = 35;

function getLatestToken(textString: string): string {
  if (!textString) return "";
  const trimmed = textString.trimEnd();
  if (!trimmed) return "";
  const match = trimmed.match(/\S+$/);
  return match ? match[0] : "";
}

export default function StreamingCursorComponent({
  active,
  standalone,
  text,
}: {
  active?: boolean;
  standalone?: boolean;
  text?: string;
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

  const latestToken = text ? getLatestToken(text) : "";

  const cursor = (
    <>
      {latestToken && (
        <span className={styles['streaming-token-text-display']} aria-hidden="true">
          {latestToken}
        </span>
      )}
      <span className={`streaming-cursor-component ${styles['streaming-cursor-wrapper']}`} aria-hidden="true">
        <span className={styles['scramble-char']}>{char}</span>
        <span className={styles['caret']}>▎</span>
      </span>
    </>
  );

  if (standalone) {
    return <div className={styles['standalone-cursor']}>{cursor}</div>;
  }

  return cursor;
}
