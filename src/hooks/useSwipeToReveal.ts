import { useRef, useEffect, useCallback } from "react";

interface SwipeToRevealOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  isEnabled: boolean;
  swipeThresholdPixels?: number;
  velocityThreshold?: number;
}

const DEFAULT_SWIPE_THRESHOLD_PIXELS = 50;
const DEFAULT_VELOCITY_THRESHOLD = 0.4;
const AXIS_DECISION_THRESHOLD_PIXELS = 10;

/**
 * Detects horizontal swipe gestures on a ref'd element and fires
 * directional callbacks. Axis-locked: once a vertical scroll is
 * detected, the gesture is ignored entirely.
 *
 * Designed for the main content area so users can swipe right to
 * open the left sidebar or swipe left to open the right sidebar.
 */
export function useSwipeToReveal({
  onSwipeRight,
  onSwipeLeft,
  isEnabled,
  swipeThresholdPixels = DEFAULT_SWIPE_THRESHOLD_PIXELS,
  velocityThreshold = DEFAULT_VELOCITY_THRESHOLD,
}: SwipeToRevealOptions) {
  const elementReference = useRef<HTMLElement>(null);
  const touchStartXReference = useRef(0);
  const touchStartYReference = useRef(0);
  const touchStartTimestampReference = useRef(0);
  const lastTouchXReference = useRef(0);
  const isTrackingSwipeReference = useRef(false);
  const hasDecidedAxisReference = useRef(false);

  const onSwipeRightReference = useRef(onSwipeRight);
  const onSwipeLeftReference = useRef(onSwipeLeft);
  useEffect(() => {
    onSwipeRightReference.current = onSwipeRight;
    onSwipeLeftReference.current = onSwipeLeft;
  }, [onSwipeRight, onSwipeLeft]);

  const handleTouchStart = useCallback(
    (touchEvent: TouchEvent) => {
      if (!isEnabled) return;
      const touchPoint = touchEvent.touches[0];
      if (!touchPoint) return;

      touchStartXReference.current = touchPoint.clientX;
      touchStartYReference.current = touchPoint.clientY;
      lastTouchXReference.current = touchPoint.clientX;
      touchStartTimestampReference.current = Date.now();
      isTrackingSwipeReference.current = false;
      hasDecidedAxisReference.current = false;
    },
    [isEnabled],
  );

  const handleTouchMove = useCallback(
    (touchEvent: TouchEvent) => {
      if (!isEnabled) return;
      const touchPoint = touchEvent.touches[0];
      if (!touchPoint) return;

      const deltaX = touchPoint.clientX - touchStartXReference.current;
      const deltaY = touchPoint.clientY - touchStartYReference.current;

      lastTouchXReference.current = touchPoint.clientX;

      if (!hasDecidedAxisReference.current) {
        const absoluteDeltaX = Math.abs(deltaX);
        const absoluteDeltaY = Math.abs(deltaY);

        if (
          absoluteDeltaX < AXIS_DECISION_THRESHOLD_PIXELS &&
          absoluteDeltaY < AXIS_DECISION_THRESHOLD_PIXELS
        ) {
          return;
        }

        hasDecidedAxisReference.current = true;

        if (absoluteDeltaY > absoluteDeltaX) {
          isTrackingSwipeReference.current = false;
          return;
        }

        isTrackingSwipeReference.current = true;
      }
    },
    [isEnabled],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isTrackingSwipeReference.current) {
      isTrackingSwipeReference.current = false;
      hasDecidedAxisReference.current = false;
      return;
    }

    const totalDeltaX =
      lastTouchXReference.current - touchStartXReference.current;
    const absoluteDeltaX = Math.abs(totalDeltaX);
    const elapsedMilliseconds =
      Date.now() - touchStartTimestampReference.current;
    const swipeVelocity =
      elapsedMilliseconds > 0 ? absoluteDeltaX / elapsedMilliseconds : 0;

    const hasCrossedThreshold = absoluteDeltaX >= swipeThresholdPixels;
    const isVelocitySwipe = swipeVelocity > velocityThreshold;

    if (hasCrossedThreshold || isVelocitySwipe) {
      if (totalDeltaX > 0 && onSwipeRightReference.current) {
        onSwipeRightReference.current();
      } else if (totalDeltaX < 0 && onSwipeLeftReference.current) {
        onSwipeLeftReference.current();
      }
    }

    isTrackingSwipeReference.current = false;
    hasDecidedAxisReference.current = false;
  }, [swipeThresholdPixels, velocityThreshold]);

  useEffect(() => {
    const targetElement = elementReference.current;
    if (!targetElement || !isEnabled) return;

    targetElement.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    targetElement.addEventListener("touchmove", handleTouchMove, {
      passive: true,
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
