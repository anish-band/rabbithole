import assert from "node:assert/strict";
import { test } from "node:test";
import sample from "../../fixtures/explainers/2611.31241.json";
import { parseExplainer } from "./schema";

test("the hand-written sample script is valid and gets defaults", () => {
  const e = parseExplainer(sample);
  assert.ok(e && e.type === "scenes");
  assert.equal(e.scenes.length, 5);
  const first = e.scenes[0].elements[0];
  assert.equal(first.kind, "rect");
  assert.equal(first.enter?.effect, "draw");
});

test("rejects unknown kinds, out-of-canvas coordinates and bad videos", () => {
  const scene = (el: object) => ({ type: "scenes", version: 1, scenes: [{ caption: "x", duration: 3000, elements: [el] }] });
  assert.equal(parseExplainer(scene({ kind: "iframe", src: "x" })), null);
  assert.equal(parseExplainer(scene({ kind: "circle", x: 9999, y: 10, r: 2 })), null);
  assert.equal(parseExplainer({ type: "video", url: "javascript:alert(1)" }), null);
  assert.equal(parseExplainer({ type: "video", url: "http://example.com/v.mp4" }), null);
  assert.ok(parseExplainer({ type: "video", url: "https://example.com/v.mp4" }));
});
