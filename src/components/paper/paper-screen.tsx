"use client";

import type { Paper } from "@/lib/arxiv/types";
import { reactionsFor, toggle as toggleReaction, type Reaction } from "@/lib/taste/store";
import { updateTaste, useTaste } from "@/lib/taste/use-taste";
import { ExplainerPanel } from "./explainer-panel";
import { InfoPanel } from "./info-panel";
import { useExplainer } from "./use-explainer";

type PaperScreenProps = {
  paper: Paper;
  /** Whether this paper is the one on screen (explainers only play then). */
  active?: boolean;
  /** Fetch (and if needed generate) the explainer: the paper on screen and the next one. */
  wantExplainer?: boolean;
};

/**
 * One full-screen paper: explainer on the left (55%), info on the right (45%).
 * Below 900px wide the panels stack, explainer on top. The info column scrolls
 * on its own when it is taller than the screen (wheel stays inside it until it
 * hits an edge, then pages the feed). Like/save/not-interested live in the
 * on-device taste store, so they survive scrolling away and reloads.
 */
export function PaperScreen({ paper, active = false, wantExplainer = active }: PaperScreenProps) {
  const explainer = useExplainer(paper, wantExplainer);
  const summary = explainer.status === "ready" ? explainer.summary : undefined;
  const actions = reactionsFor(useTaste(), paper.id);
  const toggle = (reaction: Reaction) => updateTaste((s) => toggleReaction(s, paper, reaction));

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-5 px-4 pt-[72px] pb-6 min-[900px]:grid min-[900px]:grid-cols-[55fr_45fr] min-[900px]:gap-12 min-[900px]:px-10 min-[900px]:pt-[88px] min-[900px]:pb-10">
      <div className="h-[38%] shrink-0 min-[900px]:h-full">
        <ExplainerPanel paper={paper} state={explainer} active={active} />
      </div>
      <div
        data-allow-wheel
        tabIndex={0}
        role="region"
        aria-label="Paper details"
        className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl px-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent min-[900px]:flex min-[900px]:flex-col min-[900px]:py-4">
        <div className="min-[900px]:my-auto min-[900px]:max-w-[560px]">
          <InfoPanel paper={paper} summary={summary} actions={actions} onAction={toggle} />
        </div>
      </div>
    </div>
  );
}
