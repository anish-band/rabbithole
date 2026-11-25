/**
 * Structured logs and CloudWatch metrics without an SDK or extra API calls.
 *
 * On Lambda (or with LOG_FORMAT=json), `log` writes one JSON object per line,
 * and `metric` writes CloudWatch Embedded Metric Format lines, which
 * CloudWatch turns into metrics straight from the logs. Locally both stay quiet
 * apart from warnings and errors.
 *
 * Keep the metric list short: each name is one custom metric, and the free
 * tier covers 10.
 */
export const NAMESPACE = "Rabbithole";

export type MetricName =
  | "FeedLatency" // ms per POST /api/feed
  | "FeedError" // 1 per failed feed request
  | "ArxivRequest" // 1 per network request to arXiv
  | "ArxivError" // 1 per failed one
  | "MoodFallback" // 1 per mood answered by keyword fallback
  | "ExplainerServed" // 1 per explainer returned ready
  | "ExplainerFallback" // 1 per explainer request answered with a fallback
  | "ClaudeSpendUsd"; // ledger total, sampled

const UNITS: Record<MetricName, "Milliseconds" | "Count" | "None"> = {
  FeedLatency: "Milliseconds",
  FeedError: "Count",
  ArxivRequest: "Count",
  ArxivError: "Count",
  MoodFallback: "Count",
  ExplainerServed: "Count",
  ExplainerFallback: "Count",
  ClaudeSpendUsd: "None",
};

const structured = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || process.env.LOG_FORMAT === "json";

type Level = "info" | "warn" | "error";

/** One structured log line. Info is dropped locally; warnings and errors always print. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (!structured()) {
    if (level !== "info") console[level](`[${event}]`, fields);
    return;
  }
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  (level === "error" ? console.error : console.log)(line);
}

/** Emit one metric value (EMF). No-op outside Lambda unless LOG_FORMAT=json. */
export function metric(name: MetricName, value = 1, fields: Record<string, unknown> = {}) {
  if (!structured()) return;
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [{ Namespace: NAMESPACE, Dimensions: [["Service"]], Metrics: [{ Name: name, Unit: UNITS[name] }] }],
      },
      Service: "rabbithole",
      [name]: value,
      ...fields,
    }),
  );
}
