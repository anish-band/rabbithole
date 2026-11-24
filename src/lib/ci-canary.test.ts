// Deliberately failing test: proves CI blocks a broken PR (#21). Never merge.
import { test } from "node:test";
import assert from "node:assert/strict";

test("ci canary fails on purpose", () => {
  assert.equal(1 + 1, 3);
});
