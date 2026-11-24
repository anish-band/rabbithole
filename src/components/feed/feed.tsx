"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { FeedNav } from "@/components/chrome/top-bar";
import type { FeedItem, FeedSource } from "@/lib/feed/types";
import { PaperScreen } from "@/components/paper/paper-screen";
import { FeedMessage, FeedSkeleton, pillButton } from "./feed-placeholder";
import { useActiveIndex } from "./use-active-index";
import { useFeedItems, usePrefetch } from "./use-feed-items";
import { useFeedKeyboard } from "./use-feed-keyboard";
import { useViewHistory } from "./use-view-history";
import { useWheelPaging } from "./use-wheel-paging";

/** Slides further than this from the active (or target) one render as empty placeholders. */
const RENDER_WINDOW = 2;
/** Fallback "scroll finished" signal for browsers without `scrollend`. */
const SCROLL_IDLE_MS = 150;

type FeedProps = {
  source: FeedSource;
  initialItems: FeedItem[];
  /** Floating chrome (top bar) that gets the feed's navigation. */
  Header?: ComponentType<{ nav: FeedNav; children?: ReactNode }>;
  /** Extra header content (e.g. the mood bar). */
  headerContent?: ReactNode;
  /** Shown while the first page loads. */
  loadingLabel?: string;
  /** Shown when the source has nothing at all. */
  emptyMessage?: { title: string; detail: string };
};

/**
 * Full-screen vertical feed. Native scroll-snap handles touch (momentum and
 * mid-scroll interruption come for free); mouse wheel / trackpad page one
 * paper per gesture; the keyboard drives the same scroll container.
 * Focus follows keyboard/wheel navigation so screen readers announce each paper.
 */
export function Feed({ source, initialItems, Header, headerContent, loadingLabel = "Finding papers…", emptyMessage = { title: "No papers here", detail: "Try a different mood." } }: FeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { items, status, loadMore } = useFeedItems(source, initialItems);
  const active = useActiveIndex(containerRef, items.length);
  usePrefetch(active, items.length, status, loadMore);
  useViewHistory(items[active]?.paper.id);

  // Index we are scrolling toward, so rapid key presses accumulate instead of
  // all resolving relative to the slide that is still on screen. Mirrored in
  // state so the render window can include the destination.
  const targetRef = useRef<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const activeRef = useRef(active);
  const countRef = useRef(items.length);

  useEffect(() => {
    activeRef.current = active;
    countRef.current = items.length;
  }, [active, items.length]);

  // Clear the target once the scroll has settled. `scrollend` where supported,
  // otherwise a short idle timer after the last `scroll` event.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const settle = () => {
      targetRef.current = null;
      setTarget(null);
    };
    if ("onscrollend" in window) {
      root.addEventListener("scrollend", settle);
      return () => root.removeEventListener("scrollend", settle);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, SCROLL_IDLE_MS);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, []);

  const handlers = useMemo(() => {
    const scrollToIndex = (index: number) => {
      const root = containerRef.current;
      if (!root) return;
      const clamped = Math.max(0, Math.min(index, countRef.current - 1));
      targetRef.current = clamped;
      setTarget(clamped);

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.scrollTo({ top: clamped * root.clientHeight, behavior: reduceMotion ? "auto" : "smooth" });

      // Move focus with the feed (ARIA feed pattern) without fighting the scroll.
      const article = root.querySelector<HTMLElement>(`[data-index="${clamped}"]`);
      if (article && document.activeElement !== article) {
        article.dataset.programmaticFocus = "";
        article.focus({ preventScroll: true });
      }
    };
    // Start from the pending target, else from where the container actually is.
    // (activeRef can lag a frame behind the scroll position right after settling.)
    const from = () => {
      if (targetRef.current !== null) return targetRef.current;
      const root = containerRef.current;
      return root && root.clientHeight > 0 ? Math.round(root.scrollTop / root.clientHeight) : activeRef.current;
    };
    return {
      next: () => scrollToIndex(from() + 1),
      prev: () => scrollToIndex(from() - 1),
      first: () => scrollToIndex(0),
      last: () => scrollToIndex(countRef.current - 1),
    };
  }, []);
  useFeedKeyboard(handlers);
  useWheelPaging(containerRef, (direction) => (direction > 0 ? handlers.next() : handlers.prev()));

  const inWindow = (i: number) =>
    Math.abs(i - active) <= RENDER_WINDOW || (target !== null && Math.abs(i - target) <= RENDER_WINDOW);

  return (
    <>
      {Header ? <Header nav={{ next: handlers.next, prev: handlers.prev, active: target ?? active, count: items.length }}>{headerContent}</Header> : null}
      <div
        ref={containerRef}
        role="feed"
        aria-busy={status === "loading"}
        aria-label="Papers"
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {items.length === 0 ? (
          <div className="h-full snap-start">
            {status === "error" ? (
              <FeedMessage
                kind="error"
                title="Couldn’t load papers"
                detail="arXiv didn’t respond. Check your connection and try again."
                action={<button type="button" onClick={loadMore} className={pillButton}>Try again</button>}
              />
            ) : status === "done" ? (
              <FeedMessage kind="empty" {...emptyMessage} />
            ) : (
              <FeedSkeleton label={loadingLabel} />
            )}
          </div>
        ) : null}

        {items.map((item, i) => (
          <article
            key={item.key}
            data-index={i}
            data-active={i === active ? "" : undefined}
            tabIndex={0}
            aria-posinset={i + 1}
            aria-setsize={-1}
            aria-label={item.paper.title}
            onBlur={(e) => delete e.currentTarget.dataset.programmaticFocus}
            className="h-full snap-start snap-always outline-none focus-visible:not-data-programmatic-focus:outline-2 focus-visible:not-data-programmatic-focus:-outline-offset-4 focus-visible:not-data-programmatic-focus:outline-foreground/40"
          >
            {inWindow(i) ? <PaperScreen paper={item.paper} active={i === active} wantExplainer={i === active || i === active + 1} /> : null}
          </article>
        ))}

        {status === "done" && items.length > 0 ? (
          <div className="flex h-40 snap-end flex-col items-center justify-center gap-1 text-center">
            <p className="text-callout font-medium">You’ve reached the end</p>
            <p className="text-footnote text-muted">Try a new mood for more papers.</p>
          </div>
        ) : null}

        {status === "error" && items.length > 0 ? (
          <div className="flex h-32 snap-end items-center justify-center gap-3 text-muted">
            Couldn’t load more papers.
            <button type="button" onClick={loadMore} className="font-medium text-foreground underline underline-offset-4">
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
