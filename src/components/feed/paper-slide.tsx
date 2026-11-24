import { MathText } from "@/components/math-text";
import type { Paper } from "@/lib/arxiv/types";

/**
 * Placeholder slide content for the feed shell. The real split layout
 * (explainer + info panel) replaces this in #3.
 */
export function PaperSlide({ paper }: { paper: Paper }) {
  const authors =
    paper.authors.length > 3 ? `${paper.authors.slice(0, 3).join(", ")} +${paper.authors.length - 3}` : paper.authors.join(", ");

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 px-8">
      <p className="text-sm font-medium tracking-wide text-muted uppercase">{paper.primaryCategory}</p>
      <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
        <MathText text={paper.title} />
      </h2>
      <p className="text-base text-muted">{authors}</p>
      <p className="line-clamp-4 text-lg leading-relaxed text-pretty text-foreground/80">
        <MathText text={paper.abstract} />
      </p>
    </div>
  );
}
