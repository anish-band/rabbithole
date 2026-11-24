import "server-only";
import fixtures from "@/fixtures/papers.json";
import { searchPapers } from "@/lib/arxiv";
import type { Paper } from "@/lib/arxiv/types";
import { expandMood } from "@/lib/mood/expand";
import { arxivQuery, type MoodPlan } from "@/lib/mood/query";
import { rankPapers } from "@/lib/rank";
import type { TasteSignals } from "@/lib/taste/store";

/**
 * Builds one page of the feed. Stateless: the client sends what it already
 * has (`exclude`) and which candidate round to draw from; we fetch that
 * round's candidates from arXiv (throttled + disk-cached), rank them locally,
 * and return the best unseen ones. When a round runs dry we move to the next.
 */
/** Mixed popular categories for the no-mood, no-likes feed. */
export const DEFAULT_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "quant-ph", "hep-th", "astro-ph.GA", "cond-mat.stat-mech", "math.PR", "math.CO", "q-bio.NC"];
const PER_QUERY = 25;
const DEFAULT_POOL = 50;
const MAX_ROUNDS = 8;

export type FeedRequest = {
  mood?: string;
  signals?: Partial<TasteSignals>;
  exclude?: string[];
  round?: number;
  pageSize?: number;
};

export type FeedResponse = {
  papers: Paper[];
  nextRound: number;
  done: boolean;
  mood?: { label: string; source: MoodPlan["source"] };
  ranked: boolean;
};

/** arXiv searches per round; each costs a 3 s throttle slot on a cold cache. */
const QUERIES_PER_ROUND = 2;
const PAGES_PER_QUERY = 3;

/**
 * A mood's searches, spread over rounds so the first page only waits for two
 * of them: round 0 = first page of queries 1–2, round 1 = queries 3–4, then the
 * second page of each query, and so on.
 */
export function moodSearches(plan: MoodPlan, round: number) {
  const all = Array.from({ length: PAGES_PER_QUERY }, (_, page) => plan.keywords.map((keywords) => ({ keywords, start: page * PER_QUERY }))).flat();
  return all.slice(round * QUERIES_PER_ROUND, (round + 1) * QUERIES_PER_ROUND);
}

async function candidates(round: number, plan: MoodPlan | undefined, categories: string[]): Promise<Paper[]> {
  if (process.env.RABBITHOLE_FIXTURES === "1") return round === 0 ? (fixtures as Paper[]) : [];

  if (plan && plan.keywords.length) {
    const papers: Paper[] = [];
    // Sequential on purpose: the arXiv client throttles to 1 request / 3 s anyway.
    for (const { keywords, start } of moodSearches(plan, round)) {
      const result = await searchPapers({ query: arxivQuery(keywords, plan.categories), start, maxResults: PER_QUERY });
      papers.push(...result.papers);
    }
    return papers;
  }
  const query = (categories.length ? categories : DEFAULT_CATEGORIES).map((c) => `cat:${c}`).join(" OR ");
  const { papers } = await searchPapers({ query, start: round * DEFAULT_POOL, maxResults: DEFAULT_POOL, sortBy: "submittedDate" });
  return papers;
}

export async function getFeedPage({ mood, signals = {}, exclude = [], round = 0, pageSize = 8 }: FeedRequest): Promise<FeedResponse> {
  const plan = mood?.trim() ? await expandMood(mood) : undefined;
  const skip = new Set([...exclude, ...(signals.hidden ?? [])]);
  const page: Paper[] = [];
  let ranked = true;
  let r = round;

  for (; r < round + 2 && r < MAX_ROUNDS && page.length < pageSize; r++) {
    const pool = (await candidates(r, plan, signals.categories ?? [])).filter((p) => !skip.has(p.id));
    if (pool.length === 0) continue;
    let ordered: Paper[];
    try {
      ordered = (await rankPapers(pool, { mood, signals })).map((x) => x.item);
    } catch (err) {
      // Embeddings unavailable (e.g. model download failed): newest first.
      console.warn("[feed] ranking failed, using recency:", err instanceof Error ? err.message : err);
      ranked = false;
      ordered = [...new Map(pool.map((p) => [p.id, p])).values()].sort((a, b) => b.published.localeCompare(a.published));
    }
    for (const p of ordered) {
      if (page.length >= pageSize) break;
      if (!skip.has(p.id)) {
        page.push(p);
        skip.add(p.id);
      }
    }
    if (page.length >= pageSize) break;
  }

  // `r` is the round that filled the page (it may have more), or the first untried one.
  return {
    papers: page,
    nextRound: r,
    done: page.length === 0 || (page.length < pageSize && r >= MAX_ROUNDS),
    mood: plan ? { label: plan.label, source: plan.source } : undefined,
    ranked,
  };
}
