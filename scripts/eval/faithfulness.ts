/**
 * Explainer faithfulness eval: does every claim a reader sees (TL;DR, key
 * points, captions, on-screen labels) trace back to the paper's abstract?
 * A Haiku judge labels each claim supported / unsupported / framing, through
 * callClaude() and the budget guard. Verdicts are cached in
 * eval/faithfulness/judgments.json, so re-running costs nothing.
 *
 *   npm run eval:faithfulness -- --snapshot v1           freeze the cached explainers (data/explainers/) as run "v1"
 *   npm run eval:faithfulness -- --run v1                judge run v1 and print the unsupported-claim rate
 *   npm run eval:faithfulness -- --regenerate a,b --snapshot v2
 *                                                        regenerate ≤ 5 papers with the current prompt, then freeze them as "v2"
 *   npm run eval:faithfulness -- --compare v1,v2         judge both on the papers they share and compare
 *
 * Task spend is capped at $1.00 (PLAN.md), on top of the app's $10 guard.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { budgetStatus } from "@/lib/budget";
import { callClaude, textOf } from "@/lib/claude";
import { knownPaper } from "@/lib/arxiv/known";
import { regenerateExplainer } from "@/lib/explainer/generate";
import { extractClaims, rates, ratesByKind, sceneLabels, type ExplainerSnapshot, type Judged, type Rates, type Verdict } from "@/lib/eval/faithfulness";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No key: judging stops with a clear message.
}

const DIR = path.join(process.cwd(), "eval", "faithfulness");
const TASK_CAP_USD = 1.0;
const SAFETY_USD = 0.1;
const MAX_REGENERATE = 5;
const JUDGE_MODEL = "claude-haiku-5-5";
/** Bump when the judge prompt changes, so cached verdicts are not reused. */
const JUDGE_VERSION = 1;
const CALL_GAP_MS = 3_500;

const startSpent = budgetStatus().spentUsd;
/** Spend from earlier runs of this task (eval/faithfulness/spend.json), so the cap covers the whole task. */
const priorSpend = (() => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(DIR, "spend.json"), "utf8")) as { usd: number }).usd;
  } catch {
    return 0;
  }
})();
const taskSpend = () => priorSpend + budgetStatus().spentUsd - startSpent;
const saveSpend = () => writeJson("spend.json", { usd: Number(taskSpend().toFixed(6)), capUsd: TASK_CAP_USD });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const readJson = <T>(name: string, fallback: T): T => (fs.existsSync(path.join(DIR, name)) ? JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8")) : fallback);
const writeJson = (name: string, data: unknown) => {
  fs.mkdirSync(path.dirname(path.join(DIR, name)), { recursive: true });
  fs.writeFileSync(path.join(DIR, name), `${JSON.stringify(data, null, 1)}\n`);
};
function checkCap() {
  saveSpend();
  if (taskSpend() > TASK_CAP_USD - SAFETY_USD) throw new Error(`task spend cap reached ($${taskSpend().toFixed(4)})`);
}

type CacheEntry = { id: string; promptVersion: number; explainer: { scenes: { caption: string; elements: Parameters<typeof sceneLabels>[0] }[] }; summary: ExplainerSnapshot["summary"] };
type Run = { label: string; promptVersion: number; createdAt: string; explainers: ExplainerSnapshot[] };

async function snapshot(label: string, ids?: string[]) {
  const file = `runs/${label}.json`;
  if (fs.existsSync(path.join(DIR, file))) throw new Error(`run "${label}" already exists; snapshots are frozen`);
  const dir = path.join(process.cwd(), "data", "explainers");
  const names = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".failed.json") && (!ids || ids.includes(f.replace(/\.json$/, ""))));
  const explainers: ExplainerSnapshot[] = [];
  let promptVersion = 0;
  for (const name of names.sort()) {
    const entry = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as CacheEntry;
    const paper = await knownPaper(entry.id);
    if (!paper) continue;
    promptVersion = entry.promptVersion;
    explainers.push({
      id: entry.id,
      title: paper.title,
      abstract: paper.abstract,
      summary: entry.summary,
      scenes: entry.explainer.scenes.map((s) => ({ caption: s.caption, labels: sceneLabels(s.elements) })),
    });
  }
  writeJson(file, { label, promptVersion, createdAt: new Date().toISOString(), explainers } satisfies Run);
  console.log(`snapshot "${label}": ${explainers.length} explainers (prompt v${promptVersion})`);
}

