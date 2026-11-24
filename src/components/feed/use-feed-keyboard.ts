"use client";

import { useEffect } from "react";

type Handlers = {
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
};

/** True when the key press belongs to a text field or other editable element. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Feed keyboard shortcuts:
 * ↓ / j / PageDown / Space → next paper, ↑ / k / PageUp / Shift+Space → previous,
 * Home → first, End → last. Ignored while typing or with Cmd/Ctrl/Alt held.
 */
export function useFeedKeyboard({ next, prev, first, last }: Handlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;

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

      if (action) {
        e.preventDefault();
        action();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, prev, first, last]);
}
