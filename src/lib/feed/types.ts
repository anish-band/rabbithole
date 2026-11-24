import type { Paper } from "@/lib/arxiv/types";

/** One slot in the feed. `key` is unique even if the same paper appears twice. */
export type FeedItem = {
  key: string;
  paper: Paper;
};

/** Anything that can hand the feed its next page of papers. */
export type FeedSource = {
  nextPage: () => Promise<FeedItem[]>;
};
