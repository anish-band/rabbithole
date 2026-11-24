import { connection } from "next/server";
import { knownPaper } from "@/lib/arxiv/known";
import { getExplainer } from "@/lib/explainer/generate";

/** New-style (2611.31241v2) and old-style (math/0601001) arXiv ids. */
const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?$/;

/**
 * GET /api/explainer?id=<arxiv id> — the explainer and summary for one paper,
 * generated on first request (one budget-capped Claude call) and cached.
 * Paper content comes from what this server served or from arXiv, never from
 * the client. Always 200 with `status: "fallback"` when generation isn't possible.
 */
export async function GET(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ARXIV_ID.test(id)) return Response.json({ error: "Invalid paper id" }, { status: 400 });

  let paper;
  try {
    paper = await knownPaper(id);
  } catch (err) {
    console.warn("[explainer] paper lookup failed:", err instanceof Error ? err.message : err);
    return Response.json({ status: "fallback", reason: "unavailable" });
  }
  if (!paper) return Response.json({ error: "Unknown paper" }, { status: 404 });

  return Response.json(await getExplainer(paper));
}
