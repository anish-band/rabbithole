import { Play } from "lucide-react";
import type { Paper } from "@/lib/arxiv/types";
import { categoryName } from "@/lib/format";

/**
 * Left-hand stage for the animated explainer. Until the player (#8) and
 * generated explainers (#9) land, it shows a quiet placeholder rather than
 * repeating the title from the info panel. The stage is dark in both themes,
 * like a video player.
 */
export function ExplainerPanel({ paper }: { paper: Paper }) {
  return (
    <figure
      aria-label="Explainer"
      className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl bg-stage p-8 text-white shadow-card"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-white/10">
        {/* Play triangles look left-heavy when centred geometrically; nudge right. */}
        <Play aria-hidden className="size-7 translate-x-[2px] text-white/70" fill="currentColor" strokeWidth={0} />
      </span>
      <figcaption className="text-center">
        <span className="block text-callout font-medium text-white/70">Explainer coming soon</span>
        <span className="mt-1 block text-footnote text-white/55">{categoryName(paper.primaryCategory)}</span>
      </figcaption>
    </figure>
  );
}
