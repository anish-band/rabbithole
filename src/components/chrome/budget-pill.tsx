"use client";

import { budgetState, describeBudget, remainingFraction, usd, type BudgetState } from "@/lib/budget-state";
import { useBudget } from "./use-budget";

/** Meter colour per state: the one accent while healthy, neutral otherwise. */
const METER: Record<BudgetState, string> = {
  ok: "text-accent",
  low: "text-foreground",
  exhausted: "text-muted",
  "rate-limited": "text-foreground",
  unavailable: "text-muted",
  off: "text-muted",
};

/** 16px ring showing the share of budget left. Solid stroke, no gradients. */
function Ring({ fraction, className }: { fraction: number; className: string }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-4 shrink-0 -rotate-90 ${className}`}>
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth="2" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        className="transition-[stroke-dashoffset] duration-500 ease-spring"
      />
    </svg>
  );
}

/**
 * Top-bar pill: how much of the Claude budget is left, and what happens when
 * it runs out. Opens a small popover with the details (native `popover`:
 * light dismiss and Escape for free).
 */
export function BudgetPill() {
  const status = useBudget();
  if (!status) return <span aria-hidden className="h-8 w-8 rounded-full sm:w-24" />; // reserve space, no layout shift

  const state = budgetState(status);
  const { short, long } = describeBudget(status);
  const fraction = state === "off" ? 0 : remainingFraction(status);

  return (
    <>
      <button
        type="button"
        popoverTarget="budget-popover"
        data-budget-state={state}
        aria-label={`Claude budget: ${short}`}
        className="flex h-8 items-center gap-2 rounded-full px-2.5 text-footnote font-medium text-foreground/80 tabular-nums transition-[background-color,color,transform] duration-200 ease-spring hover:bg-fill hover:text-foreground active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Ring fraction={fraction} className={METER[state]} />
        <span className="max-sm:sr-only">{short}</span>
      </button>
      <div
        id="budget-popover"
        popover="auto"
        role="dialog"
        aria-labelledby="budget-popover-title"
        className="popover-card fixed top-16 right-4 left-auto m-0 w-[min(320px,calc(100vw-32px))] rounded-2xl border border-hairline bg-background p-4 text-foreground shadow-card min-[900px]:right-10"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="budget-popover-title" className="text-callout font-semibold">
            Claude budget
          </h2>
          <span className="text-footnote text-muted tabular-nums">
            {usd(status.spentUsd)} of {usd(status.budgetUsd)} used
          </span>
        </div>
        <div
          role="meter"
          aria-label="Budget left"
          aria-valuemin={0}
          aria-valuemax={status.budgetUsd}
          aria-valuenow={status.remainingUsd}
          aria-valuetext={`${usd(status.remainingUsd)} left`}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill"
        >
          <div className={`h-full rounded-full bg-current ${METER[state]}`} style={{ width: `${fraction * 100}%` }} />
        </div>
        <p className="mt-3 text-footnote text-pretty text-muted">{long}</p>
        <p className="mt-2 text-footnote text-muted tabular-nums">
          {status.calls} {status.calls === 1 ? "call" : "calls"} so far · hard cap, never exceeded
        </p>
      </div>
    </>
  );
}
