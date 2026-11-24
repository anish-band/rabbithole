"use client";

import { useEffect, useRef } from "react";
import { recordView } from "@/lib/taste/store";
import { updateTaste } from "@/lib/taste/use-taste";

/**
 * Records how long each paper stayed on screen (short views count as skips).
 * The dwell for the current paper is flushed when the active paper changes,
 * and when the page is hidden or closed.
 */
export function useViewHistory(activeId: string | undefined) {
  const startRef = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    const flush = () => {
      const start = startRef.current;
      if (start) updateTaste((s) => recordView(s, start.id, performance.now() - start.at));
      startRef.current = null;
    };
    if (activeId) startRef.current = { id: activeId, at: performance.now() };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else if (activeId) startRef.current = { id: activeId, at: performance.now() };
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [activeId]);
}
