"use client";

import { useEffect, useState } from "react";
import type { BudgetStatus } from "@/lib/budget-state";

/** Fired after anything that may have spent budget (e.g. an explainer arrived). */
export const SPEND_EVENT = "rabbithole:spend";
export const notifySpend = () => window.dispatchEvent(new Event(SPEND_EVENT));

const POLL_MS = 30_000;
const POLL_LIMITED_MS = 5_000;

/**
 * Live budget status from GET /api/budget: on mount, after spend events, and
 * on a slow poll while the tab is visible (faster while rate-limited, so the
 * countdown clears on time). Null until the first answer arrives.
 */
export function useBudget(): BudgetStatus | null {
  const [status, setStatus] = useState<BudgetStatus | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      clearTimeout(timer);
      let next: BudgetStatus | null = null;
      try {
        const res = await fetch("/api/budget", { cache: "no-store" });
        if (res.ok) next = (await res.json()) as BudgetStatus;
      } catch {
        // Offline: keep the last known status.
      }
      if (!live) return;
      if (next) setStatus(next);
      timer = setTimeout(() => document.visibilityState === "visible" && load(), next?.rateLimitedMs ? POLL_LIMITED_MS : POLL_MS);
    };
    const onVisible = () => document.visibilityState === "visible" && load();
    load();
    window.addEventListener(SPEND_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener(SPEND_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return status;
}
