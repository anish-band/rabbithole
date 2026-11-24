import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFeedRequest } from "./validate";

test("parseFeedRequest accepts a well-formed body", () => {
  const r = parseFeedRequest({
    mood: "  weird physics ",
    round: 2,
    exclude: ["2611.31241", "hep-th/9901001"],
    signals: { liked: ["2611.00001"], categories: ["cs.LG"] },
  });
  assert.equal(r.mood, "weird physics");
  assert.equal(r.round, 2);
  assert.deepEqual(r.exclude, ["2611.31241", "hep-th/9901001"]);
  assert.deepEqual(r.signals.liked, ["2611.00001"]);
  assert.deepEqual(r.signals.categories, ["cs.LG"]);
});

test("parseFeedRequest drops junk and bounds everything", () => {
  const r = parseFeedRequest({
    mood: 42,
    round: -3,
    exclude: ["x) OR cat:*", 7, "2611.31241"],
    signals: { liked: "nope", categories: ["cs.LG) OR (cat:x"] },
  });
  assert.equal(r.mood, undefined);
  assert.equal(r.round, 0);
  assert.deepEqual(r.exclude, ["2611.31241"]);
  assert.deepEqual(r.signals.liked, []);
  assert.deepEqual(r.signals.categories, []);
  assert.deepEqual(parseFeedRequest(null).exclude, []);
  assert.equal(parseFeedRequest({ round: 1e9 }).round, 50);
});
