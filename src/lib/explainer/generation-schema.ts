import { z } from "zod";
import { ScenesExplainerSchema } from "./schema";

/** What one Claude call returns for a paper: the explainer plus the info-panel summary. */
export const GenerationSchema = z.object({
  tldr: z.string().min(10).max(240),
  keyPoints: z.array(z.string().min(5).max(200)).length(3),
  explainer: ScenesExplainerSchema,
});
export type Generation = z.output<typeof GenerationSchema>;

/**
 * Structured outputs accept a subset of JSON Schema: no numeric/length/array
 * constraints, no tuples, `additionalProperties: false` on every object, and
 * `anyOf` rather than `oneOf`. We send this relaxed shape to the API and
 * enforce the full zod schema (ranges, lengths, defaults) on what comes back.
 */
const DROP = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "default",
]);

type Json = { [key: string]: unknown };

export function toModelSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toModelSchema);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    if (DROP.has(key)) continue;
    if (key === "prefixItems" && Array.isArray(value)) {
      // Tuples (points) become plain arrays of the first item type; zod checks the length.
      out.items = toModelSchema(value[0]);
      continue;
    }
    if (key === "items" && value === false) continue;
    out[key === "oneOf" ? "anyOf" : key] = toModelSchema(value);
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

export const MODEL_SCHEMA = toModelSchema(z.toJSONSchema(GenerationSchema, { io: "input" })) as Json;
