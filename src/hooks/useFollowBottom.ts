"use client";

/**
 * Follow the bottom of a scrolling transcript: while the view is near the
 * bottom, every change in `followTriggers` scrolls `endRef` into view. A
 * scroll that leaves the bottom stops the following; reaching it again, or
 * `stickToBottom` (a send, a conversation opened), re-engages it.
 *
 * A view that has fallen far behind — a burst of output recovered after a
 * dropped connection — jumps instead of gliding: a long smooth scroll passes
 * through positions far from the bottom, which read as the user scrolling
 * away and stopped the following for the rest of the turn.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { PINNED_TO_BOTTOM_PIXELS } from "./useVirtualRows";

export default function useFollowBottom(
  scrollElementRef: RefObject<HTMLElement | null>,
  endRef: RefObject<HTMLElement | null>,
  followTriggers: readonly unknown[],
) {
  const isFollowingRef = useRef<boolean>(true);
  // "smooth" while streaming, "instant" for a conversation that just loaded.
  const scrollBehaviorRef = useRef<ScrollBehavior>("smooth");

  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      isFollowingRef.current = scrollHeight - scrollTop - clientHeight <= PINNED_TO_BOTTOM_PIXELS;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [scrollElementRef]);

  useEffect(() => {
    if (!isFollowingRef.current) return;
    const element = scrollElementRef.current;
    const distance = element ? element.scrollHeight - element.scrollTop - element.clientHeight : 0;
    const behavior = distance > PINNED_TO_BOTTOM_PIXELS ? "instant" : scrollBehaviorRef.current;
    endRef.current?.scrollIntoView({ behavior });
    // Back to smooth after each scroll, so streaming stays animated.
    scrollBehaviorRef.current = "smooth";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the triggers are the list the caller passes
  }, followTriggers);

  /** Follow the bottom again; the next change scrolls there with `behavior`. */
  const stickToBottom = useCallback((behavior?: ScrollBehavior) => {
    isFollowingRef.current = true;
    if (behavior) scrollBehaviorRef.current = behavior;
  }, []);

  return { stickToBottom };
}
