"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Tracks which slide is on screen: the one covering more than 60% of the
 * scroll container. Slides must carry a `data-index` attribute.
 */
export function useActiveIndex(containerRef: RefObject<HTMLElement | null>, count: number) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { root, threshold: 0.6 },
    );

    root.querySelectorAll<HTMLElement>("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [containerRef, count]);

  return active;
}
