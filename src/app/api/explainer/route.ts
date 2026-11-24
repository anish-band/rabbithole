import { connection } from "next/server";
import { knownPaper } from "@/lib/arxiv/known";
import { getExplainer } from "@/lib/explainer/worker";

/** New-style (2611.31241v2) and old-style (math/0601001) arXiv ids. */
const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?$/;

/**
 * GET /api/explainer?id=<arxiv id> — the explainer and summary for one paper,
 * generated on first request (one budget-capped Claude call, run by the
 * background worker queue) and cached.
 * Only papers this server has served in a feed are eligible (paper content
 * never comes from the client, and arbitrary ids can't spend the budget).
 * Always 200 with `status: "fallback"` when generation isn't possible.
 */
export async function GET(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ARXIV_ID.test(id)) return Response.json({ error: "Invalid paper id" }, { status: 400 });

  const paper = await knownPaper(id);
  if (!paper) return Response.json({ error: "Unknown paper" }, { status: 404 });

  return Response.json(await getExplainer(paper));
}
