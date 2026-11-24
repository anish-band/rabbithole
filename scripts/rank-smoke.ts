/**
 * Smoke test for local embeddings + ranking on the fixture papers.
 * Run: npm run smoke:rank
 * First run downloads the model (~23 MB) to data/models/; paper embeddings
 * are cached in data/embeddings/. No network calls to arXiv or Claude.
 */
import fixtures from "../src/fixtures/papers.json";
import type { Paper } from "../src/lib/arxiv/types";
import { rankPapers } from "../src/lib/rank";

const papers = fixtures as Paper[];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  for (const [mood, expectCategory] of [
    ["probability theory and random processes", /^math\.PR|^math\./],
    ["robots and self-driving cars", /^cs\.(RO|CV|AI|LG)/],
  ] as const) {
    const t = performance.now();
    const ranked = await rankPapers(papers, { mood, jitter: 0 });
    const ms = Math.round(performance.now() - t);
    console.log(`\n"${mood}" (${ms} ms)`);
    for (const r of ranked.slice(0, 3)) console.log(`  ${r.score.toFixed(3)}  [${r.item.primaryCategory}] ${r.item.title.slice(0, 70)}`);
    assert(ranked.length === new Set(papers.map((p) => p.id)).size, "every paper is ranked once");
    assert(expectCategory.test(ranked[0].item.primaryCategory), `top paper for "${mood}" is on topic`);
  }

  // Taste: liking the top probability paper should lift it without a mood.
  const liked = (await rankPapers(papers, { mood: "probability", jitter: 0 }))[0].item;
  const withTaste = await rankPapers(papers, { signals: { liked: [liked.id] }, jitter: 0 });
  const hidden = await rankPapers(papers, { signals: { hidden: [liked.id] }, jitter: 0 });
  assert(!hidden.some((r) => r.id === liked.id), "hidden papers are dropped");
  console.log(`\nliked paper rank without mood: ${withTaste.findIndex((r) => r.id === liked.id) + 1}/${withTaste.length}`);
  console.log("\nOK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
