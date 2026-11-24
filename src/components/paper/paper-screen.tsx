"use client";

import { useState } from "react";
import type { Paper } from "@/lib/arxiv/types";
import { ExplainerPanel } from "./explainer-panel";
import { InfoPanel, type PaperSummary } from "./info-panel";
import type { PaperAction, PaperActionState } from "./paper-actions";

const NO_ACTIONS: PaperActionState = { liked: false, saved: false, hidden: false };

type PaperScreenProps = {
  paper: Paper;
  summary?: PaperSummary;
  /** Persisted state comes from the taste store in #5; local until then. */
  initialActions?: PaperActionState;
  onAction?: (paper: Paper, action: PaperAction, active: boolean) => void;
};

/**
 * One full-screen paper: explainer on the left (55%), info on the right (45%).
 * Below 900px wide the panels stack, explainer on top. The info column scrolls
 * on its own when it is taller than the screen (wheel stays inside it until it
 * hits an edge, then pages the feed).
 */
export function PaperScreen({ paper, summary, initialActions = NO_ACTIONS, onAction }: PaperScreenProps) {
  const [actions, setActions] = useState(initialActions);

  const toggle = (action: PaperAction) => {
    const active = !actions[action];
    setActions((prev) => ({ ...prev, [action]: active }));
    onAction?.(paper, action, active);
  };

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-5 px-4 pt-4 pb-6 min-[900px]:grid min-[900px]:grid-cols-[55fr_45fr] min-[900px]:gap-12 min-[900px]:px-10 min-[900px]:py-10">
      <div className="h-[38%] shrink-0 min-[900px]:h-full">
        <ExplainerPanel paper={paper} />
      </div>
      <div data-allow-wheel className="min-h-0 flex-1 overflow-y-auto overscroll-contain min-[900px]:flex min-[900px]:flex-col min-[900px]:py-4">
        <div className="min-[900px]:my-auto min-[900px]:max-w-[560px]">
          <InfoPanel paper={paper} summary={summary} actions={actions} onAction={toggle} />
        </div>
      </div>
    </div>
  );
}
