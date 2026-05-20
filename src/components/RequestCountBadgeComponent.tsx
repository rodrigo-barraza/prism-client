import { useRef, useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./RequestCountBadgeComponent.module.css";

/** Duration of the count-up tween in ms. */
const TWEEN_MS = 600;

/** Ease-out cubic — fast start, gentle landing. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export interface RequestCountBadgeProps {
  count: number;
  showIcon?: boolean;
  className?: string;
  mini?: boolean;
}

/**
 * RequestCountBadgeComponent — amber-tinted request count pill with optional icon.
 * When the count updates upward, the displayed number tweens (counting animation)
 * from the previous value to the new value, with a rainbow hue-rotate effect
 * on the text while the tween is active.
 */
export default function RequestCountBadgeComponent({
  count,
  showIcon = true,
  className = "",
  mini = false,
}: RequestCountBadgeProps) {
  const prevRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [displayCount, setDisplayCount] = useState(count);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = count;

    // First mount or same value — nothing to animate
    if (from === null || from === count) return;

    const fromVal = from;
    const delta = count - fromVal;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / TWEEN_MS, 1);
      const eased = easeOutCubic(progress);
      setDisplayCount(Math.round(fromVal + delta * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [count]);

  if (!count || count <= 0) return null;

  // Derive tweening state — avoids synchronous setState in effect
  const tweening = displayCount !== count;
  const suffix = displayCount !== 1 ? "requests" : "request";
  const tooltipLabel = `${count.toLocaleString()} API ${suffix}`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <span
        className={`${styles.badge} ${mini ? styles.mini : ""} ${tweening ? styles.tweening : ""} ${className}`}
      >
        {showIcon && <Zap size={mini ? 8 : 10} />}
        {displayCount.toLocaleString()} {suffix}
      </span>
    </TooltipComponent>
  );
}
