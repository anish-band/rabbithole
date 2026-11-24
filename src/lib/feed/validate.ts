import { cleanCategories } from "@/lib/mood/query";
import type { TasteSignals } from "@/lib/taste/store";

/** arXiv ids: new style (2411.01234) or old style (hep-th/9901001). */
const ARXIV_ID = /^([a-z-]+(\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})$/;
const MAX_IDS = 300;

const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && ARXIV_ID.test(v)).slice(0, MAX_IDS) : [];

export type ParsedFeedRequest = {
  mood?: string;
  signals: TasteSignals;
  exclude: string[];
  round: number;
};

/** Parse an untrusted /api/feed body into a bounded, well-typed request. */
export function parseFeedRequest(body: unknown): ParsedFeedRequest {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const s = (b.signals && typeof b.signals === "object" ? b.signals : {}) as Record<string, unknown>;
  const mood = typeof b.mood === "string" ? b.mood.trim().slice(0, 200) : "";
  const round = Number.isInteger(b.round) ? Math.min(Math.max(b.round as number, 0), 50) : 0;
  return {
    mood: mood || undefined,
    signals: {
      liked: ids(s.liked),
      saved: ids(s.saved),
      hidden: ids(s.hidden),
      skipped: ids(s.skipped),
      seen: ids(s.seen),
      categories: cleanCategories(Array.isArray(s.categories) ? s.categories.filter((c): c is string => typeof c === "string") : []),
    },
    exclude: ids(b.exclude),
    round,
  };
}
