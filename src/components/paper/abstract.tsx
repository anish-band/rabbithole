"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MathText } from "@/components/math-text";

/**
 * The abstract, clamped to a few lines with a More/Less toggle. The toggle
 * only appears when the text is actually clamped.
 */
export function Abstract({ text, id }: { text: string; id: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Web fonts (incl. KaTeX) can change line breaks without resizing the clamped box.
    let live = true;
    document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [expanded, text]);

  return (
    <div>
      <p
        ref={ref}
        id={id}
        className={`text-[17px] leading-[1.55] text-pretty text-foreground/85 ${expanded ? "" : "line-clamp-6"}`}
      >
        <MathText text={text} />
      </p>
      {clamped || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-2 rounded text-[15px] font-medium text-accent hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}
