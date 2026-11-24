import "server-only";
import type { Paper } from "@/lib/arxiv/types";
import type { TasteSignals } from "@/lib/taste/store";
import { cachedEmbeddings, embedPapers, embedQuery } from "./embed";
import { rank, type Ranked } from "./score";

export { rank, WEIGHTS } from "./score";
export type { Ranked } from "./score";

/** Only the most recent negatives matter; keeps per-request work bounded. */
const MAX_NEGATIVES = 50;
const MAX_POSITIVES = 100;
const DEFAULT_JITTER = 0.04;

export type RankOptions = {
  mood?: string;
  signals?: Partial<TasteSignals>;
  jitter?: number;
  random?: () => number;
};

/**
 * Rank arXiv papers for this user: embeds candidates (disk-cached), the mood
 * (memoised) and builds the taste profile from cached embeddings of papers the
 * user liked or saved. Papers the user never saw served by this app have no
 * cached embedding yet and are simply skipped from the profile.
 */
export async function rankPapers(papers: Paper[], { mood, signals = {}, jitter = DEFAULT_JITTER, random }: RankOptions = {}): Promise<Ranked<Paper>[]> {
  const positives = [...new Set([...(signals.liked ?? []), ...(signals.saved ?? [])])].slice(0, MAX_POSITIVES);
  const negatives = [...new Set([...(signals.hidden ?? []), ...(signals.skipped ?? [])])].slice(0, MAX_NEGATIVES);

  const [vecs, moodVec, liked, disliked] = await Promise.all([
    embedPapers(papers),
    mood?.trim() ? embedQuery(mood) : Promise.resolve(undefined),
    cachedEmbeddings(positives),
    cachedEmbeddings(negatives),
  ]);

  return rank({
    candidates: papers.map((p) => ({ item: p, id: p.id, vec: vecs.get(p.id)!, published: p.published })),
    mood: moodVec,
    liked,
    disliked,
    hidden: new Set(signals.hidden ?? []),
    seen: new Set(signals.seen ?? []),
    jitter,
    random,
  });
}
