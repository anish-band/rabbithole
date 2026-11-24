"use client";

import { useEffect, useState, type RefObject } from "react";

const THRESHOLDS = [0, 0.25, 0.5, 0.6, 0.75, 1];

/**
 * Tracks which slide is on screen: the slide with the largest visible ratio,
 * once that ratio passes 0.5. Slides must carry a `data-index` attribute.
 *
 * Ratios are remembered across observer callbacks, because a single callback
 * only reports the slides whose ratio crossed a threshold, not all of them.
 */
export function useActiveIndex(containerRef: RefObject<HTMLElement | null>, count: number) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const ratios = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(Number((entry.target as HTMLElement).dataset.index), entry.intersectionRatio);
        }
        let best = -1;
        let bestRatio = 0.5;
        for (const [index, ratio] of ratios) {
          if (ratio > bestRatio) {
            best = index;
            bestRatio = ratio;
          }
        }
        if (best >= 0) setActive(best);
      },
      { root, threshold: THRESHOLDS },
    );

    root.querySelectorAll<HTMLElement>("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [containerRef, count]);

  return active;
}
