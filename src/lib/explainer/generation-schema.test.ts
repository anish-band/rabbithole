import assert from "node:assert/strict";
import { test } from "node:test";
import sample from "../../fixtures/explainers/2611.31241.json";
import { GenerationSchema, MODEL_SCHEMA } from "./generation-schema";

const UNSUPPORTED = /"(\$schema|minimum|maximum|exclusiveMinimum|exclusiveMaximum|multipleOf|minLength|maxLength|minItems|maxItems|pattern|default|oneOf|prefixItems)"/;

test("the schema sent to the API uses only supported JSON Schema features", () => {
  const json = JSON.stringify(MODEL_SCHEMA);
  assert.doesNotMatch(json, UNSUPPORTED);
  // Every object is closed.
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (o.type === "object") assert.equal(o.additionalProperties, false);
      Object.values(o).forEach(walk);
    }
  };
  walk(MODEL_SCHEMA);
  assert.ok(json.includes('"anyOf"'), "element kinds are a union");
});

test("zod enforces what the API schema can't", () => {
  const ok = GenerationSchema.safeParse({ tldr: "A short plain summary.", keyPoints: ["one point", "two point", "three point"], explainer: sample });
  assert.ok(ok.success);
  const twoPoints = GenerationSchema.safeParse({ tldr: "A short plain summary.", keyPoints: ["one point", "two point"], explainer: sample });
  assert.equal(twoPoints.success, false);
});
