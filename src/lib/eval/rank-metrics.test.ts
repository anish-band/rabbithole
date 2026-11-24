import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryCoverage, matchesQuery, ndcgAt, precisionAt, retrieve, type PoolPaper } from "./rank-metrics";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

test("precision@k counts related papers in the top k", () => {
  const grades = { a: 2, c: 1 } as const;
  close(precisionAt(4, ["a", "b", "c", "d"], grades), 0.5);
  close(precisionAt(2, ["b", "d"], grades), 0);
  // A short list still divides by k: missing slots are misses.
  close(precisionAt(4, ["a"], grades), 0.25);
});

test("nDCG@k is 1 for the ideal order and lower otherwise", () => {
  const grades = { a: 2, b: 1 } as const;
  close(ndcgAt(10, ["a", "b", "x"], grades), 1);
  assert.ok(ndcgAt(10, ["b", "a"], grades) < 1);
  assert.ok(ndcgAt(10, ["x", "y", "a"], grades) < ndcgAt(10, ["a", "x", "y"], grades));
  close(ndcgAt(10, ["a"], {}), 0);
});

test("category coverage is the share of relevant categories shown", () => {
  const cat: Record<string, string> = { a: "cs.CL", b: "cs.CL", c: "cs.AI", d: "cs.CV" };
  const grades = { a: 2, c: 2, d: 1 } as const;
  close(categoryCoverage(2, ["a", "b"], grades, (id) => cat[id]), 0.5);
  close(categoryCoverage(3, ["a", "c", "d"], grades, (id) => cat[id]), 1);
});

const paper = (id: string, text: string, categories = ["cs.CL"]): PoolPaper => ({
  id,
  title: text,
  abstract: "",
  primaryCategory: categories[0],
  categories,
  published: "2026-11-01",
});

test("query emulation needs every keyword and one of the categories", () => {
  const p = paper("1", "Black holes and gravitational waves", ["gr-qc"]);
  assert.ok(matchesQuery(p, ["black", "hole"], []));
  assert.ok(matchesQuery(p, ["gravitational", "wave"], ["gr-qc", "hep-th"]));
  assert.ok(!matchesQuery(p, ["black", "matter"], []));
  assert.ok(!matchesQuery(p, ["black"], ["cs.CL"]));
});

test("retrieve unions keyword groups without duplicates", () => {
  const pool = [paper("1", "LLM agents use tools"), paper("2", "Tool use benchmark"), paper("3", "Image segmentation")];
  const got = retrieve(pool, { keywords: [["tool"], ["agent"]], categories: [] }).map((p) => p.id);
  assert.deepEqual(got, ["1", "2"]);
  assert.deepEqual(retrieve(pool, { keywords: [], categories: [] }), []);
});

test("plurals match their singular", () => {
  const p = paper("1", "Policies for classes of waves and agents");
  assert.ok(matchesQuery(p, ["policy", "class", "wave", "agent"], []));
  assert.ok(!matchesQuery(paper("2", "This status"), ["statu"], []));
});
