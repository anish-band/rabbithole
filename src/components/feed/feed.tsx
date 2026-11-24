"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FeedItem, FeedSource } from "@/lib/feed/types";
import { PaperSlide } from "./paper-slide";
import { useActiveIndex } from "./use-active-index";
import { useFeedItems, usePrefetch } from "./use-feed-items";
import { useFeedKeyboard } from "./use-feed-keyboard";
import { useWheelPaging } from "./use-wheel-paging";

/** Slides further than this from the active one render as empty placeholders. */
const RENDER_WINDOW = 2;

type FeedProps = {
  source: FeedSource;
  initialItems: FeedItem[];
};

/**
 * Full-screen vertical feed. Native scroll-snap handles touch (momentum and
 * mid-scroll interruption come for free); mouse wheel / trackpad page one
 * paper per gesture; the keyboard drives the same scroll container.
 */
export function Feed({ source, initialItems }: FeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { items, status, loadMore } = useFeedItems(source, initialItems);
  const active = useActiveIndex(containerRef, items.length);
  usePrefetch(active, items.length, status, loadMore);

  // Latest values for the (stable) keyboard handlers.
  const activeRef = useRef(active);
  const countRef = useRef(items.length);
  // Index we are scrolling toward, so rapid key presses accumulate instead of
  // all resolving relative to the slide that is still on screen.
  const targetRef = useRef<number | null>(null);

  useEffect(() => {
    activeRef.current = active;
    countRef.current = items.length;
  }, [active, items.length]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const settle = () => {
      targetRef.current = null;
    };
    root.addEventListener("scrollend", settle);
    return () => root.removeEventListener("scrollend", settle);
  }, []);

  const handlers = useMemo(() => {
    const scrollToIndex = (index: number) => {
      const root = containerRef.current;
      if (!root) return;
      const clamped = Math.max(0, Math.min(index, countRef.current - 1));
      targetRef.current = clamped;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.scrollTo({ top: clamped * root.clientHeight, behavior: reduceMotion ? "auto" : "smooth" });
    };
    const from = () => targetRef.current ?? activeRef.current;
    return {
      next: () => scrollToIndex(from() + 1),
      prev: () => scrollToIndex(from() - 1),
      first: () => scrollToIndex(0),
      last: () => scrollToIndex(countRef.current - 1),
    };
  }, []);
  useFeedKeyboard(handlers);
  useWheelPaging(containerRef, (direction) => (direction > 0 ? handlers.next() : handlers.prev()));

  return (
    <div
      ref={containerRef}
      role="feed"
      aria-busy={status === "loading"}
      aria-label="Papers"
      className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain"
    >
      {items.map((item, i) => (
        <article
          key={item.key}
          data-index={i}
          aria-posinset={i + 1}
          aria-setsize={-1}
          aria-label={item.paper.title}
          className="h-dvh snap-start snap-always"
        >
          {Math.abs(i - active) <= RENDER_WINDOW ? <PaperSlide paper={item.paper} /> : null}
        </article>
      ))}

      {status === "error" ? (
        <div className="flex h-32 snap-end items-center justify-center gap-3 text-muted">
          Couldn’t load more papers.
          <button type="button" onClick={loadMore} className="font-medium text-foreground underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
