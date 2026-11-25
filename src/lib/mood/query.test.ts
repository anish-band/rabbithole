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
  assert.deepEqual(fallbackPlan("black holes").keywords, [["black", "holes"]]);
  assert.deepEqual(fallbackPlan("galaxies").keywords, [["galaxies"]]);
  assert.equal(fallbackPlan("black holes").source, "fallback");
  assert.deepEqual(fallbackPlan("the").keywords, []);
});

test("fallbackPlan adds overlapping pairs for longer moods, never single words", () => {
  assert.deepEqual(fallbackPlan("practical LLM agents").keywords, [
    ["practical", "llm", "agents"],
    ["practical", "llm"],
    ["llm", "agents"],
    ["practical", "agents"],
  ]);
  const long = fallbackPlan("how neutron stars and high-energy astrophysics work").keywords;
  assert.equal(long.length, 4);
  assert.deepEqual(long[0], ["neutron", "stars", "high-energy", "astrophysics", "work"]);
  assert.ok(long.slice(1).every((g) => g.length === 2));
});
