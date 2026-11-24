import assert from "node:assert/strict";
import { test } from "node:test";
import papers from "../../fixtures/papers.json";
import { parseExplainer } from "./schema";
import { keyTerms, titleCard, wrap } from "./title-card";

test("wrap breaks on words and ellipsises overflow", () => {
  assert.deepEqual(wrap("one two three four", 9, 3), ["one two", "three", "four"]);
  assert.deepEqual(wrap("aaaa bbbb cccc dddd", 4, 2), ["aaaa", "bbb…"]);
});

test("keyTerms skips math, stopwords and short words", () => {
  const terms = keyTerms("We study $x^2$ graphs. Graphs and spectral graphs: spectral methods for networks.");
  assert.deepEqual(terms.slice(0, 2), ["graphs", "spectral"]);
  assert.ok(!terms.includes("study"));
});

test("title cards are valid explainers for every fixture paper", () => {
  for (const p of papers) {
    const card = parseExplainer(titleCard(p));
    assert.ok(card, `title card for ${p.id} is valid`);
    assert.ok(card.type === "scenes" && card.scenes.length >= 1);
  }
});
