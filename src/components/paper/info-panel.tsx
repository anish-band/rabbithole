"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import { MathText } from "@/components/math-text";
import type { Paper } from "@/lib/arxiv/types";
import { categoryName, formatDate } from "@/lib/format";
import { Abstract } from "./abstract";
import { AuthorList } from "./author-list";
import { PaperActions, type PaperAction, type PaperActionState } from "./paper-actions";

/** AI-written summary; filled in by explainer generation (#9). */
export type PaperSummary = { tldr: string; keyPoints: string[] };

type InfoPanelProps = {
  paper: Paper;
  summary?: PaperSummary;
  actions: PaperActionState;
  onAction: (action: PaperAction) => void;
};

export function InfoPanel({ paper, summary, actions, onAction }: InfoPanelProps) {
  const others = paper.categories.filter((c) => c !== paper.primaryCategory).slice(0, 3);
  const updated = paper.updated.slice(0, 10) !== paper.published.slice(0, 10);

  return (
    <div className="reveal-group flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-footnote font-medium text-accent-ink" title={paper.primaryCategory}>
          {categoryName(paper.primaryCategory)}
        </span>
        {others.map((c) => (
          <span key={c} className="rounded-full bg-fill px-2.5 py-1 text-footnote text-foreground/70" title={categoryName(c)}>
            {c}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-headline font-semibold text-balance">
          <MathText text={paper.title} />
        </h2>
        <AuthorList authors={paper.authors} />
        <p className="text-footnote text-muted">
          <time dateTime={paper.published}>{formatDate(paper.published)}</time>
          {updated ? (
            <>
              {" · Updated "}
              <time dateTime={paper.updated}>{formatDate(paper.updated)}</time>
            </>
          ) : null}
          {` · ${paper.id}${paper.version}`}
        </p>
      </div>

      {summary ? (
        <section aria-label="Summary" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <p className="text-body leading-snug font-medium">
            <MathText text={summary.tldr} />
          </p>
          {summary.keyPoints.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1.5 ps-5 text-callout leading-snug text-foreground/80 marker:text-muted">
              {summary.keyPoints.map((point, i) => (
                <li key={i}>
                  <MathText text={point} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <Abstract text={paper.abstract} id={`abstract-${paper.id}`} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-callout font-medium">
        <a
          href={paper.absUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded text-accent hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent"
        >
          arXiv page
          <ArrowUpRight aria-hidden className="size-4" />
        </a>
        <a
          href={paper.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded text-accent hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <FileText aria-hidden className="size-4" />
          PDF
        </a>
      </div>

      <PaperActions state={actions} onToggle={onAction} />
    </div>
  );
}
