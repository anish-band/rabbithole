import "server-only";
import type { BudgetStatus } from "./budget-state";
import { db, hasDatabase } from "./db/client";
import { dataDir } from "./db/docs";
import { BudgetExceededError, FileLedger, PgLedger } from "./db/ledger";

export { BudgetExceededError };

/**
 * Hard spend cap for Claude API calls.
 *
 * Every call reserves its WORST-CASE cost (estimated input + full max_tokens of
 * output) before it is sent. If spent + reserved + this reservation would pass
 * BUDGET_USD, the call is refused. After the call, the reservation is replaced
 * by the real cost from response.usage. So the ledger can never go over budget,
 * even with concurrent requests.
 *
 * The ledger (./db/ledger.ts) lives in Postgres when DATABASE_URL is set (safe
 * across instances), otherwise in data/spend.json (one process only).
 *
 * This is the app-level guard. Also set a monthly spend limit in the Anthropic
 * Console as a backstop (Settings -> Limits).
 */

// USD per 1M tokens. Source: claude-api skill model table (cached 2026-11-03).
// Cache writes are billed at 1.25x input, cache reads at the listed read rate.
export const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4.0, output: 20.0, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export const BUDGET_USD = Number(process.env.BUDGET_USD ?? "10");
const RATE_LIMIT_PER_MIN = Number(process.env.CLAUDE_RATE_LIMIT_PER_MIN ?? "20");

const fileLedger = new FileLedger(dataDir("spend.json"));
const pgLedger = new PgLedger(db);
const ledger = () => (hasDatabase() ? pgLedger : fileLedger);

export class RateLimitedError extends Error {
  constructor(public retryAfterMs: number) {
    super(`Rate limited: try again in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "RateLimitedError";
  }
}

// Rate limit window (per process; the cap itself is shared through the ledger).
const recentCalls: number[] = [];

export function priceFor(model: string) {
  const p = PRICING[model];
  if (!p) throw new Error(`No pricing for model "${model}". Add it to PRICING in src/lib/budget.ts.`);
  return p;
}

/** Rough token estimate (~3.5 chars/token), padded 20% to stay conservative. */
export function estimateTokens(text: string) {
  return Math.ceil((text.length / 3.5) * 1.2);
}

export function worstCaseUsd(model: string, inputTokens: number, maxTokens: number) {
  const p = priceFor(model);
  // Assume all input is a cache write (1.25x) to stay on the safe side.
  return (inputTokens * p.input * 1.25 + maxTokens * p.output) / 1_000_000;
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function actualUsd(model: string, u: Usage) {
  const p = priceFor(model);
  return (
    (u.input_tokens * p.input +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      u.output_tokens * p.output) /
    1_000_000
  );
}

export type Reservation = {
  /** Replace the reservation with the real cost. */
  record(route: string, costUsd: number): Promise<void>;
  /** Drop it (the call failed). A no-op after `record`. */
  release(): Promise<void>;
};

/** Reserve worst-case cost. Throws if over budget or rate limited. */
export async function reserve(amountUsd: number): Promise<Reservation> {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 60_000) recentCalls.shift();
  if (recentCalls.length >= RATE_LIMIT_PER_MIN) {
    throw new RateLimitedError(60_000 - (now - recentCalls[0]));
  }

  const store = ledger();
  const id = await store.reserve(amountUsd, BUDGET_USD);
  recentCalls.push(now);

  let settled = false;
  return {
    async record(route, costUsd) {
      settled = true;
      await store.settle(id, route, costUsd);
    },
    async release() {
      if (settled) return;
      settled = true;
      await store.release(id);
    },
  };
}

/** Is Claude switched on at all? Off without a key, or with RABBITHOLE_CLAUDE=off (e.g. a public deploy). */
export const claudeEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.RABBITHOLE_CLAUDE !== "off";

/** API health, so the UI can say "paused" during e.g. an account usage limit. */
const API_FAILURE_WINDOW_MS = 5 * 60_000;
let lastApiFailureAt = 0;
export function noteApiResult(ok: boolean) {
  lastApiFailureAt = ok ? 0 : Date.now();
}

export async function budgetStatus(): Promise<BudgetStatus & { byRoute: Record<string, number>; updatedAt: string }> {
  const snap = await ledger().snapshot();
  const now = Date.now();
  const inWindow = recentCalls.filter((t) => now - t <= 60_000);
  return {
    budgetUsd: BUDGET_USD,
    spentUsd: Number(snap.spentUsd.toFixed(4)),
    // Ledger only: counting in-flight worst-case reservations would make the pill
    // dip ~$0.33 during every generation (the "used up" threshold already allows for one).
    remainingUsd: Number(Math.max(0, BUDGET_USD - snap.spentUsd).toFixed(4)),
    calls: snap.calls,
    configured: claudeEnabled(),
    rateLimitedMs: inWindow.length >= RATE_LIMIT_PER_MIN ? 60_000 - (now - inWindow[0]) : 0,
    apiFailing: lastApiFailureAt > 0 && now - lastApiFailureAt < API_FAILURE_WINDOW_MS,
    byRoute: snap.byRoute,
    updatedAt: snap.updatedAt,
  };
}
