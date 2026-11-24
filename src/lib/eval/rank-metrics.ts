/**
 * Pure helpers for the offline ranking eval (scripts/eval/rank.ts): graded
 * relevance metrics, and an emulation of arXiv's search over a frozen pool so
 * mood plans can be compared without sending traffic to arXiv.
 */

/** Relevance grades per paper id: 2 = clearly fits the mood, 1 = related, absent = 0 (unjudged counts as 0). */
export type Grades = Record<string, 1 | 2>;

export type PoolPaper = { id: string; title: string; abstract: string; primaryCategory: string; categories: string[]; published: string };

const grade = (grades: Grades, id: string) => grades[id] ?? 0;

/** Share of the top k that is at least related (grade ≥ 1). */
export function precisionAt(k: number, ranked: string[], grades: Grades): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((id) => grade(grades, id) >= 1).length / k;
}

const gain = (g: number) => 2 ** g - 1;
const dcg = (gs: number[]) => gs.reduce((sum, g, i) => sum + gain(g) / Math.log2(i + 2), 0);

/** Normalised discounted cumulative gain at k, against the ideal ordering of every judged paper. */
export function ndcgAt(k: number, ranked: string[], grades: Grades): number {
  const ideal = dcg(
    Object.values(grades)
      .sort((a, b) => b - a)
      .slice(0, k),
  );
  if (ideal === 0) return 0;
  return dcg(ranked.slice(0, k).map((id) => grade(grades, id))) / ideal;
}

/**
 * Of the primary categories that hold at least one clearly relevant paper,
 * the share that shows up (via a relevant paper) in the top k.
 */
export function categoryCoverage(k: number, ranked: string[], grades: Grades, categoryOf: (id: string) => string | undefined): number {
  const wanted = new Set(
    Object.entries(grades)
      .filter(([, g]) => g === 2)
      .map(([id]) => categoryOf(id))
      .filter(Boolean),
  );
  if (wanted.size === 0) return 0;
  const shown = new Set(
    ranked
      .slice(0, k)
      .filter((id) => grade(grades, id) >= 1)
      .map(categoryOf),
  );
  return [...wanted].filter((c) => shown.has(c)).length / wanted.size;
}

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
/** Crude stemming so "holes" matches "hole" and "agents" matches "agent", close to arXiv's analyser. */
const stem = (w: string) =>
  w
    .replace(/-/g, "")
    .replace(/sses$/u, "ss")
    .replace(/ies$/u, "y")
    .replace(/([^su])s$/u, "$1");

/**
 * Emulates one arXiv query: every keyword must appear (title or abstract),
 * and the paper must be in one of the categories when any are given.
 */
export function matchesQuery(paper: PoolPaper, keywords: string[], categories: string[]): boolean {
  if (categories.length && !paper.categories.some((c) => categories.includes(c))) return false;
  const vocab = new Set(words(`${paper.title} ${paper.abstract}`).map(stem));
  return keywords.every((k) => vocab.has(stem(k.toLowerCase())));
}

/**
 * The candidates a mood plan would retrieve: each keyword group's matches (up
 * to `perQuery`, like the live feed's pages), de-duplicated, in plan order.
 * A plan with no keywords falls back to its categories alone.
 */
export function retrieve(pool: PoolPaper[], plan: { keywords: string[][]; categories: string[] }, perQuery = 75): PoolPaper[] {
  const groups = plan.keywords.length ? plan.keywords : [[]];
  const out = new Map<string, PoolPaper>();
  for (const keywords of groups) {
    if (keywords.length === 0 && plan.categories.length === 0) continue;
    for (const p of pool.filter((x) => matchesQuery(x, keywords, plan.categories)).slice(0, perQuery)) out.set(p.id, p);
  }
  return [...out.values()];
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
