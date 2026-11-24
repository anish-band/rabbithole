"use client";

import { useState } from "react";
import { splitAuthors } from "@/lib/format";

/** Authors with the long tail collapsed behind a "+N more" button. */
export function AuthorList({ authors }: { authors: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const { visible, hidden } = splitAuthors(authors);
  const shown = expanded ? authors : visible;

  return (
    <p className="text-callout leading-snug text-muted">
      {shown.join(", ")}
      {hidden.length > 0 ? (
        <>
          {" "}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="rounded font-medium text-foreground/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            {expanded ? "Show less" : `+${hidden.length} more`}
          </button>
        </>
      ) : null}
    </p>
  );
}
