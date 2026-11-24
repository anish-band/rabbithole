import assert from "node:assert/strict";
import { test } from "node:test";
import { centroid, dot, rank, type Candidate } from "./score";

const unit = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return xs.map((x) => x / n);
};
const c = (id: string, vec: number[], published?: string): Candidate<string> => ({ item: id, id, vec: unit(...vec), published });
const ids = (r: { id: string }[]) => r.map((x) => x.id);

test("dot and centroid", () => {
  assert.equal(dot([1, 0], [0, 1]), 0);
  const m = centroid([unit(1, 0), unit(0, 1)])!;
  assert.ok(Math.abs(Math.hypot(...m) - 1) < 1e-6);
  assert.equal(centroid([]), undefined);
});

test("mood similarity orders candidates", () => {
  const r = rank({ candidates: [c("far", [0, 1]), c("near", [1, 0.1])], mood: unit(1, 0) });
  assert.deepEqual(ids(r), ["near", "far"]);
});

test("likes pull related papers up; dislikes push them down", () => {
  const candidates = [c("a", [1, 0, 0]), c("b", [0, 1, 0])];
  assert.deepEqual(ids(rank({ candidates, liked: [unit(0, 1, 0)] })), ["b", "a"]);
  assert.deepEqual(ids(rank({ candidates, disliked: [unit(0, 1, 0)] })), ["a", "b"]);
});

test("hidden papers are removed, seen ones demoted, duplicates collapsed", () => {
  const candidates = [c("x", [1, 0]), c("y", [1, 0.05]), c("x", [1, 0]), c("z", [0.9, 0.1])];
  const r = rank({ candidates, mood: unit(1, 0), hidden: new Set(["y"]), seen: new Set(["x"]) });
  assert.deepEqual(ids(r), ["z", "x"]);
});

test("newer papers win ties", () => {
  const now = Date.parse("2026-11-24");
  const r = rank({ candidates: [c("old", [1, 0], "2025-01-01"), c("new", [1, 0], "2026-11-20")], now });
  assert.deepEqual(ids(r), ["new", "old"]);
});

test("diversity keeps near-duplicates from bunching up", () => {
  const candidates = [c("a1", [1, 0, 0]), c("a2", [1, 0.01, 0]), c("b", [0.75, 0, 0.66])];
  const r = rank({ candidates, mood: unit(1, 0, 0.3) });
  assert.equal(r[0].id.startsWith("a"), true);
  assert.equal(r[1].id, "b", "a different paper is placed before the near-duplicate");
});

test("jitter is bounded and deterministic with a seeded random", () => {
  const candidates = [c("a", [1, 0]), c("b", [0.99, 0.14])];
  const r1 = rank({ candidates, mood: unit(1, 0), jitter: 0.05, random: () => 0.5 });
  assert.deepEqual(ids(r1), ["a", "b"]);
  for (const x of r1) assert.ok(Math.abs(x.parts.jitter) <= 0.05);
});

test("weight overrides change the ordering without touching the defaults", () => {
  const now = Date.parse("2026-11-24");
  // "old" matches the mood slightly better; "new" is fresher.
  const candidates = [c("old", [1, 0.05], "2026-01-01"), c("new", [1, 0.2], "2026-11-23")];
  const mood = unit(1, 0);
  assert.deepEqual(ids(rank({ candidates, mood, now, weights: { recency: 0 } })), ["old", "new"]);
  assert.deepEqual(ids(rank({ candidates, mood, now, weights: { recency: 1 } })), ["new", "old"]);
});
