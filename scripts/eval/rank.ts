/**
 * Offline relevance eval for mood expansion + ranking. Free and deterministic:
 * frozen pool, plans and labels from eval/rank/ (built once by
 * `npm run eval:rank:build`), local embeddings, no arXiv or Claude calls.
 *
 *   npm run eval:rank                        → comparison table, sweep, eval/rank/report.md + results.json
 *   npm run eval:rank -- --check             → also exit 1 if the production system regressed vs baseline.json
 *   npm run eval:rank -- --update-baseline   → record the current numbers as the baseline
 */
import fs from "node:fs";
import { WEIGHTS, type Weights } from "@/lib/rank/score";
import { categoryCoverage, mean, ndcgAt, precisionAt, retrieve } from "@/lib/eval/rank-metrics";
import { SYSTEMS, embedAll, evalNow, file, loadInputs, planFor, readJson, run, writeJson, type Ctx, type SystemName } from "./rank-lib";

/** Allowed drop before --check fails (absolute, on a 0–1 scale). */
const TOLERANCE = 0.02;
const PRODUCTION: SystemName = "claude plan → rank";
const FALLBACK: SystemName = "keyword fallback → rank";

type Scores = { p8: number; ndcg10: number; coverage10: number; recall: number; judged10: number };
const fmt = (x: number) => x.toFixed(3);

async function main() {
  const { pool, moods, plans, labels } = loadInputs();
  const scored = moods.filter((m) => labels[m] && Object.values(labels[m].grades).some((g) => g === 2));
  const unscored = moods.filter((m) => !scored.includes(m));
  if (scored.length === 0) throw new Error("No labels yet: run `npm run eval:rank:build` first.");

  const ctx: Ctx = { ...(await embedAll(pool, moods)), pool, plans, now: evalNow(pool) };
  const categoryOf = new Map(pool.map((p) => [p.id, p.primaryCategory]));

  const evaluate = (mood: string, system: SystemName, weights?: Partial<Weights>): Scores => {
    const { grades, judged } = labels[mood];
    const ranked = run(ctx, mood, system, weights);
    const relevant = Object.keys(grades);
    const candidates =
      system === "rank whole pool" ? new Set(pool.map((p) => p.id)) : new Set(retrieve(pool, planFor(plans, mood, system)).map((p) => p.id));
    const judgedSet = new Set(judged);
    const top10 = ranked.slice(0, 10);
    return {
      // Strict: the judge is generous with "related", so P@8 counts clearly relevant papers only.
      p8: precisionAt(8, ranked, grades, 2),
      ndcg10: ndcgAt(10, ranked, grades),
      coverage10: categoryCoverage(10, ranked, grades, (id) => categoryOf.get(id)),
      recall: relevant.length ? relevant.filter((id) => candidates.has(id)).length / relevant.length : 0,
      judged10: top10.length ? top10.filter((id) => judgedSet.has(id)).length / top10.length : 1,
    };
  };
  const average = (rows: Scores[]): Scores => ({
    p8: mean(rows.map((r) => r.p8)),
    ndcg10: mean(rows.map((r) => r.ndcg10)),
    coverage10: mean(rows.map((r) => r.coverage10)),
    recall: mean(rows.map((r) => r.recall)),
    judged10: mean(rows.map((r) => r.judged10)),
  });

  // 1. Systems compared at the production weights.
  const perMood: Record<string, Record<string, Scores>> = {};
  for (const m of scored) perMood[m] = Object.fromEntries(SYSTEMS.map((s) => [s, evaluate(m, s)]));
  const systems = Object.fromEntries(SYSTEMS.map((s) => [s, average(scored.map((m) => perMood[m][s]))])) as Record<SystemName, Scores>;

  // 2. Weight sweep on the production system (no taste signals in this eval, so mood, recency and diversity matter).
  const sweep: { recency: number; diversity: number; scores: Scores }[] = [];
  for (const recency of [0, 0.04, 0.08, 0.16, 0.32])
    for (const diversity of [0, 0.125, 0.25, 0.5]) sweep.push({ recency, diversity, scores: average(scored.map((m) => evaluate(m, PRODUCTION, { recency, diversity }))) });
  sweep.sort((a, b) => b.scores.ndcg10 - a.scores.ndcg10);

  // Print.
  console.log(`\nRanking eval: ${scored.length} moods scored (${unscored.length} with no clearly relevant paper in the pool), ${pool.length} papers\n`);
  console.log("| System | P@8 | nDCG@10 | Coverage@10 | Retrieval recall | Judged@10 |");
  console.log("|---|---|---|---|---|---|");
  for (const s of SYSTEMS) {
    const x = systems[s];
    console.log(`| ${s}${s === PRODUCTION ? " (production)" : ""} | ${fmt(x.p8)} | ${fmt(x.ndcg10)} | ${fmt(x.coverage10)} | ${fmt(x.recall)} | ${fmt(x.judged10)} |`);
  }
  console.log(`\nWeight sweep on "${PRODUCTION}" (production: recency ${WEIGHTS.recency}, diversity ${WEIGHTS.diversity}), best first:\n`);
  console.log("| Recency | Diversity | P@8 | nDCG@10 | Coverage@10 |");
  console.log("|---|---|---|---|---|");
  for (const r of sweep.slice(0, 6)) console.log(`| ${r.recency} | ${r.diversity} | ${fmt(r.scores.p8)} | ${fmt(r.scores.ndcg10)} | ${fmt(r.scores.coverage10)} |`);

  const results = { moods: scored.length, unscored, poolSize: pool.length, weights: WEIGHTS, systems, sweep, perMood };
  writeJson("results.json", results);
  writeReport(results);

  // Guarded systems: the Claude plan, and the keyword fallback (what runs when Claude is off).
  type Pair = { p8: number; ndcg10: number };
  const pick = (s: SystemName): Pair => ({ p8: systems[s].p8, ndcg10: systems[s].ndcg10 });
  const current = { ...pick(PRODUCTION), fallback: pick(FALLBACK) };
  if (process.argv.includes("--update-baseline")) {
    writeJson("baseline.json", { system: PRODUCTION, ...current, tolerance: TOLERANCE });
    console.log("\nBaseline updated.");
  }
  if (process.argv.includes("--check")) {
    const base = readJson<(Pair & { fallback?: Pair }) | undefined>("baseline.json", undefined);
    if (!base) throw new Error("No eval/rank/baseline.json to check against.");
    const checks: [string, Pair, Pair | undefined][] = [
      [PRODUCTION, current, base],
      [FALLBACK, current.fallback, base.fallback],
    ];
    const drops = checks.flatMap(([name, now, was]) =>
      was ? (["p8", "ndcg10"] as const).filter((k) => now[k] < was[k] - TOLERANCE).map((k) => `${name} ${k} ${fmt(now[k])} < baseline ${fmt(was[k])} − ${TOLERANCE}`) : [],
    );
    if (drops.length) {
      console.error(`\nRegression: ${drops.join("; ")}`);
      process.exit(1);
    }
    const describe = ([name, , was]: (typeof checks)[number]) => (was ? `${name}: P@8 ${fmt(was.p8)}, nDCG@10 ${fmt(was.ndcg10)}` : `${name}: no baseline`);
    console.log(`\nNo regression vs baseline (${checks.map(describe).join("; ")}; tolerance ${TOLERANCE}).`);
  }
}

