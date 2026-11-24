import assert from "node:assert/strict";
import { test } from "node:test";
import { arxivQuery, cleanCategories, cleanKeywords, fallbackPlan, normalizeMood } from "./query";

test("normalizeMood trims, lowercases and collapses spaces", () => {
  assert.equal(normalizeMood("  Weird   PHYSICS "), "weird physics");
});

test("cleanKeywords drops stopwords, syntax and duplicates", () => {
  assert.deepEqual(cleanKeywords(["I'm in the mood for weird physics", "physics AND cat:x)"]), ["weird", "physics", "catx"]);
  assert.deepEqual(cleanKeywords(['") OR all:*']), ["all"]);
  assert.deepEqual(cleanKeywords(["large-language models"]), ["large-language", "models"]);
});

test("cleanCategories keeps only valid arXiv codes", () => {
  assert.deepEqual(cleanCategories(["cs.LG", "hep-th", "cs.LG", "cat:cs.AI", "x) OR", "physics"]), ["cs.LG", "hep-th", "physics"]);
});

test("arxivQuery assembles keywords and categories", () => {
  assert.equal(arxivQuery(["black", "holes"], []), "all:black AND all:holes");
  assert.equal(arxivQuery(["agents"], ["cs.AI", "cs.LG"]), "(all:agents) AND (cat:cs.AI OR cat:cs.LG)");
  assert.equal(arxivQuery([], ["math.PR"]), "cat:math.PR");
});

test("fallbackPlan searches the mood's own words", () => {
  const plan = fallbackPlan("practical LLM agents");
  assert.deepEqual(plan.keywords, [["practical", "llm", "agents"]]);
  assert.equal(plan.source, "fallback");
  assert.deepEqual(fallbackPlan("the").keywords, []);
});
