import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryName, formatDate, splitAuthors } from "./format";

test("categoryName maps known codes and falls back to the code", () => {
  assert.equal(categoryName("cs.LG"), "Machine Learning");
  assert.equal(categoryName("nlin.CD"), "nlin.CD");
});

test("formatDate is stable across time zones", () => {
  assert.equal(formatDate("2026-11-23T23:59:00Z"), "Nov 23, 2026");
});

test("splitAuthors hides only when it saves more than one name", () => {
  assert.deepEqual(splitAuthors(["a", "b", "c", "d"]), { visible: ["a", "b", "c", "d"], hidden: [] });
  assert.deepEqual(splitAuthors(["a", "b", "c", "d", "e"]), { visible: ["a", "b", "c"], hidden: ["d", "e"] });
});
