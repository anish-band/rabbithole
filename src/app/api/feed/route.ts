import { getFeedPage } from "@/lib/feed/server";
import { parseFeedRequest } from "@/lib/feed/validate";

/**
 * POST /api/feed — one page of ranked papers.
 * Body: { mood?, signals?, exclude?, round? } (see lib/feed/validate.ts).
 * Taste signals arrive with each request; nothing is stored server-side.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const page = await getFeedPage(parseFeedRequest(body));
    return Response.json(page);
  } catch (err) {
    console.error("[feed]", err);
    return Response.json({ error: "Couldn't reach arXiv. Try again in a moment." }, { status: 502 });
  }
}
