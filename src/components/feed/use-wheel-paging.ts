"use client";

import { useEffect, useRef, type RefObject } from "react";
import { innerScrollerCanTake } from "./inner-scroller";

/** Wheel distance (px) that counts as an intent to move one paper. */
const THRESHOLD = 30;
/** A gesture ends after this long with no wheel events (covers trackpad momentum). */
const GESTURE_GAP_MS = 180;

/**
 * Turns mouse-wheel and trackpad scrolling into one-paper-per-gesture paging.
 * Native scroll-snap alone snaps back on a single wheel notch (< half the
 * viewport), so we take over wheel input on the feed: the first ~30px of a
 * gesture pages once, and the rest of that gesture (including trackpad
 * momentum) is swallowed. Touch scrolling stays fully native.
 *
 * Elements marked `data-allow-wheel` that can still scroll in the wheel's
 * direction keep normal wheel behavior (e.g. a long abstract).
 */
export function useWheelPaging(containerRef: RefObject<HTMLElement | null>, page: (direction: 1 | -1) => void) {
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let accumulated = 0;
    let locked = false;
    let gapTimer: ReturnType<typeof setTimeout> | undefined;

    const normalize = (e: WheelEvent) =>
      e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? e.deltaY * root.clientHeight : e.deltaY;

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) return; // pinch-zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal gesture
      if (innerScrollerCanTake(e.target, root, e.deltaY > 0 ? 1 : -1)) return;

      e.preventDefault();

      // Every wheel event extends the current gesture.
      clearTimeout(gapTimer);
      gapTimer = setTimeout(() => {
        locked = false;
        accumulated = 0;
      }, GESTURE_GAP_MS);

      if (locked) return;
      accumulated += normalize(e);
      if (Math.abs(accumulated) >= THRESHOLD) {
        pageRef.current(accumulated > 0 ? 1 : -1);
        locked = true;
        accumulated = 0;
      }
    }

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      clearTimeout(gapTimer);
    };
  }, [containerRef]);
}
