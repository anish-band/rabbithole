import tsp from "@/fixtures/explainers/2611.31241.json";
import { parseExplainer, type Explainer } from "./schema";

/**
 * Hand-written explainers bundled with the app (used before/without Claude
 * generation, and by tests). Keyed by arXiv id without version.
 */
const SAMPLES: Record<string, unknown> = { "2611.31241": tsp };

const parsed = new Map<string, Explainer | null>();

export function sampleExplainer(id: string): Explainer | null {
  if (!(id in SAMPLES)) return null;
  if (!parsed.has(id)) parsed.set(id, parseExplainer(SAMPLES[id]));
  return parsed.get(id)!;
}
