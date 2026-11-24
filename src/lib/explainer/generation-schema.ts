import { z } from "zod";
import { ScenesExplainerSchema } from "./schema";

/** What one Claude call returns for a paper: the explainer plus the info-panel summary. */
export const GenerationSchema = z.object({
  tldr: z.string().min(10).max(240),
  keyPoints: z.array(z.string().min(5).max(200)).length(3),
  explainer: ScenesExplainerSchema,
});
export type Generation = z.output<typeof GenerationSchema>;

type Issue = { path: PropertyKey[]; message: string };
const describe = (issues: Issue[]) => issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

/**
 * Validate a parsed reply, salvaging what we can: an element that breaks the
 * rules (an over-long label, a point off-canvas) is dropped rather than
 * throwing away the whole, paid-for script. Anything else invalid fails.
 */
export function validateReply(reply: unknown): { data: Generation; dropped: number } | { error: string } {
  let current = reply;
  let dropped = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = GenerationSchema.safeParse(current);
    if (result.success) {
      const empty = result.data.explainer.scenes.some((scene) => scene.elements.length === 0);
      return empty ? { error: "a scene lost all its elements" } : { data: result.data, dropped };
    }
    const bad = new Map<string, Set<number>>(); // "scene index" -> element indexes
    for (const issue of result.error.issues) {
      const [a, b, scene, c, element] = issue.path;
      if (a !== "explainer" || b !== "scenes" || c !== "elements" || typeof scene !== "number" || typeof element !== "number") {
        return { error: describe(result.error.issues) };
      }
      bad.set(String(scene), (bad.get(String(scene)) ?? new Set()).add(element));
    }
    const copy = structuredClone(current) as { explainer: { scenes: { elements: unknown[] }[] } };
    for (const [scene, elements] of bad) {
      const list = copy.explainer.scenes[Number(scene)].elements;
      copy.explainer.scenes[Number(scene)].elements = list.filter((_, i) => !elements.has(i));
      dropped += elements.size;
    }
    current = copy;
  }
  return { error: "still invalid after dropping elements" };
}

/**
 * The reply as JSON. Structured outputs can't take this schema (the element
 * union compiles to too large a grammar), so the model writes plain JSON and
 * zod is the gate. Tolerates a ```json fence; `null` and "" mean "not set".
 */
export function parseReply(text: string): unknown {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in reply");
  return fromModel(JSON.parse(body.slice(start, end + 1)));
}

function fromModel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromModel);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => [k, fromModel(v)]),
  );
}
