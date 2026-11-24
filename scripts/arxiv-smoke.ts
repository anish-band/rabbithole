/**
 * Smoke test for the arXiv client against the live API.
 * Run: npm run smoke:arxiv
 * Makes 2 requests (3 s apart); re-runs hit the disk cache in data/arxiv/.
 */
import { getPaper, searchPapers } from "../src/lib/arxiv";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  const t0 = Date.now();
  const { papers, totalResults } = await searchPapers({
    query: 'all:"large language model" AND cat:cs.CL',
    maxResults: 5,
    sortBy: "submittedDate",
  });
  assert(papers.length > 0, "search returned no papers");
  assert(totalResults >= papers.length, "totalResults is smaller than the page");
  for (const p of papers) {
    assert(p.id && !/v\d+$/.test(p.id), `bad id ${p.id}`);
    assert(p.title && !p.title.includes("\n"), `bad title for ${p.id}`);
    assert(p.abstract.length > 50, `short abstract for ${p.id}`);
    assert(p.authors.length > 0, `no authors for ${p.id}`);
    assert(p.pdfUrl.startsWith("https://"), `bad pdf url for ${p.id}`);
  }
  console.log(`search: ${papers.length} of ${totalResults} results`);
  console.log(`  e.g. [${papers[0].primaryCategory}] ${papers[0].title}`);

  // "Attention Is All You Need"
  const paper = await getPaper("1706.03762");
  assert(paper?.title.toLowerCase().includes("attention"), "lookup by id failed");
  console.log(`lookup: ${paper.id}${paper.version} "${paper.title}" by ${paper.authors.length} authors`);

  console.log(`OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
