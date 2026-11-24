"use client";

import { useEffect, useRef, type RefObject } from "react";
import { innerScrollerCanTake } from "./inner-scroller";

/** Wheel distance (px) that counts as an intent to move one paper. */
const THRESHOLD = 30;
/** A gesture ends after this long with no wheel events (covers trackpad momentum). */
const GESTURE_GAP_MS = 180;
/** Upper bound on waiting for the page scroll to settle (no `scrollend`, or nothing to scroll). */
const SETTLE_CAP_MS = 700;

/**
 * Turns mouse-wheel and trackpad scrolling into one-paper-per-gesture paging.
 * Native scroll-snap alone snaps back on a single wheel notch (< half the
 * viewport), so we take over wheel input on the feed: the first ~30px of a
 * gesture pages once, and the rest of that gesture (including trackpad
 * momentum) is swallowed. Touch scrolling stays fully native.
 *
 * Gaps are measured with each event's own timestamp, not a timer: when the
 * main thread stalls while the next paper renders, a timer would fire before
 * the queued momentum events run and page again. The gesture also stays
 * locked until the page scroll has settled.
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
    let lastEventAt = Number.NEGATIVE_INFINITY;
    let settling = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const settled = () => {
      settling = false;
      clearTimeout(settleTimer);
    };

    const normalize = (e: WheelEvent) =>
      e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? e.deltaY * root.clientHeight : e.deltaY;

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) return; // pinch-zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal gesture
      if (innerScrollerCanTake(e.target, root, e.deltaY > 0 ? 1 : -1)) return;

      e.preventDefault();

      // A pause in the input (by the events' own clock) starts a new gesture,
      // but never while the previous page is still scrolling into place.
      const gap = e.timeStamp - lastEventAt;
      lastEventAt = e.timeStamp;
      if (gap > GESTURE_GAP_MS && !settling) {
        locked = false;
        accumulated = 0;
      }

      if (locked) return;
      accumulated += normalize(e);
      if (Math.abs(accumulated) >= THRESHOLD) {
        pageRef.current(accumulated > 0 ? 1 : -1);
        locked = true;
        accumulated = 0;
        settling = true;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settled, SETTLE_CAP_MS);
      }
    }

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("scrollend", settled);
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("scrollend", settled);
      clearTimeout(settleTimer);
    };
  }, [containerRef]);
}
