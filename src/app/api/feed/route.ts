import { getFeedPage } from "@/lib/feed/server";
import { parseFeedRequest } from "@/lib/feed/validate";
import { log, metric } from "@/lib/observability";

/** Signals are capped at 300 ids per list; anything far beyond that is not from our client. */
const MAX_BODY_CHARS = 64_000;

/**
 * POST /api/feed — one page of ranked papers.
 * Body: { mood?, signals?, exclude?, round? } (see lib/feed/validate.ts).
 * Taste signals arrive with each request; nothing is stored server-side.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return Response.json({ error: "Request too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const started = Date.now();
  try {
    const page = await getFeedPage(parseFeedRequest(body));
    metric("FeedLatency", Date.now() - started, { papers: page.papers.length, mood: Boolean(page.mood) });
    return Response.json(page);
  } catch (err) {
    metric("FeedError");
    log("error", "feed.failed", { error: err instanceof Error ? err.message : String(err), ms: Date.now() - started });
    return Response.json({ error: "Couldn't reach arXiv. Try again in a moment." }, { status: 502 });
  }
}
