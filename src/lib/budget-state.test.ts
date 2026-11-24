import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetState, describeBudget, remainingFraction, type BudgetStatus } from "./budget-state";

const base: BudgetStatus = { budgetUsd: 10, spentUsd: 0.48, remainingUsd: 9.52, calls: 8, configured: true, rateLimitedMs: 0, apiFailing: false };

test("states in priority order", () => {
  assert.equal(budgetState(base), "ok");
  assert.equal(budgetState({ ...base, remainingUsd: 0.9 }), "low");
  assert.equal(budgetState({ ...base, remainingUsd: 0.2 }), "exhausted");
  assert.equal(budgetState({ ...base, rateLimitedMs: 4000 }), "rate-limited");
  assert.equal(budgetState({ ...base, apiFailing: true, rateLimitedMs: 4000 }), "unavailable");
  assert.equal(budgetState({ ...base, remainingUsd: 0, apiFailing: true }), "exhausted");
  assert.equal(budgetState({ ...base, configured: false, remainingUsd: 0 }), "off");
});

test("labels", () => {
  assert.equal(describeBudget(base).short, "$9.52 left");
  assert.match(describeBudget(base).long, /\$9\.52 of \$10\.00 left/);
  assert.equal(describeBudget({ ...base, remainingUsd: 0 }).short, "Budget used up");
  assert.equal(describeBudget({ ...base, rateLimitedMs: 3200 }).short, "Busy · 4s");
  assert.equal(remainingFraction({ ...base, remainingUsd: 12 }), 1);
});
