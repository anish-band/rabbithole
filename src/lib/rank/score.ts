/**
 * Pure ranking over precomputed, L2-normalised embeddings (so dot = cosine).
 * No model or I/O here; see `index.ts` for the server-side wrapper.
 *
 * score = mood·w + taste·w − dislike·w + recency·w + jitter, minus a penalty
 * for papers already seen; then a greedy MMR pass keeps the top of the feed
 * from being five near-duplicates (only very similar papers are penalised).
 */
export type Vector = Float32Array | number[];

export type Candidate<T> = { item: T; id: string; vec: Vector; published?: string };

export type RankInput<T> = {
  candidates: Candidate<T>[];
  /** Embedding of the mood text, if any. */
  mood?: Vector;
  /** Embeddings of liked/saved papers (the taste profile). */
  liked?: Vector[];
  /** Embeddings of "not interested" and skipped papers. */
  disliked?: Vector[];
  /** Never shown. */
  hidden?: Set<string>;
  /** Shown before: demoted, not removed. */
  seen?: Set<string>;
  /** 0 → deterministic; ~0.05 keeps the feed from going stale. */
  jitter?: number;
  random?: () => number;
  now?: number;
  /** Overrides for the default weights (used by the ranking eval's sweep). */
  weights?: Partial<Weights>;
};

export type Ranked<T> = { item: T; id: string; score: number; parts: Record<string, number> };

export const WEIGHTS = {
  mood: 1,
  taste: 0.45,
  dislike: 0.35,
  recency: 0.08,
  seen: 0.3,
  /** MMR: max cost of being a near-duplicate of a paper already placed. */
  diversity: 0.25,
  /** Similarity below this is "different enough" and costs nothing. */
  duplicateFloor: 0.5,
};
export type Weights = typeof WEIGHTS;
/** Recency decays with this half-life. */
const RECENCY_HALF_LIFE_DAYS = 30;

export function dot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Mean of normalised vectors, re-normalised. Undefined when empty. */
export function centroid(vectors: Vector[]): Float32Array | undefined {
  if (vectors.length === 0) return undefined;
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i];
  const norm = Math.hypot(...out) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function recency(published: string | undefined, now: number): number {
  if (!published) return 0;
  const days = (now - Date.parse(published)) / 86_400_000;
  return Number.isFinite(days) ? Math.pow(0.5, Math.max(0, days) / RECENCY_HALF_LIFE_DAYS) : 0;
}

export function rank<T>({
  candidates,
  mood,
  liked = [],
  disliked = [],
  hidden = new Set(),
  seen = new Set(),
  jitter = 0,
  random = Math.random,
  now = Date.now(),
  weights,
}: RankInput<T>): Ranked<T>[] {
  const W: Weights = { ...WEIGHTS, ...weights };
  const taste = centroid(liked);
  const unique = new Map<string, Candidate<T>>();
  for (const c of candidates) if (!hidden.has(c.id) && !unique.has(c.id)) unique.set(c.id, c);

  const scored = [...unique.values()].map((c) => {
    const parts: Record<string, number> = {};
    if (mood) parts.mood = W.mood * dot(c.vec, mood);
    if (taste) parts.taste = W.taste * dot(c.vec, taste);
    if (disliked.length) parts.dislike = -W.dislike * Math.max(0, ...disliked.map((d) => dot(c.vec, d)));
    parts.recency = W.recency * recency(c.published, now);
    if (seen.has(c.id)) parts.seen = -W.seen;
    if (jitter) parts.jitter = jitter * (random() * 2 - 1);
    const score = Object.values(parts).reduce((a, b) => a + b, 0);
    // Similarity to the closest paper placed so far (none yet: 0, which costs nothing below the floor).
    return { c, score, parts, closest: 0 };
  });

  // Greedy maximal-marginal-relevance ordering. Each candidate's `closest` is
  // updated once per placement (n² dot products in total) instead of being
  // recomputed against every placed paper on every pass, which was the feed's
  // main CPU cost under load (#27). Same result, since max is order-independent.
  const out: Ranked<T>[] = [];
  const pool = scored.sort((a, b) => b.score - a.score);
  while (pool.length) {
    let best = 0;
    let bestScore = -Infinity;
    // Only the head of the pool can win.
    for (let i = 0; i < Math.min(pool.length, 40); i++) {
      const penalty = (W.diversity * Math.max(0, pool[i].closest - W.duplicateFloor)) / (1 - W.duplicateFloor);
      const s = pool[i].score - penalty;
      if (s > bestScore) [best, bestScore] = [i, s];
    }
    const [pick] = pool.splice(best, 1);
    for (const rest of pool) {
      const sim = dot(rest.c.vec, pick.c.vec);
      if (sim > rest.closest) rest.closest = sim;
    }
    out.push({ item: pick.c.item, id: pick.c.id, score: pick.score, parts: pick.parts });
  }
  return out;
}
