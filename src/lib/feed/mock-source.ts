import fixtures from "@/fixtures/papers.json";
import type { Paper } from "@/lib/arxiv/types";
import type { FeedItem, FeedSource } from "./types";

const PAPERS = fixtures as Paper[];

/**
 * Development feed source: pages through the fixture papers forever, with a
 * small artificial delay so loading states and prefetching are exercised.
 * Replaced by the real /api/feed source in #7.
 */
export function createMockSource({ start = 0, pageSize = 6, delayMs = 400 } = {}): FeedSource {
  let cursor = start;
  return {
    async nextPage() {
      await new Promise((r) => setTimeout(r, delayMs));
      const page: FeedItem[] = Array.from({ length: pageSize }, (_, i) => {
        const n = cursor + i;
        const paper = PAPERS[n % PAPERS.length];
        return { key: `${paper.id}#${n}`, paper };
      });
      cursor += pageSize;
      return page;
    },
  };
}

/** The first page, available synchronously for server rendering. */
export function initialMockItems(count = 6): FeedItem[] {
  return PAPERS.slice(0, count).map((paper, n) => ({ key: `${paper.id}#${n}`, paper }));
}
