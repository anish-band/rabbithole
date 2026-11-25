/**
 * Pure helpers for turning a mood into arXiv search queries. We never pass
 * model output straight to arXiv: keywords and category codes are sanitised and
 * the query syntax is assembled here.
 */
export type MoodPlan = {
  /** Short label for the UI, e.g. "Weird physics". */
  label: string;
  /** 2–4 keyword groups; each becomes one arXiv query. */
  keywords: string[][];
  /** arXiv category codes to restrict to (may be empty). */
  categories: string[];
  source: "claude" | "fallback";
};

const STOPWORDS = new Set(
  "a an and are about anything any for from how i im i'm in into is it like me mood my of on or papers paper please show some something stuff that the things to using want what why with".split(" "),
);
const CATEGORY = /^[a-z-]{2,12}(\.[A-Za-z-]{2,6})?$/;

export const normalizeMood = (mood: string) => mood.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);

/** Lowercase words of letters/digits/hyphens only; drops anything that could be query syntax. */
export function cleanKeywords(words: string[], max = 5): string[] {
  const out: string[] = [];
  for (const w of words.flatMap((x) => x.toLowerCase().split(/\s+/))) {
    const word = w.replace(/[^\p{L}\p{N}-]/gu, "").replace(/^-+|-+$/g, "");
    if (word.length > 1 && !STOPWORDS.has(word) && !out.includes(word)) out.push(word);
    if (out.length === max) break;
  }
  return out;
}

export const cleanCategories = (codes: string[]) => [...new Set(codes.filter((c) => CATEGORY.test(c)))].slice(0, 6);

/** Most searches a plan makes; matches what Claude plans use. */
const MAX_GROUPS = 4;

/**
 * No Claude: search for the mood's own words. Every word at once is too strict
 * for longer moods (one missing word and nothing matches), so 3+ words also
 * get overlapping pairs: neighbours first, as they're most often a phrase. A
 * search never drops below two words; the ranker sorts out the broader pool.
 */
export function fallbackPlan(mood: string): MoodPlan {
  const words = cleanKeywords([normalizeMood(mood)]);
  const groups: string[][] = words.length ? [words] : [];
  if (words.length >= 3) {
    const pairs: string[][] = [];
    for (let gap = 1; gap < words.length; gap++)
      for (let i = 0; i + gap < words.length; i++) pairs.push([words[i], words[i + gap]]);
    groups.push(...pairs.slice(0, MAX_GROUPS - 1));
  }
  return { label: mood.trim().slice(0, 40), keywords: groups, categories: [], source: "fallback" };
}

/** Build the arXiv `search_query` for one keyword group. */
export function arxivQuery(keywords: string[], categories: string[]): string {
  const terms = keywords.map((k) => `all:${k}`).join(" AND ");
  const cats = categories.map((c) => `cat:${c}`).join(" OR ");
  if (terms && cats) return `(${terms}) AND (${cats})`;
  return terms || cats;
}
