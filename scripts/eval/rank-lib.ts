/**
 * Shared pieces of the offline ranking eval: the frozen inputs under
 * eval/rank/, and the systems being compared. Nothing here calls arXiv or
 * Claude; embeddings use the local model (cached under data/).
 */
import fs from "node:fs";
import path from "node:path";
import { fallbackPlan, type MoodPlan } from "@/lib/mood/query";
import { embedPapers, embedQuery } from "@/lib/rank/embed";
import { rank, type Weights } from "@/lib/rank/score";
import { retrieve, type Grades, type PoolPaper } from "@/lib/eval/rank-metrics";

export const DIR = path.join(process.cwd(), "eval", "rank");
export const file = (name: string) => path.join(DIR, name);
export const readJson = <T>(name: string, fallback?: T): T =>
  fs.existsSync(file(name)) ? (JSON.parse(fs.readFileSync(file(name), "utf8")) as T) : (fallback as T);
export const writeJson = (name: string, data: unknown) => fs.writeFileSync(file(name), `${JSON.stringify(data, null, 1)}\n`);

export type Plans = Record<string, { claude: MoodPlan | null; fallback: MoodPlan }>;
export type Labels = Record<string, { judged: string[]; grades: Grades }>;
export type SystemName = "claude plan → rank" | "keyword fallback → rank" | "rank whole pool";
export const SYSTEMS: SystemName[] = ["claude plan → rank", "keyword fallback → rank", "rank whole pool"];

export function loadInputs() {
  const pool = readJson<PoolPaper[]>("pool.json");
  const moods = readJson<string[]>("moods.json");
  const plans = readJson<Plans>("plans.json", {});
  const labels = readJson<Labels>("labels.json", {});
  return { pool, moods, plans, labels };
}

/** Fixed "now" (a day after the newest paper) so recency, and so the eval, is deterministic. */
export const evalNow = (pool: PoolPaper[]) => Math.max(...pool.map((p) => Date.parse(p.published))) + 86_400_000;

export async function embedAll(pool: PoolPaper[], moods: string[]) {
  const paperVecs = await embedPapers(pool);
  const moodVecs = new Map<string, Float32Array>();
  for (const m of moods) moodVecs.set(m, await embedQuery(m));
  return { paperVecs, moodVecs };
}

export type Ctx = Awaited<ReturnType<typeof embedAll>> & { pool: PoolPaper[]; plans: Plans; now: number };

/** Ranked ids for one mood under one system (deterministic: no jitter). */
export function run(ctx: Ctx, mood: string, system: SystemName, weights?: Partial<Weights>): string[] {
  const plan = ctx.plans[mood];
  const candidates =
    system === "rank whole pool"
      ? ctx.pool
      : retrieve(ctx.pool, system === "claude plan → rank" ? (plan?.claude ?? plan?.fallback ?? fallbackPlan(mood)) : (plan?.fallback ?? fallbackPlan(mood)));
  return rank({
    candidates: candidates.map((p) => ({ item: p.id, id: p.id, vec: ctx.paperVecs.get(p.id)!, published: p.published })),
    mood: ctx.moodVecs.get(mood),
    jitter: 0,
    now: ctx.now,
    weights,
  }).map((r) => r.id);
}
