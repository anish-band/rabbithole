import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HISTORY_LIMIT,
  emptyState,
  parseState,
  reactionsFor,
  recordView,
  savedPapers,
  tasteSignals,
  toggle,
  type PaperRef,
} from "./store";

const paper = (id: string): PaperRef => ({
  id,
  title: `Paper ${id}`,
  authors: ["A"],
  primaryCategory: "cs.LG",
  absUrl: `https://arxiv.org/abs/${id}`,
  published: "2026-11-01T00:00:00Z",
});

test("toggle flips a reaction and keeps a snapshot", () => {
  const s = toggle(emptyState(), paper("1"), "liked", 1);
  assert.deepEqual(reactionsFor(s, "1"), { liked: true, saved: false, hidden: false });
  assert.equal(s.papers["1"].title, "Paper 1");
  const off = toggle(s, paper("1"), "liked", 2);
  assert.deepEqual(reactionsFor(off, "1"), { liked: false, saved: false, hidden: false });
  assert.equal(off.papers["1"], undefined, "drops papers with no reactions");
});

test("like and not interested are exclusive; save is independent", () => {
  let s = toggle(emptyState(), paper("1"), "liked");
  s = toggle(s, paper("1"), "saved");
  s = toggle(s, paper("1"), "hidden");
  assert.deepEqual(reactionsFor(s, "1"), { liked: false, saved: true, hidden: true });
  s = toggle(s, paper("1"), "liked");
  assert.deepEqual(reactionsFor(s, "1"), { liked: true, saved: true, hidden: false });
});

test("toggle does not mutate the previous state", () => {
  const before = emptyState();
  toggle(before, paper("1"), "saved");
  assert.deepEqual(before, emptyState());
});

test("savedPapers is most recent first", () => {
  let s = toggle(emptyState(), paper("1"), "saved", 1);
  s = toggle(s, paper("2"), "saved", 2);
  s = toggle(s, paper("3"), "liked", 3);
  assert.deepEqual(savedPapers(s).map((p) => p.id), ["2", "1"]);
});

test("recordView dedupes, keeps the longest dwell and caps history", () => {
  let s = recordView(emptyState(), "1", 5000, 1);
  s = recordView(s, "2", 100, 2);
  s = recordView(s, "1", 300, 3);
  assert.deepEqual(s.history.map((v) => [v.id, v.dwellMs]), [["1", 5000], ["2", 100]]);
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = recordView(s, `x${i}`, 1);
  assert.equal(s.history.length, HISTORY_LIMIT);
});

test("tasteSignals reports skips but not for papers the user reacted to", () => {
  let s = recordView(emptyState(), "quick", 400);
  s = recordView(s, "long", 9000);
  s = recordView(s, "quick-liked", 300);
  s = toggle(s, paper("quick-liked"), "liked");
  s = toggle(s, paper("nope"), "hidden");
  const sig = tasteSignals(s);
  assert.deepEqual(sig.skipped, ["quick"]);
  assert.deepEqual(sig.liked, ["quick-liked"]);
  assert.deepEqual(sig.hidden, ["nope"]);
  assert.deepEqual(sig.seen, ["quick-liked", "long", "quick"]);
  assert.deepEqual(sig.categories, ["cs.LG"], "hidden papers don't count toward categories");
});

test("parseState tolerates missing, corrupt and foreign data", () => {
  assert.deepEqual(parseState(null), emptyState());
  assert.deepEqual(parseState("{not json"), emptyState());
  assert.deepEqual(parseState(JSON.stringify({ v: 99, reactions: {}, history: [] })), emptyState());
  const s = toggle(emptyState(), paper("1"), "saved", 1);
  assert.deepEqual(parseState(JSON.stringify(s)), s);
});