async function regenerate(ids: string[]) {
  if (ids.length > MAX_REGENERATE) throw new Error(`regenerate at most ${MAX_REGENERATE} papers (asked for ${ids.length})`);
  for (const id of ids) {
    checkCap();
    const paper = await knownPaper(id);
    if (!paper) throw new Error(`unknown paper ${id}`);
    const result = await regenerateExplainer(paper);
    console.log(`regenerated ${id}: ${result.status}${result.status === "fallback" ? ` (${result.reason})` : ""} · task spend $${taskSpend().toFixed(4)}`);
    if (result.status !== "ready") throw new Error(`regeneration failed for ${id}`);
  }
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "verdict", "reason"],
        properties: {
          n: { type: "integer" },
          verdict: { type: "string", enum: ["supported", "unsupported", "framing"] },
          reason: { type: "string", description: "For unsupported: what is not in the abstract. Otherwise a few words." },
        },
      },
    },
  },
} as const;

const JUDGE_SYSTEM = `You check an AI-written explainer of an arXiv paper against the paper's abstract, the only source the writer had.
For each numbered claim, answer:
- supported: stated in the abstract or a direct, safe paraphrase or simplification of it.
- unsupported: adds something the abstract does not say — specific numbers, datasets, baselines, comparisons, mechanisms, results, or causal claims — or contradicts it. A reasonable simplification is not unsupported; a new fact is.
- framing: not a factual claim about this paper (an analogy, a generic definition, a question, a scene title, a bare axis or variable label).
On-screen claims are a scene's visible labels joined by " · "; judge them together (any invented number or claim makes the whole line unsupported).
Be strict about specifics, lenient about wording.`;

const claimKey = (s: ExplainerSnapshot) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify([JUDGE_VERSION, s.abstract, extractClaims(s)]))
    .digest("hex");

async function judge(s: ExplainerSnapshot, cache: Record<string, Judged[]>): Promise<Judged[]> {
  const key = claimKey(s);
  if (cache[key]) return cache[key];
  checkCap();
  const claims = extractClaims(s);
  const list = claims.map((c, i) => `[${i + 1}] (${c.kind}${c.scene ? `, scene ${c.scene}` : ""}) ${c.text}`).join("\n");
  const message = await callClaude("eval-faithfulness", {
    model: JUDGE_MODEL,
    max_tokens: 6000,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: `Title: ${s.title}\n\nAbstract:\n${s.abstract}\n\nClaims:\n${list}` }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });
  let raw: { verdicts: { n: number; verdict: Verdict; reason: string }[] };
  try {
    raw = JSON.parse(textOf(message));
  } catch {
    throw new Error(`judge reply unusable for ${s.id} (stop_reason ${message.stop_reason})`);
  }
  const byN = new Map(raw.verdicts.map((v) => [v.n, v]));
  const judged = claims.map((c, i) => {
    const v = byN.get(i + 1);
    // A claim the judge skipped is counted as unsupported, never silently dropped.
    return { ...c, verdict: v?.verdict ?? "unsupported", reason: v?.reason ?? "no verdict returned" } satisfies Judged;
  });
  cache[key] = judged;
  writeJson("judgments.json", cache);
  await sleep(CALL_GAP_MS);
  return judged;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const row = (name: string, r: Rates) => `| ${name} | ${r.checked} | ${r.unsupported} | ${pct(r.rate)} |`;

