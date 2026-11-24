"use client";

import { useEffect } from "react";
import { innerScrollerCanTake } from "./inner-scroller";

type Handlers = {
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
  /** L / S / X: like, save, not interested on the paper on screen. */
  react?: (reaction: "liked" | "saved" | "hidden") => void;
  /** ?: show the shortcuts overlay. */
  help?: () => void;
};

const REACTION_KEYS = { l: "liked", s: "saved", x: "hidden" } as const;

/** Held-down keys repeat; page at most this often while held. */
const REPEAT_INTERVAL_MS = 250;

/** True when the key press belongs to a text field or other editable element. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Space activates buttons and links; don't steal it from them. */
function ownsSpace(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest("button, a[href], [role='button'], summary") !== null;
}

/**
 * Feed keyboard shortcuts:
 * ↓ / j / PageDown / Space → next paper, ↑ / k / PageUp / Shift+Space → previous,
 * Home → first, End → last, L/S/X → like/save/not interested, ? → shortcuts.
 * Ignored while typing or with Cmd/Ctrl/Alt held;
 * Space is left alone on buttons and links; held keys page at most 4×/second.
 * Inside a scrollable info column, arrows/Page/Space scroll it first.
 */
export function useFeedKeyboard({ next, prev, first, last, react, help }: Handlers) {
  useEffect(() => {
    let lastRepeatAt = 0;

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === " " && ownsSpace(e.target)) return;
      // Open dialogs (e.g. the saved drawer) own the keyboard.
      if (e.target instanceof Element && e.target.closest("dialog")) return;

      if (e.key === "?" && help) {
        e.preventDefault();
        help();
        return;
      }
      const reaction = REACTION_KEYS[e.key.toLowerCase() as keyof typeof REACTION_KEYS];
      if (reaction && react && !e.shiftKey && !e.repeat) {
        e.preventDefault();
        react(reaction);
        return;
      }

      const action =
        e.key === "ArrowDown" || e.key === "j" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)
          ? next
          : e.key === "ArrowUp" || e.key === "k" || e.key === "PageUp" || (e.key === " " && e.shiftKey)
            ? prev
            : e.key === "Home"
              ? first
              : e.key === "End"
                ? last
                : null;

      if (!action) return;
      // Arrow/Page/Space scroll a focused inner scroller natively until it hits an edge.
      const scrollKey = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " "].includes(e.key);
      if (scrollKey && innerScrollerCanTake(e.target, null, action === next ? 1 : -1)) return;
      e.preventDefault();
      if (e.repeat) {
        const now = performance.now();
        if (now - lastRepeatAt < REPEAT_INTERVAL_MS) return;
        lastRepeatAt = now;
      }
      action();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev, first, last, react, help]);
}
