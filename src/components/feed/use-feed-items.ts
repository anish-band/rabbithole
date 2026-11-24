"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem, FeedSource } from "@/lib/feed/types";

export type FeedStatus = "idle" | "loading" | "error" | "done";

/** How close to the end (in slides) we start fetching the next page. */
const PREFETCH_THRESHOLD = 3;

/** Holds the feed's items and loads further pages from `source`, one request at a time. */
export function useFeedItems(source: FeedSource, initial: FeedItem[]) {
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const loading = useRef(false);

  const loadMore = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setStatus("loading");
    try {
      const page = await source.nextPage();
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.key));
        return [...prev, ...page.filter((i) => !seen.has(i.key))];
      });
      // An empty page means the source has run dry; stop prefetching.
      setStatus(page.length === 0 ? "done" : "idle");
    } catch {
      setStatus("error");
    } finally {
      loading.current = false;
    }
  }, [source]);

  return { items, status, loadMore };
}

/** Prefetch the next page once the active slide is within PREFETCH_THRESHOLD of the end. */
export function usePrefetch(activeIndex: number, count: number, status: string, loadMore: () => void) {
  useEffect(() => {
    if (status === "idle" && activeIndex >= count - PREFETCH_THRESHOLD) loadMore();
  }, [activeIndex, count, status, loadMore]);
}
