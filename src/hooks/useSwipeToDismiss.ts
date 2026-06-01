import { useRef, useEffect, useCallback } from "react";

type SwipeDirection = "left" | "right";

interface SwipeToDismissOptions {
  direction: SwipeDirection;
  onDismiss: () => void;
  isEnabled: boolean;
  dismissThresholdRatio?: number;
  velocityThreshold?: number;
}

const DEFAULT_DISMISS_THRESHOLD_RATIO = 0.3;
const DEFAULT_VELOCITY_THRESHOLD = 0.5;

/**
 * Attaches touch-based swipe-to-dismiss gesture to a ref'd element.
 * Uses GPU-accelerated `translate` for fluid tracking during the swipe.
 *
 * - direction "left"  → swipe leftward (negative X) to dismiss
 * - direction "right" → swipe rightward (positive X) to dismiss
 */
export function useSwipeToDismiss({
  direction,
  onDismiss,
  isEnabled,
  dismissThresholdRatio = DEFAULT_DISMISS_THRESHOLD_RATIO,
  velocityThreshold = DEFAULT_VELOCITY_THRESHOLD,
}: SwipeToDismissOptions) {
  const elementReference = useRef<HTMLElement>(null);
  const touchStartXReference = useRef(0);
  const touchStartYReference = useRef(0);
  const touchStartTimestampReference = useRef(0);
  const currentTranslateXReference = useRef(0);
  const isTrackingSwipeReference = useRef(false);
  const hasDecidedAxisReference = useRef(false);

  const onDismissReference = useRef(onDismiss);
  useEffect(() => {
    onDismissReference.current = onDismiss;
  }, [onDismiss]);

  const handleTouchStart = useCallback(
    (touchEvent: TouchEvent) => {
      if (!isEnabled) return;
      const touchPoint = touchEvent.touches[0];
      if (!touchPoint) return;

      touchStartXReference.current = touchPoint.clientX;
      touchStartYReference.current = touchPoint.clientY;
      touchStartTimestampReference.current = Date.now();
      currentTranslateXReference.current = 0;
      isTrackingSwipeReference.current = false;
      hasDecidedAxisReference.current = false;
    },
    [isEnabled],
  );

  const handleTouchMove = useCallback(
    (touchEvent: TouchEvent) => {
      if (!isEnabled) return;
      const touchPoint = touchEvent.touches[0];
      const targetElement = elementReference.current;
      if (!touchPoint || !targetElement) return;

      const deltaX = touchPoint.clientX - touchStartXReference.current;
      const deltaY = touchPoint.clientY - touchStartYReference.current;

      if (!hasDecidedAxisReference.current) {
        const absoluteDeltaX = Math.abs(deltaX);
        const absoluteDeltaY = Math.abs(deltaY);
        if (absoluteDeltaX < 8 && absoluteDeltaY < 8) return;

        hasDecidedAxisReference.current = true;

        if (absoluteDeltaY > absoluteDeltaX) {
          isTrackingSwipeReference.current = false;
          return;
        }

        const isCorrectDirection =
          direction === "left" ? deltaX < 0 : deltaX > 0;
        if (!isCorrectDirection) {
          isTrackingSwipeReference.current = false;
          return;
        }

        isTrackingSwipeReference.current = true;
      }

      if (!isTrackingSwipeReference.current) return;

      touchEvent.preventDefault();

      const clampedTranslateX =
        direction === "left"
          ? Math.min(0, deltaX)
          : Math.max(0, deltaX);

      currentTranslateXReference.current = clampedTranslateX;
      targetElement.style.transition = "none";
      targetElement.style.translate = `${clampedTranslateX}px 0`;
    },
    [isEnabled, direction],
  );

  const handleTouchEnd = useCallback(() => {
    const targetElement = elementReference.current;
    if (!targetElement || !isTrackingSwipeReference.current) {
      isTrackingSwipeReference.current = false;
      hasDecidedAxisReference.current = false;
      return;
    }

    const absoluteTranslateX = Math.abs(currentTranslateXReference.current);
    const elementWidth = targetElement.offsetWidth;
    const elapsedMilliseconds = Date.now() - touchStartTimestampReference.current;
    const swipeVelocity =
      elapsedMilliseconds > 0 ? absoluteTranslateX / elapsedMilliseconds : 0;

    const hasCrossedThreshold =
      absoluteTranslateX > elementWidth * dismissThresholdRatio;
    const isVelocityDismiss = swipeVelocity > velocityThreshold;

    if (hasCrossedThreshold || isVelocityDismiss) {
      const dismissTranslateX =
        direction === "left" ? -elementWidth : elementWidth;
      targetElement.style.transition =
        "translate 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
      targetElement.style.translate = `${dismissTranslateX}px 0`;

      const handleTransitionEnd = () => {
        targetElement.removeEventListener("transitionend", handleTransitionEnd);
        targetElement.style.transition = "";
        targetElement.style.translate = "";
        onDismissReference.current();
      };
      targetElement.addEventListener("transitionend", handleTransitionEnd, {
        once: true,
      });
    } else {
      targetElement.style.transition =
        "translate 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
      targetElement.style.translate = "0 0";

      const handleTransitionEnd = () => {
        targetElement.removeEventListener("transitionend", handleTransitionEnd);
        targetElement.style.transition = "";
        targetElement.style.translate = "";
      };
      targetElement.addEventListener("transitionend", handleTransitionEnd, {
        once: true,
      });
    }

    isTrackingSwipeReference.current = false;
    hasDecidedAxisReference.current = false;
  }, [direction, dismissThresholdRatio, velocityThreshold]);

  useEffect(() => {
    const targetElement = elementReference.current;
    if (!targetElement || !isEnabled) return;

    targetElement.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    targetElement.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    targetElement.addEventListener("touchend", handleTouchEnd, {
      passive: true,
    });

    return () => {
      targetElement.removeEventListener("touchstart", handleTouchStart);
      targetElement.removeEventListener("touchmove", handleTouchMove);
      targetElement.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isEnabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return elementReference;
}
