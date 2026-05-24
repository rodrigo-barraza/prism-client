import { useRef, useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { formatCost } from "../utils/utilities";
import { TooltipComponent } from "@rodrigo-barraza/components-library";
import styles from "./CostBadgeComponent.module.css";

/** Duration of the count-up tween in ms. */
const TWEEN_MS = 600;

/** Ease-out cubic — fast start, gentle landing. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export interface CostBadgeProps {
  cost?: number;
  showIcon?: boolean;
  className?: string;
  mini?: boolean;
  formatFn?: (value: number) => string;
}

/**
 * CostBadgeComponent — green-tinted cost pill with optional icon.
 * When cost updates upward, the displayed number tweens (counting animation)
 * from the previous value to the new value, with a rainbow hue-rotate effect
 * on the text while the tween is active.
 */
export default function CostBadgeComponent({
  cost = 0,
  showIcon = true,
  className = "",
  mini = false,
  formatFn = formatCost,
}: CostBadgeProps) {
  const prevCostRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [displayCost, setDisplayCost] = useState(cost);
  const [tweening, setTweening] = useState(false);

  useEffect(() => {
    const from = prevCostRef.current;
    prevCostRef.current = cost;

    // First mount or no previous value — snap immediately
    if (from === null || from === cost) {
      setDisplayCost(cost);
      setTweening(false);
      return;
    }

    const fromVal = from;
    const delta = cost - fromVal;
    const start = performance.now();
    setTweening(true);

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / TWEEN_MS, 1);
      const eased = easeOutCubic(progress);
      setDisplayCost(fromVal + delta * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setTweening(false);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setTweening(false);
    };
  }, [cost]);

  if (!cost || cost <= 0) return null;
  const safeCost = cost;

  const tooltipLabel = `Estimated cost: ${formatCost(safeCost)}`;

  return (
    <TooltipComponent label={tooltipLabel} position="top">
      <span
        className={`${styles.badge} ${mini ? styles.mini : ""} ${tweening ? styles.tweening : ""} ${className}`}
      >
        {showIcon && <Coins size={mini ? 8 : 10} />}
        {formatFn(displayCost)}
      </span>
    </TooltipComponent>
  );
}
