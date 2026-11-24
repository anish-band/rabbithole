import { Play } from "lucide-react";
import { ExplainerPlayer } from "@/components/explainer/player";
import type { Paper } from "@/lib/arxiv/types";
import type { Explainer } from "@/lib/explainer/schema";
import { categoryName } from "@/lib/format";

/**
 * Left-hand stage for the animated explainer: dark in both themes, like a
 * video player. Plays a scenes script, an external video, or (with neither)
 * a quiet placeholder rather than repeating the title from the info panel.
 */
export function ExplainerPanel({ paper, explainer, active }: { paper: Paper; explainer?: Explainer | null; active: boolean }) {
  return (
    <figure
      aria-label="Explainer"
      className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl bg-stage p-4 text-white shadow-card min-[900px]:p-6"
    >
      {explainer?.type === "scenes" ? (
        <ExplainerPlayer script={explainer} active={active} />
      ) : explainer?.type === "video" ? (
        <video
          src={explainer.url}
          poster={explainer.poster}
          controls
          playsInline
          preload="metadata"
          className="size-full rounded-2xl object-contain"
        >
          {explainer.captionsUrl ? <track kind="captions" src={explainer.captionsUrl} default /> : null}
        </video>
      ) : (
        <>
          <span className="flex size-16 items-center justify-center rounded-full bg-white/10">
            {/* Play triangles look left-heavy when centred geometrically; nudge right. */}
            <Play aria-hidden className="size-7 translate-x-[2px] text-white/70" fill="currentColor" strokeWidth={0} />
          </span>
          <figcaption className="text-center">
            <span className="block text-callout font-medium text-white/70">Explainer coming soon</span>
            <span className="mt-1 block text-footnote text-white/55">{categoryName(paper.primaryCategory)}</span>
          </figcaption>
        </>
      )}
    </figure>
  );
}
