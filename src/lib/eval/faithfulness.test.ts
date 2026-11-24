import assert from "node:assert/strict";
import { test } from "node:test";
import { extractClaims, rates, ratesByKind, sceneLabels, type Judged } from "./faithfulness";

test("scene labels collect text, math and axis titles, skipping shapes", () => {
  const labels = sceneLabels([
    { kind: "text", text: "train" },
    { kind: "math", tex: "k_0 = 1" },
    { kind: "axes", xLabel: "blocks k", yLabel: "optimal lr" },
    { kind: "circle" },
  ]);
  assert.deepEqual(labels, ["train", "$k_0 = 1$", "axis: blocks k", "axis: optimal lr"]);
});

test("claims cover the summary, every caption and non-empty on-screen text", () => {
  const claims = extractClaims({
    id: "1",
    title: "T",
    abstract: "A",
    summary: { tldr: "Short.", keyPoints: ["one", "two", "three"] },
    scenes: [
      { caption: "First.", labels: ["x", "y"] },
      { caption: "Second.", labels: [] },
    ],
  });
  assert.deepEqual(
    claims.map((c) => `${c.kind}${c.scene ?? ""}`),
    ["tldr", "key point", "key point", "key point", "caption1", "on-screen1", "caption2"],
  );
  assert.equal(claims[5].text, "x · y");
});

const j = (kind: Judged["kind"], verdict: Judged["verdict"]): Judged => ({ kind, text: "", verdict, reason: "" });

test("the rate ignores framing and counts unsupported among factual claims", () => {
  const judged = [j("tldr", "supported"), j("caption", "unsupported"), j("caption", "framing"), j("on-screen", "supported")];
  assert.deepEqual(rates(judged), { claims: 4, checked: 3, unsupported: 1, rate: 1 / 3 });
  assert.equal(ratesByKind(judged).caption.rate, 1);
  assert.equal(ratesByKind(judged)["key point"].rate, 0);
});
