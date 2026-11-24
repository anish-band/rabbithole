"use client";

import { Bookmark, X } from "lucide-react";
import { useRef } from "react";
import { MathText } from "@/components/math-text";
import { categoryName, formatDate, splitAuthors } from "@/lib/format";
import { savedPapers, toggle } from "@/lib/taste/store";
import { updateTaste, useTaste } from "@/lib/taste/use-taste";

const iconButton =
  "flex size-9 items-center justify-center rounded-full text-foreground/80 transition-[background-color,color,transform] duration-200 ease-spring hover:bg-fill hover:text-foreground active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Top-bar button plus a right-hand sheet listing saved papers. A native modal
 * <dialog> provides the focus trap, Escape to close, and inert background.
 */
export function SavedDrawer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const saved = savedPapers(useTaste());

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={saved.length ? `Saved papers (${saved.length})` : "Saved papers"}
        className={`${iconButton} relative`}
      >
        <Bookmark aria-hidden className="size-[18px]" />
        {saved.length ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-background tabular-nums"
          >
            {saved.length > 99 ? "99+" : saved.length}
          </span>
        ) : null}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="saved-title"
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="sheet fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(420px,100vw)] max-w-none border-l border-hairline bg-background p-0 text-foreground shadow-card"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline ps-5 pe-3">
            <h2 id="saved-title" className="text-callout font-semibold">
              Saved
            </h2>
            <button ref={closeRef} type="button" onClick={() => dialogRef.current?.close()} aria-label="Close" className={iconButton}>
              <X aria-hidden className="size-5" />
            </button>
          </div>

          {saved.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
              <Bookmark aria-hidden className="size-7 text-muted" />
              <p className="text-callout font-medium">Nothing saved yet</p>
              <p className="text-footnote text-muted">Press Save on a paper to keep it here.</p>
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-hairline overflow-y-auto overscroll-contain">
              {saved.map((paper) => {
                const { visible, hidden } = splitAuthors(paper.authors, 2);
                return (
                  <li key={paper.id} className="flex gap-3 px-5 py-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-footnote font-medium text-accent-ink">{categoryName(paper.primaryCategory)}</span>
                      <a
                        href={paper.absUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded text-callout leading-snug font-semibold decoration-foreground/30 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <MathText text={paper.title} />
                      </a>
                      <span className="truncate text-footnote text-muted">
                        {visible.join(", ")}
                        {hidden.length ? ` +${hidden.length}` : ""} · {formatDate(paper.published)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updateTaste((s) => toggle(s, paper, "saved"));
                        // This button unmounts; keep focus inside the dialog.
                        closeRef.current?.focus();
                      }}
                      aria-label={`Remove “${paper.title}” from saved`}
                      className={`${iconButton} shrink-0`}
                    >
                      <Bookmark aria-hidden className="size-[18px]" fill="currentColor" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
