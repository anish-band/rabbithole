import type { Instrumentation } from "next";

/**
 * Runs once per server start, before the first request. On Lambda (a cold
 * start) load the embedding model here, during the init phase, so the first
 * visitor doesn't wait for it. Capped well under Lambda's 10 s init limit; if
 * it isn't done by then, the first request finishes the job as before.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.AWS_LAMBDA_FUNCTION_NAME) return;
  const started = Date.now();
  const warm = import("./lib/rank/embed").then((m) => m.embedQuery("warm up"));
  const outcome = await Promise.race([
    warm.then(() => "ready"),
    new Promise<string>((resolve) => setTimeout(() => resolve("still loading"), 6_000)),
  ]).catch((err) => `failed: ${err instanceof Error ? err.message : err}`);
  console.log(JSON.stringify({ level: "info", event: "warmup", outcome, ms: Date.now() - started }));
}

/** Unexpected server errors as structured log lines (see docs/runbook.md). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { log } = await import("./lib/observability");
  log("error", "request.error", {
    error: err instanceof Error ? err.message : String(err),
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined,
    path: request.path,
    method: request.method,
    route: context.routePath,
  });
};
