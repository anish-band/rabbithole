import type { Paper } from "@/lib/arxiv/types";
import { categoryName } from "@/lib/format";
import { parseRich, plainText } from "@/lib/math/parse";
import type { ScenesExplainer } from "./schema";

/**
 * A small animated title card built from the paper itself: no model, no
 * budget. Shown while an explainer is generating and whenever generation
 * isn't possible (no key, budget used up, failure).
 */
const STOPWORDS = new Set(
  ("about above after again against also among an and any are around based been before being below between both but can could does " +
    "during each either from further have having here however into itself just more most much must named need not novel only other " +
    "our over paper propose proposed same show shows such than that their them then there these they this those through thus under " +
    "using various very well were what when where which while will with within without would results result approach method methods " +
    "study work new first two three model models problem problems prove provide given general however").split(" "),
);

/** Most frequent meaningful words of the abstract (math stripped), as display terms. */
export function keyTerms(abstract: string, count = 4): string[] {
  const text = plainText(parseRich(abstract)).toLowerCase();
  const freq = new Map<string, number>();
  for (const word of text.match(/[a-z][a-z-]{4,}/g) ?? []) {
    if (STOPWORDS.has(word) || word.endsWith("-")) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  return [...freq]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, count)
    .map(([w]) => w);
}

/** Greedy word wrap into at most `maxLines` lines; the last line is ellipsised if needed. */
export function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, width - 1).trimEnd()}…`;
    return kept;
  }
  return lines;
}

const HUES = ["blue", "teal", "green", "yellow"] as const;

export function titleCard(paper: Pick<Paper, "title" | "abstract" | "primaryCategory" | "authors">): ScenesExplainer {
  const title = plainText(parseRich(paper.title)).replace(/\s+/g, " ").trim();
  const lines = wrap(title, 32, 4);
  const top = 45 - (lines.length - 1) * 4.2;
  const terms = keyTerms(paper.abstract);
  const author = paper.authors[0] ? `${paper.authors[0]}${paper.authors.length > 1 ? " et al." : ""}` : "";

  // Hub-and-spoke layout for the key terms.
  const spokes = terms.map((term, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(terms.length, 1);
    const [x, y] = [80 + Math.cos(angle) * 42, 45 + Math.sin(angle) * 26];
    return { term, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, color: HUES[i % HUES.length] };
  });

  return {
    type: "scenes",
    version: 1,
    scenes: [
      {
        caption: [categoryName(paper.primaryCategory), author].filter(Boolean).join(" · ") || "A new paper",
        duration: 5000,
        elements: [
          { kind: "text", x: 80, y: top - 11, text: categoryName(paper.primaryCategory).slice(0, 80), size: "sm", color: "muted", align: "middle", enter: { at: 0, effect: "fade", duration: 600 } },
          ...lines.map((text, i) => ({
            kind: "text" as const,
            x: 80,
            y: top + i * 8.4,
            text,
            size: "md" as const,
            color: "white" as const,
            align: "middle" as const,
            enter: { at: 250 + i * 160, effect: "rise" as const, duration: 700 },
          })),
          { kind: "line", from: [62, top + lines.length * 8.4 + 1], to: [98, top + lines.length * 8.4 + 1], color: "blue", arrow: false, dashed: false, enter: { at: 900, effect: "draw", duration: 900 } },
        ],
      },
      ...(spokes.length
        ? [
            {
              caption: `Key terms in the abstract: ${terms.join(", ")}.`,
              duration: 6000,
              elements: [
                { kind: "circle" as const, x: 80, y: 45, r: 2.2, color: "white" as const, fill: true, enter: { at: 0, effect: "grow" as const, duration: 500 } },
                ...spokes.flatMap((s, i) => [
                  { kind: "line" as const, from: [80, 45] as [number, number], to: [80 + (s.x - 80) * 0.62, 45 + (s.y - 45) * 0.62] as [number, number], color: "muted" as const, arrow: false, dashed: false, enter: { at: 300 + i * 220, effect: "draw" as const, duration: 600 } },
                  { kind: "text" as const, x: s.x, y: s.y, text: s.term.slice(0, 80), size: "md" as const, color: s.color, align: "middle" as const, enter: { at: 500 + i * 220, effect: "rise" as const, duration: 600 } },
                ]),
              ],
            },
          ]
        : []),
    ],
  };
}
