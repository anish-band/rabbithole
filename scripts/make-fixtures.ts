/**
 * Snapshot a small, varied set of real arXiv papers into src/fixtures/papers.json
 * for UI development (no network needed while building the feed).
 * Run: npm run fixtures   (one arXiv request; arXiv metadata is CC0)
 */
import fs from "fs";
import path from "path";
import { searchPapers } from "../src/lib/arxiv";

const QUERY = ["cs.LG", "cs.CL", "cs.CV", "hep-th", "astro-ph.CO", "q-bio.NC", "math.PR", "quant-ph", "cond-mat.stat-mech", "econ.TH"]
  .map((c) => `cat:${c}`)
  .join(" OR ");

async function main() {
  const { papers } = await searchPapers({ query: QUERY, maxResults: 60, sortBy: "submittedDate" });
  // Keep at most 2 per primary category so the fixture is varied.
  const perCat = new Map<string, number>();
  const picked = papers.filter((p) => {
    const n = perCat.get(p.primaryCategory) ?? 0;
    perCat.set(p.primaryCategory, n + 1);
    return n < 2;
  }).slice(0, 16);

  const out = path.join(process.cwd(), "src", "fixtures", "papers.json");
  fs.writeFileSync(out, JSON.stringify(picked, null, 2) + "\n");
  console.log(`wrote ${picked.length} papers across ${new Set(picked.map((p) => p.primaryCategory)).size} categories to ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
