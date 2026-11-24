"use client";

import { X } from "lucide-react";
import { forwardRef, type ReactNode } from "react";

const GROUPS: { title: string; rows: [keys: string[][], label: string][] }[] = [
  {
    title: "Browse",
    rows: [
      [[["↓"], ["J"], ["Space"]], "Next paper"],
      [[["↑"], ["K"], ["Shift", "Space"]], "Previous paper"],
      [[["Home"], ["End"]], "First / last paper"],
    ],
  },
  {
    title: "Paper",
    rows: [
      [[["L"]], "Like"],
      [[["S"]], "Save"],
      [[["X"]], "Not interested"],
    ],
  },
  {
    title: "Mood",
    rows: [
      [[["/"]], "Set a mood"],
      [[["Esc"]], "Cancel editing"],
    ],
  },
  {
    title: "Help",
    rows: [[[["?"]], "Show these shortcuts"]],
  },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-hairline bg-surface px-1.5 font-sans text-footnote font-medium text-foreground/80">
      {children}
    </kbd>
  );
}

/**
 * Keyboard shortcuts reference (opened with ?). A native modal <dialog> for
 * the focus trap and Escape. Keyboard-opened, so it appears without motion.
 */
export const ShortcutsDialog = forwardRef<HTMLDialogElement>(function ShortcutsDialog(_, ref) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="shortcuts-title"
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-3xl border border-hairline bg-background p-0 text-foreground shadow-card backdrop:bg-black/30"
    >
      <div className="flex items-center justify-between ps-6 pe-3 pt-4">
        <h2 id="shortcuts-title" className="text-callout font-semibold">
          Keyboard shortcuts
        </h2>
        <form method="dialog">
          <button
            type="submit"
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-foreground/80 hover:bg-fill hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X aria-hidden className="size-5" />
          </button>
        </form>
      </div>
      {/* Initial focus lands on the list (not Close) so opening with ? doesn't ring a button. */}
      <div autoFocus tabIndex={-1} className="flex flex-col gap-5 px-6 pt-2 pb-6 outline-none">
        {GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`kb-${group.title}`}>
            <h3 id={`kb-${group.title}`} className="mb-2 text-footnote font-medium text-muted">
              {group.title}
            </h3>
            <dl className="flex flex-col gap-2">
              {group.rows.map(([combos, label]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-callout">{label}</dt>
                  <dd className="flex items-center gap-1.5 text-footnote text-muted">
                    {combos.map((combo, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 ? <span>or</span> : null}
                        {combo.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
});
