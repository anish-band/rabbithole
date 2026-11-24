/**
 * Client-safe view of the Claude budget: what GET /api/budget returns and how
 * the top-bar pill reads it. No server imports here.
 */
export type BudgetStatus = {
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  calls: number;
  /** Whether an API key is configured at all. */
  configured: boolean;
  /** Milliseconds until the per-minute rate limit frees up; 0 when not limited. */
  rateLimitedMs: number;
  /** The API itself failed recently (e.g. account usage limit) with no success since. */
  apiFailing: boolean;
};

export type BudgetState = "ok" | "low" | "exhausted" | "rate-limited" | "unavailable" | "off";

/** Below this, a worst-case explainer reservation (~$0.33) can't fit any more. */
export const EXHAUSTED_BELOW_USD = 0.35;

export function budgetState(s: BudgetStatus): BudgetState {
  if (!s.configured) return "off";
  if (s.remainingUsd < EXHAUSTED_BELOW_USD) return "exhausted";
  if (s.apiFailing) return "unavailable";
  if (s.rateLimitedMs > 0) return "rate-limited";
  if (s.remainingUsd < s.budgetUsd * 0.1) return "low";
  return "ok";
}

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** Fraction of the budget still available, 0–1. */
export const remainingFraction = (s: BudgetStatus) => (s.budgetUsd > 0 ? Math.min(1, Math.max(0, s.remainingUsd / s.budgetUsd)) : 0);

/** Short pill text and the longer sentence for the popover / screen readers. */
export function describeBudget(s: BudgetStatus): { short: string; long: string } {
  const left = `${usd(s.remainingUsd)} of ${usd(s.budgetUsd)} left`;
  const wait = Math.ceil(s.rateLimitedMs / 1000);
  switch (budgetState(s)) {
    case "off":
      return { short: "AI off", long: "No Claude API key is set, so explainers are title cards and moods search by keyword." };
    case "exhausted":
      return { short: "Budget used up", long: `The ${usd(s.budgetUsd)} Claude budget is used up. Explainers you’ve already seen still play; new papers get a title card and moods search by keyword.` };
    case "unavailable":
      return { short: "AI paused", long: `Claude isn’t responding right now, so new explainers fall back to title cards. ${left}.` };
    case "rate-limited":
      return { short: `Busy · ${wait}s`, long: `Slowing down to stay under the per-minute limit; new explainers resume in about ${wait} seconds. ${left}.` };
    case "low":
      return { short: `${usd(s.remainingUsd)} left`, long: `Running low: ${left}. Each new explainer costs about $0.07.` };
    default:
      return { short: `${usd(s.remainingUsd)} left`, long: `${left}. Each new explainer costs about $0.07; ones you’ve seen are free.` };
  }
}