async function judgeRun(label: string, ids?: string[]) {
  const run = readJson<Run | null>(`runs/${label}.json`, null);
  if (!run) throw new Error(`no run "${label}"; snapshot it first`);
  const cache = readJson<Record<string, Judged[]>>("judgments.json", {});
  const explainers = ids ? run.explainers.filter((e) => ids.includes(e.id)) : run.explainers;
  const perPaper: { id: string; title: string; judged: Judged[] }[] = [];
  for (const e of explainers) perPaper.push({ id: e.id, title: e.title, judged: await judge(e, cache) });
  return { run, perPaper, all: perPaper.flatMap((p) => p.judged) };
}

function table(results: { label: string; all: Judged[] }[]) {
  const lines = ["| Run | Factual claims | Unsupported | Unsupported rate |", "|---|---|---|---|", ...results.map((r) => row(r.label, rates(r.all)))];
  lines.push("", "| Claim kind | " + results.map((r) => `${r.label} rate`).join(" | ") + " |", "|---|" + results.map(() => "---").join("|") + "|");
  for (const kind of ["tldr", "key point", "caption", "on-screen"] as const) {
    lines.push(`| ${kind} | ${results.map((r) => { const k = ratesByKind(r.all)[kind]; return `${pct(k.rate)} (${k.unsupported}/${k.checked})`; }).join(" | ")} |`);
  }
  return lines;
}

function examples(all: { id: string; judged: Judged[] }[], max = 12) {
  return all
    .flatMap((p) => p.judged.filter((j) => j.verdict === "unsupported").map((j) => `- \`${p.id}\` ${j.kind}${j.scene ? ` ${j.scene}` : ""}: “${j.text}” — ${j.reason}`))
    .slice(0, max);
}

async function main() {
  const regen = arg("regenerate")?.split(",").filter(Boolean);
  if (regen) await regenerate(regen);
  const snap = arg("snapshot");
  if (snap) await snapshot(snap, regen);

  const compare = arg("compare")?.split(",");
  const single = arg("run");
  if (compare?.length === 2) {
    const [a, b] = compare;
    const runB = readJson<Run | null>(`runs/${b}.json`, null);
    const shared = runB?.explainers.map((e) => e.id);
    const ra = await judgeRun(a, shared);
    const rb = await judgeRun(b, shared);
    const lines = [
      `# Faithfulness: ${a} vs ${b}`,
      "",
      `Same ${shared?.length} papers. Prompt v${ra.run.promptVersion} vs v${rb.run.promptVersion}. Judge: ${JUDGE_MODEL} (judge v${JUDGE_VERSION}).`,
      "",
      ...table([
        { label: a, all: ra.all },
        { label: b, all: rb.all },
      ]),
      "",
      `## Unsupported claims in ${b}`,
      "",
      ...(examples(rb.perPaper).length ? examples(rb.perPaper) : ["None."]),
      "",
    ];
    writeJson(`compare-${a}-${b}.json`, { a: rates(ra.all), b: rates(rb.all), shared });
    fs.writeFileSync(path.join(DIR, `compare-${a}-${b}.md`), lines.join("\n"));
    console.log(lines.join("\n"));
  } else if (single) {
    const r = await judgeRun(single);
    const lines = [
      `# Faithfulness: ${single}`,
      "",
      `${r.perPaper.length} explainers, prompt v${r.run.promptVersion}. Judge: ${JUDGE_MODEL} (judge v${JUDGE_VERSION}).`,
      "",
      ...table([{ label: single, all: r.all }]),
      "",
      "## Per paper",
      "",
      "| Paper | Unsupported rate |",
      "|---|---|",
      ...r.perPaper.map((p) => { const x = rates(p.judged); return `| ${p.title.slice(0, 70)} | ${pct(x.rate)} (${x.unsupported}/${x.checked}) |`; }),
      "",
      "## Unsupported claims",
      "",
      ...examples(r.perPaper, 40),
      "",
    ];
    fs.writeFileSync(path.join(DIR, `report-${single}.md`), lines.join("\n"));
    console.log(lines.join("\n"));
  }
  saveSpend();
  console.log(`\ntask spend so far: $${taskSpend().toFixed(4)} (cap $${TASK_CAP_USD})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  saveSpend();
  console.log(`task spend so far: $${taskSpend().toFixed(4)} (cap $${TASK_CAP_USD})`);
  process.exit(1);
});