function writeReport(r: {
  moods: number;
  unscored: string[];
  poolSize: number;
  systems: Record<SystemName, Scores>;
  sweep: { recency: number; diversity: number; scores: Scores }[];
  perMood: Record<string, Record<string, Scores>>;
}) {
  const lines = [
    "# Ranking eval report",
    "",
    "Generated by `npm run eval:rank`. Don't edit by hand.",
    "",
    `${r.moods} moods scored over a frozen pool of ${r.poolSize} papers.${r.unscored.length ? ` Not scored (no clearly relevant paper in the pool): ${r.unscored.map((m) => `"${m}"`).join(", ")}.` : ""}`,
    "",
    "| System | P@8 | nDCG@10 | Coverage@10 | Retrieval recall | Judged@10 |",
    "|---|---|---|---|---|---|",
    ...SYSTEMS.map((s) => {
      const x = r.systems[s];
      return `| ${s}${s === PRODUCTION ? " (production)" : ""} | ${fmt(x.p8)} | ${fmt(x.ndcg10)} | ${fmt(x.coverage10)} | ${fmt(x.recall)} | ${fmt(x.judged10)} |`;
    }),
    "",
    "## Weight sweep (production system, best first)",
    "",
    "| Recency | Diversity | P@8 | nDCG@10 | Coverage@10 |",
    "|---|---|---|---|---|",
    ...r.sweep.map((x) => `| ${x.recency} | ${x.diversity} | ${fmt(x.scores.p8)} | ${fmt(x.scores.ndcg10)} | ${fmt(x.scores.coverage10)} |`),
    "",
    "## Per mood (nDCG@10)",
    "",
    `| Mood | ${SYSTEMS.join(" | ")} |`,
    `|---|${SYSTEMS.map(() => "---").join("|")}|`,
    ...Object.entries(r.perMood)
      .sort((a, b) => a[1][PRODUCTION].ndcg10 - b[1][PRODUCTION].ndcg10)
      .map(([m, s]) => `| ${m} | ${SYSTEMS.map((k) => fmt(s[k].ndcg10)).join(" | ")} |`),
    "",
  ];
  fs.writeFileSync(file("report.md"), lines.join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
