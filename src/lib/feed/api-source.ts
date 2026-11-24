import type { Paper } from "@/lib/arxiv/types";
import type { TasteSignals } from "@/lib/taste/store";
import type { FeedItem, FeedSource } from "./types";

export type FeedMeta = { label: string; source: "claude" | "fallback" } | undefined;

type ApiPage = { papers: Paper[]; nextRound: number; done: boolean; mood?: FeedMeta; error?: string };

/**
 * Client-side source backed by POST /api/feed. Tracks which papers are already
 * in the feed and which candidate round to draw from next; reads the latest
 * taste signals on every request so likes take effect on the next page.
 */
export function createApiSource({
  mood,
  signals,
  onMeta,
}: {
  mood?: string;
  signals: () => TasteSignals;
  onMeta?: (meta: FeedMeta) => void;
}): FeedSource {
  const ids: string[] = [];
  let round = 0;
  let done = false;

  return {
    async nextPage(): Promise<FeedItem[]> {
      if (done) return [];
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mood, signals: signals(), exclude: ids.slice(-300), round }),
      });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const page = (await res.json()) as ApiPage;
      onMeta?.(page.mood);
      round = page.nextRound;
      done = page.done;
      const fresh = page.papers.filter((p) => !ids.includes(p.id));
      ids.push(...fresh.map((p) => p.id));
      return fresh.map((paper) => ({ key: paper.id, paper }));
    },
  };
}
