import { useRef, useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./TokenCountBadgeComponent.module.css";

/** Duration of the count-up tween in ms. */
const TWEEN_MS = 600;

/** Ease-out cubic — fast start, gentle landing. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export interface TokenCountBadgeProps {
  value: number;
  label?: string;
  showIcon?: boolean;
  className?: string;
  mini?: boolean;
}

/**
 * TokenCountBadgeComponent — cyan-tinted token count pill with optional icon.
 * When the value updates upward, the displayed number tweens (counting animation)
 * from the previous value to the new value, with a rainbow hue-rotate effect
 * on the text while the tween is active.
 */
export default function TokenCountBadgeComponent({
  value,
  label = "tokens",
  showIcon = true,
  className = "",
  mini = false,
}: TokenCountBadgeProps) {
  const prevRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;

    // First mount or same value — nothing to animate
    if (from === null || from === value) return;

    const fromVal = from;
    const delta = value - fromVal;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / TWEEN_MS, 1);
      const eased = easeOutCubic(progress);
      setDisplayValue(Math.round(fromVal + delta * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  if (!value || value <= 0) return null;

  // Derive tweening state — avoids synchronous setState in effect
  const tweening = displayValue !== value;
  const tooltipLabel = `${value.toLocaleString()} tokens ${label}`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <span
        className={`${styles.badge} ${mini ? styles.mini : ""} ${tweening ? styles.tweening : ""} ${className}`}
      >
        {showIcon && <Hash size={mini ? 8 : 10} />}
        {displayValue.toLocaleString()} {label}
      </span>
    </TooltipComponent>
  );
}
