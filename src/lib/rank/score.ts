/**
 * Pure ranking over precomputed, L2-normalised embeddings (so dot = cosine).
 * No model or I/O here; see `index.ts` for the server-side wrapper.
 *
 * score = mood·w + taste·w − dislike·w + recency·w + jitter, minus a penalty
 * for papers already seen; then a greedy MMR pass keeps the top of the feed
 * from being five near-duplicates.
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
};

export type Ranked<T> = { item: T; id: string; score: number; parts: Record<string, number> };

export const WEIGHTS = {
  mood: 1,
  taste: 0.45,
  dislike: 0.35,
  recency: 0.08,
  seen: 0.3,
  /** MMR: how much similarity to papers already placed costs. */
  diversity: 0.25,
};
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
}: RankInput<T>): Ranked<T>[] {
  const taste = centroid(liked);
  const unique = new Map<string, Candidate<T>>();
  for (const c of candidates) if (!hidden.has(c.id) && !unique.has(c.id)) unique.set(c.id, c);

  const scored = [...unique.values()].map((c) => {
    const parts: Record<string, number> = {};
    if (mood) parts.mood = WEIGHTS.mood * dot(c.vec, mood);
    if (taste) parts.taste = WEIGHTS.taste * dot(c.vec, taste);
    if (disliked.length) parts.dislike = -WEIGHTS.dislike * Math.max(0, ...disliked.map((d) => dot(c.vec, d)));
    parts.recency = WEIGHTS.recency * recency(c.published, now);
    if (seen.has(c.id)) parts.seen = -WEIGHTS.seen;
    if (jitter) parts.jitter = jitter * (random() * 2 - 1);
    const score = Object.values(parts).reduce((a, b) => a + b, 0);
    return { c, score, parts };
  });

  // Greedy maximal-marginal-relevance ordering.
  const out: Ranked<T>[] = [];
  const placed: Vector[] = [];
  const pool = scored.sort((a, b) => b.score - a.score);
  while (pool.length) {
    let best = 0;
    let bestScore = -Infinity;
    // Only the head of the pool can win; keeps this O(n·k) in practice.
    for (let i = 0; i < Math.min(pool.length, 40); i++) {
      const penalty = placed.length ? WEIGHTS.diversity * Math.max(...placed.map((p) => dot(pool[i].c.vec, p))) : 0;
      const s = pool[i].score - penalty;
      if (s > bestScore) [best, bestScore] = [i, s];
    }
    const [pick] = pool.splice(best, 1);
    placed.push(pick.c.vec);
    out.push({ item: pick.c.item, id: pick.c.id, score: pick.score, parts: pick.parts });
  }
  return out;
}
