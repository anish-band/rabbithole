import { connection } from "next/server";
import { budgetStatus, claudeEnabled } from "@/lib/budget";
import { db, hasDatabase } from "@/lib/db/client";
import { metric } from "@/lib/observability";

/**
 * GET /api/health: liveness plus a database round trip when one is configured.
 * 200 when healthy, 503 when the database is configured but unreachable.
 * Also samples Claude spend for the "spend over 80% of the cap" alarm.
 */
export async function GET() {
  await connection();
  const started = Date.now();
  let database: "ok" | "down" | "not configured" = "not configured";
  if (hasDatabase()) {
    try {
      await db()`select 1`;
      database = "ok";
    } catch {
      database = "down";
    }
  }
  let spentUsd: number | undefined;
  if (database !== "down") {
    spentUsd = (await budgetStatus().catch(() => undefined))?.spentUsd;
    if (spentUsd !== undefined) metric("ClaudeSpendUsd", spentUsd);
  }
  const ok = database !== "down";
  return Response.json(
    {
      ok,
      database,
      claude: claudeEnabled() ? "on" : "off",
      spentUsd,
      version: process.env.RABBITHOLE_VERSION ?? "dev",
      ms: Date.now() - started,
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
