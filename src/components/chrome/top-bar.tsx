import { ChevronDown, ChevronUp, Rabbit } from "lucide-react";
import type { ReactNode } from "react";
import { SavedDrawer } from "./saved-drawer";

export type FeedNav = {
  next: () => void;
  prev: () => void;
  /** Index of the paper on screen. */
  active: number;
  count: number;
};

const iconButton =
  "flex size-9 items-center justify-center rounded-full text-foreground/80 transition-[background-color,color,transform] duration-200 ease-spring hover:bg-fill hover:text-foreground active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Floating frosted bar over the feed: wordmark, a slot for the mood bar and
 * budget pill (#7, #10), the saved-papers drawer, and previous/next buttons
 * for pointer users.
 * Content scrolls underneath; the material goes solid with reduced transparency.
 * It renders inside <main>, so the banner role is set explicitly.
 */
export function TopBar({ nav, children }: { nav: FeedNav; children?: ReactNode }) {
  return (
    <header role="banner" className="fixed inset-x-0 top-0 z-20 bg-bar shadow-bar backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 min-[900px]:px-10">
        <h1 className="flex items-center gap-2 text-callout font-semibold tracking-[-0.016em]">
          <Rabbit aria-hidden className="size-5 text-accent" strokeWidth={2} />
          <span className="max-sm:sr-only">Rabbithole</span>
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-center">{children}</div>
        <SavedDrawer />
        <span aria-hidden className="h-5 w-px bg-hairline" />
        <nav aria-label="Feed" className="flex items-center gap-1">
          <button type="button" onClick={nav.prev} disabled={nav.active <= 0} aria-label="Previous paper" className={iconButton}>
            <ChevronUp aria-hidden className="size-5" />
          </button>
          <button type="button" onClick={nav.next} disabled={nav.active >= nav.count - 1} aria-label="Next paper" className={iconButton}>
            <ChevronDown aria-hidden className="size-5" />
          </button>
        </nav>
      </div>
    </header>
  );
}
