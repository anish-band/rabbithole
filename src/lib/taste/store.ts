/**
 * On-device taste profile: likes, saves, "not interested", and viewing history.
 * Pure functions over a plain JSON state so they're easy to test; persistence
 * lives in `use-taste.ts`. Nothing here leaves the device except the compact
 * `tasteSignals()` summary sent with feed requests (#7).
 */
import type { Paper } from "@/lib/arxiv/types";

export const STORAGE_KEY = "rabbithole:taste";
export const SCHEMA_VERSION = 1;
/** Keep the last N views; enough to rank against without growing forever. */
export const HISTORY_LIMIT = 300;
/** A view shorter than this counts as a skip. */
export const SKIP_MS = 2500;

export type Reaction = "liked" | "saved" | "hidden";
export type Reactions = Record<Reaction, boolean>;
export const NO_REACTIONS: Reactions = { liked: false, saved: false, hidden: false };

/** Just enough of a paper to list it in the saved drawer without refetching. */
export type PaperRef = Pick<Paper, "id" | "title" | "authors" | "primaryCategory" | "absUrl" | "published">;

export type View = { id: string; at: number; dwellMs: number };

export type TasteState = {
  v: typeof SCHEMA_VERSION;
  reactions: Record<string, Reactions & { at: number }>;
  /** Snapshots of papers the user reacted to (needed for the saved drawer). */
  papers: Record<string, PaperRef>;
  /** Most recent first. */
  history: View[];
};

export const emptyState = (): TasteState => ({ v: SCHEMA_VERSION, reactions: {}, papers: {}, history: [] });

export function reactionsFor(state: TasteState, id: string): Reactions {
  const r = state.reactions[id];
  return r ? { liked: r.liked, saved: r.saved, hidden: r.hidden } : NO_REACTIONS;
}

const toRef = (p: Paper | PaperRef): PaperRef => ({
  id: p.id,
  title: p.title,
  authors: p.authors.slice(0, 8),
  primaryCategory: p.primaryCategory,
  absUrl: p.absUrl,
  published: p.published,
});

/**
 * Flip one reaction. Liking and "not interested" contradict each other, so
 * turning one on clears the other. Papers with no reactions left are dropped.
 */
export function toggle(state: TasteState, paper: Paper | PaperRef, reaction: Reaction, now = Date.now()): TasteState {
  const current = reactionsFor(state, paper.id);
  const next = { ...current, [reaction]: !current[reaction] };
  if (next[reaction] && reaction === "liked") next.hidden = false;
  if (next[reaction] && reaction === "hidden") next.liked = false;

  const reactions = { ...state.reactions };
  const papers = { ...state.papers };
  if (next.liked || next.saved || next.hidden) {
    reactions[paper.id] = { ...next, at: now };
    papers[paper.id] = toRef(paper);
  } else {
    delete reactions[paper.id];
    delete papers[paper.id];
  }
  return { ...state, reactions, papers };
}

/** Record that a paper was on screen for `dwellMs`. Repeat views keep the longest dwell. */
export function recordView(state: TasteState, id: string, dwellMs: number, now = Date.now()): TasteState {
  const previous = state.history.find((v) => v.id === id);
  const view = { id, at: now, dwellMs: Math.max(Math.round(dwellMs), previous?.dwellMs ?? 0) };
  const history = [view, ...state.history.filter((v) => v.id !== id)].slice(0, HISTORY_LIMIT);
  return { ...state, history };
}

/** Saved papers, most recently saved first. */
export function savedPapers(state: TasteState): PaperRef[] {
  return Object.entries(state.reactions)
    .filter(([id, r]) => r.saved && state.papers[id])
    .sort(([, a], [, b]) => b.at - a.at)
    .map(([id]) => state.papers[id]);
}

/** Compact summary for the feed API: which papers to lean toward and away from. */
export type TasteSignals = { liked: string[]; saved: string[]; hidden: string[]; skipped: string[]; seen: string[] };

export function tasteSignals(state: TasteState): TasteSignals {
  const ids = (r: Reaction) => Object.keys(state.reactions).filter((id) => state.reactions[id][r]);
  const reacted = new Set(Object.keys(state.reactions));
  return {
    liked: ids("liked"),
    saved: ids("saved"),
    hidden: ids("hidden"),
    skipped: state.history.filter((v) => v.dwellMs < SKIP_MS && !reacted.has(v.id)).map((v) => v.id),
    seen: state.history.map((v) => v.id),
  };
}

/** Parse stored JSON defensively: corrupt or unknown-version data yields an empty profile. */
export function parseState(raw: string | null): TasteState {
  if (!raw) return emptyState();
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== SCHEMA_VERSION || typeof data.reactions !== "object" || !Array.isArray(data.history)) {
      return emptyState();
    }
    return { v: SCHEMA_VERSION, reactions: data.reactions ?? {}, papers: data.papers ?? {}, history: data.history };
  } catch {
    return emptyState();
  }
}
