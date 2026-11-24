import assert from "node:assert/strict";
import { test } from "node:test";
import sample from "../../fixtures/explainers/2611.31241.json";
import { GenerationSchema, parseReply, validateReply } from "./generation-schema";

const reply = (explainer: unknown, keyPoints = ["one point", "two point", "three point"]) =>
  JSON.stringify({ tldr: "A short plain summary.", keyPoints, explainer });

test("a valid reply passes, fenced or not", () => {
  assert.ok(GenerationSchema.safeParse(parseReply(reply(sample))).success);
  assert.ok(GenerationSchema.safeParse(parseReply("```json\n" + reply(sample) + "\n```")).success);
});

test("zod rejects replies that break the rules", () => {
  assert.equal(GenerationSchema.safeParse(parseReply(reply(sample, ["one point", "two point"]))).success, false);
  assert.throws(() => parseReply("Sorry, I can't help with that."));
});

test("empty strings and nulls become unset fields", () => {
  const scene = {
    caption: "A scene caption.",
    duration: 5000,
    elements: [
      { kind: "text", x: 10, y: 10, text: "hi", size: null, exitAt: null, move: null },
      { kind: "axes", x: 10, y: 80, w: 60, h: 50, xLabel: "", yLabel: "n" },
    ],
  };
  const out = GenerationSchema.safeParse(parseReply(reply({ type: "scenes", version: 1, scenes: [scene] })));
  assert.ok(out.success, out.success ? "" : JSON.stringify(out.error.issues));
  const [text, axes] = out.data.explainer.scenes[0].elements;
  assert.equal(text.exitAt, undefined);
  assert.ok(axes.kind === "axes" && axes.xLabel === undefined && axes.yLabel === "n");
});

test("invalid elements are dropped, other problems fail", () => {
  const broken = structuredClone(sample) as typeof sample;
  (broken.scenes[0].elements as unknown[]).push({ kind: "axes", x: 10, y: 80, w: 60, h: 50, xLabel: "an axis label that is far too long to fit" });
  const ok = validateReply(parseReply(reply(broken)));
  assert.ok("data" in ok && ok.dropped === 1);
  assert.equal(ok.data.explainer.scenes[0].elements.length, sample.scenes[0].elements.length);
  assert.ok("error" in validateReply(parseReply(reply(sample, ["just one"]))));
});
