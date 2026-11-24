import "server-only";
import fs from "fs";
import path from "path";
import type { BudgetStatus } from "./budget-state";

/**
 * Hard spend cap for Claude API calls.
 *
 * Every call reserves its WORST-CASE cost (estimated input + full max_tokens of
 * output) before it is sent. If spent + reserved + this reservation would pass
 * BUDGET_USD, the call is refused. After the call, the reservation is replaced
 * by the real cost from response.usage. So the ledger can never go over budget,
 * even with concurrent requests.
 *
 * Ledger lives in data/spend.json (gitignored). Delete it to reset.
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

const DATA_DIR = path.join(process.cwd(), "data");
const LEDGER_PATH = path.join(DATA_DIR, "spend.json");

type Ledger = {
  spentUsd: number;
  calls: number;
  byRoute: Record<string, number>;
  updatedAt: string;
};

export class BudgetExceededError extends Error {
  constructor(public spentUsd: number, public budgetUsd: number) {
    super(`Claude budget reached: $${spentUsd.toFixed(4)} of $${budgetUsd.toFixed(2)} spent`);
    this.name = "BudgetExceededError";
  }
}

export class RateLimitedError extends Error {
  constructor(public retryAfterMs: number) {
    super(`Rate limited: try again in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "RateLimitedError";
  }
}

function readLedger(): Ledger {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")) as Ledger;
  } catch {
    return { spentUsd: 0, calls: 0, byRoute: {}, updatedAt: new Date().toISOString() };
  }
}

function writeLedger(ledger: Ledger) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${LEDGER_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  fs.renameSync(tmp, LEDGER_PATH); // atomic replace
}

// In-flight reservations (process memory). Single dev server = single process.
let reservedUsd = 0;
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

/** Reserve worst-case cost. Throws if over budget or rate limited. */
export function reserve(amountUsd: number): () => void {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 60_000) recentCalls.shift();
  if (recentCalls.length >= RATE_LIMIT_PER_MIN) {
    throw new RateLimitedError(60_000 - (now - recentCalls[0]));
  }

  const { spentUsd } = readLedger();
  if (spentUsd + reservedUsd + amountUsd > BUDGET_USD) {
    throw new BudgetExceededError(spentUsd, BUDGET_USD);
  }
  reservedUsd += amountUsd;
  recentCalls.push(now);

  let released = false;
  return () => {
    if (!released) {
      reservedUsd -= amountUsd;
      released = true;
    }
  };
}

export function record(route: string, costUsd: number) {
  const ledger = readLedger();
  ledger.spentUsd += costUsd;
  ledger.calls += 1;
  ledger.byRoute[route] = (ledger.byRoute[route] ?? 0) + costUsd;
  ledger.updatedAt = new Date().toISOString();
  writeLedger(ledger);
}

/** API health, so the UI can say "paused" during e.g. an account usage limit. */
const API_FAILURE_WINDOW_MS = 5 * 60_000;
let lastApiFailureAt = 0;
export function noteApiResult(ok: boolean) {
  lastApiFailureAt = ok ? 0 : Date.now();
}

export function budgetStatus(): BudgetStatus & { byRoute: Record<string, number>; updatedAt: string } {
  const ledger = readLedger();
  const now = Date.now();
  const inWindow = recentCalls.filter((t) => now - t <= 60_000);
  return {
    budgetUsd: BUDGET_USD,
    spentUsd: Number(ledger.spentUsd.toFixed(4)),
    // In-flight reservations count: they are what the next call is checked against.
    remainingUsd: Number(Math.max(0, BUDGET_USD - ledger.spentUsd - reservedUsd).toFixed(4)),
    calls: ledger.calls,
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    rateLimitedMs: inWindow.length >= RATE_LIMIT_PER_MIN ? 60_000 - (now - inWindow[0]) : 0,
    apiFailing: lastApiFailureAt > 0 && now - lastApiFailureAt < API_FAILURE_WINDOW_MS,
    byRoute: ledger.byRoute,
    updatedAt: ledger.updatedAt,
  };
}
