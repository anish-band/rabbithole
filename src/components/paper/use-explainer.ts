"use client";

import { useEffect, useState } from "react";
import type { Paper } from "@/lib/arxiv/types";
import type { ExplainerResult } from "@/lib/explainer/generate";
import { sampleExplainer } from "@/lib/explainer/samples";

export type ExplainerState = { status: "idle" | "loading" } | ExplainerResult;

/** Results by paper id for this page session, so scrolling back never refetches. */
const results = new Map<string, Promise<ExplainerResult>>();

function request(id: string): Promise<ExplainerResult> {
  let pending = results.get(id);
  if (!pending) {
    pending = fetch(`/api/explainer?id=${encodeURIComponent(id)}`)
      .then(async (res) => (res.ok ? ((await res.json()) as ExplainerResult) : { status: "fallback" as const, reason: "failed" as const }))
      .catch(() => {
        results.delete(id); // network hiccup: allow a retry next time the paper is wanted
        return { status: "fallback" as const, reason: "unavailable" as const };
      });
    results.set(id, pending);
  }
  return pending;
}

/**
 * The explainer for a paper, fetched lazily: only once `wanted` (the paper on
 * screen and the next one), so generation spend follows what people look at.
 */
export function useExplainer(paper: Paper, wanted: boolean): ExplainerState {
  const sample = sampleExplainer(paper.id);
  const [state, setState] = useState<{ id: string; value: ExplainerState }>({ id: paper.id, value: { status: "idle" } });

  useEffect(() => {
    if (sample || !wanted) return;
    let live = true;
    const pending = request(paper.id);
    // Show the loading state only if the answer isn't already cached.
    const timer = setTimeout(() => live && setState((s) => (s.value.status === "idle" ? { id: paper.id, value: { status: "loading" } } : s)), 0);
    pending.then((value) => live && setState({ id: paper.id, value }));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [paper.id, wanted, sample]);

  if (sample) return { status: "ready", explainer: sample, source: "sample" };
  return state.id === paper.id ? state.value : { status: "idle" };
}
