/**
 * One-time (resumable) setup for the ranking eval. This is the only part that
 * spends money; `npm run eval:rank` itself is free and offline.
 *
 *   1. pool.json   ← every paper in the cached arXiv responses (data/arxiv/), no network
 *   2. plans.json  ← each mood's Claude plan (expandMood: Haiku, disk-cached) + its keyword fallback
 *   3. labels.json ← Haiku relevance judgments (0–2) for each mood's pooled candidates:
 *                    the union of every system's top 30, as in TREC-style pooling
 *
 * Spend is capped at $0.25 for this task (PLAN.md), on top of the app's $10 guard.
 * Run: npm run eval:rank:build   (add --pool to rebuild the pool, --no-labels to skip judging)
 */
import fs from "node:fs";
import path from "node:path";
import { parseAtomFeed } from "@/lib/arxiv/parse";
import { budgetStatus } from "@/lib/budget";
import { callClaude, textOf } from "@/lib/claude";
import { expandMood } from "@/lib/mood/expand";
import { fallbackPlan, normalizeMood } from "@/lib/mood/query";
import type { PoolPaper } from "@/lib/eval/rank-metrics";
import { SYSTEMS, embedAll, evalNow, file, loadInputs, readJson, run, writeJson, type Ctx, type Labels, type Plans } from "./rank-lib";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No key: plans fall back and judging stops with a clear message.
}

const TASK_CAP_USD = 0.25;
const SAFETY_USD = 0.03;
const JUDGE_MODEL = "claude-haiku-5-5";
const POOL_DEPTH = 30;
const MAX_JUDGED = 100;
const CHUNK = 50;
/** Stay under the app's per-minute rate limit. */
const CALL_GAP_MS = 3_500;

// Measured from the first check, which runs before the first call.
let startSpent: number | undefined;
const taskSpend = async () => {
  const { spentUsd } = await budgetStatus();
  startSpent ??= spentUsd;
  return spentUsd - startSpent;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function checkCap() {
  const spent = await taskSpend();
  if (spent > TASK_CAP_USD - SAFETY_USD) throw new Error(`task spend cap reached ($${spent.toFixed(4)})`);
}

function buildPool() {
  const dir = path.join(process.cwd(), "data", "arxiv");
  const papers = new Map<string, PoolPaper>();
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
    for (const p of parseAtomFeed(fs.readFileSync(path.join(dir, name), "utf8")).papers) {
      papers.set(p.id, { id: p.id, title: p.title, abstract: p.abstract, primaryCategory: p.primaryCategory, categories: p.categories, published: p.published });
    }
  }
  const pool = [...papers.values()].sort((a, b) => a.id.localeCompare(b.id));
  writeJson("pool.json", pool);
  console.log(`pool: ${pool.length} papers from cached arXiv responses`);
}

async function buildPlans(moods: string[]) {
  const plans = readJson<Plans>("plans.json", {});
  for (const mood of moods) {
    if (plans[mood]?.claude) continue;
    await checkCap();
    const plan = await expandMood(mood);
    plans[mood] = { claude: plan.source === "claude" ? plan : null, fallback: fallbackPlan(normalizeMood(mood)) };
    writeJson("plans.json", plans);
    console.log(`plan: ${mood} → ${plan.source} ${JSON.stringify(plan.keywords)} [${plan.categories.join(", ")}]`);
    if (plan.source === "claude") await sleep(CALL_GAP_MS);
  }
  return plans;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["clearly", "related"],
  properties: {
    clearly: { type: "array", items: { type: "integer" }, description: "Numbers of papers that clearly fit the mood." },
    related: { type: "array", items: { type: "integer" }, description: "Numbers of papers that are related but not a clear fit." },
  },
} as const;

const JUDGE_SYSTEM = `You judge search results for a feed of arXiv papers. A reader typed a mood; for each numbered paper decide whether it fits.
- clearly: a reader with this mood would be glad to see it; it is squarely on topic.
- related: same field or a partial match, but not what they asked for.
- anything else: not relevant (leave it out).
Judge the paper's actual topic, not shared buzzwords. Vague moods ("something mind-bending") are judged by whether the paper delivers that feeling.`;

async function judge(mood: string, papers: PoolPaper[]) {
  const list = papers.map((p, i) => `[${i + 1}] ${p.title} (${p.primaryCategory}): ${p.abstract.slice(0, 350)}`).join("\n");
  const message = await callClaude("eval-judge", {
    model: JUDGE_MODEL,
    max_tokens: 1500,
    // A judgment list, not a reasoning task: thinking would eat the token budget.
    thinking: { type: "disabled" },
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: `Mood: ${JSON.stringify(mood)}\n\nPapers:\n${list}` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });
  let raw: { clearly: number[]; related: number[] };
  try {
    raw = JSON.parse(textOf(message));
  } catch {
    throw new Error(`judge reply unusable (stop_reason ${message.stop_reason}, ${message.usage.output_tokens} tokens): ${textOf(message).slice(0, 300)}`);
  }
  const grades: Record<string, 1 | 2> = {};
  for (const n of raw.related) if (papers[n - 1]) grades[papers[n - 1].id] = 1;
  for (const n of raw.clearly) if (papers[n - 1]) grades[papers[n - 1].id] = 2;
  return grades;
}

async function buildLabels(ctx: Ctx, moods: string[]) {
  const labels = readJson<Labels>("labels.json", {});
  const byId = new Map(ctx.pool.map((p) => [p.id, p]));
  for (const mood of moods) {
    const pooled = new Set<string>();
    for (const system of SYSTEMS) for (const id of run(ctx, mood, system).slice(0, POOL_DEPTH)) pooled.add(id);
    for (const id of run(ctx, mood, "rank whole pool", { recency: 0, diversity: 0 }).slice(0, POOL_DEPTH)) pooled.add(id);
    const entry = (labels[mood] ??= { judged: [], grades: {} });
    const todo = [...pooled].filter((id) => !entry.judged.includes(id)).slice(0, Math.max(0, MAX_JUDGED - entry.judged.length));
    for (let i = 0; i < todo.length; i += CHUNK) {
      await checkCap();
      const chunk = todo.slice(i, i + CHUNK).map((id) => byId.get(id)!);
      Object.assign(entry.grades, await judge(mood, chunk));
      entry.judged.push(...chunk.map((p) => p.id));
      writeJson("labels.json", labels);
      await sleep(CALL_GAP_MS);
    }
    const g = Object.values(entry.grades);
    console.log(`labels: ${mood}: ${entry.judged.length} judged, ${g.filter((x) => x === 2).length} clearly, ${g.filter((x) => x === 1).length} related`);
  }
}

async function main() {
  if (!fs.existsSync(file("pool.json")) || process.argv.includes("--pool")) buildPool();
  const { pool, moods } = loadInputs();
  const plans = await buildPlans(moods);
  const ctx: Ctx = { ...(await embedAll(pool, moods)), pool, plans, now: evalNow(pool) };
  if (!process.argv.includes("--no-labels")) await buildLabels(ctx, moods);
  console.log(`task spend: $${(await taskSpend()).toFixed(4)} (cap $${TASK_CAP_USD})`);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  console.log(`task spend: $${(await taskSpend()).toFixed(4)} (cap $${TASK_CAP_USD})`);
  process.exit(1);
});
