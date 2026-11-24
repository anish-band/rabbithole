import katex from "katex";
import { Fragment } from "react";
import { parseMathText, parseTextMacros, type Inline } from "@/lib/math/parse";

/** Small cache: the same titles/abstracts re-render as the feed scrolls. */
const cache = new Map<string, string>();
const CACHE_LIMIT = 500;

function renderFormula(tex: string, display: boolean): string {
  const key = `${display ? "D" : "I"}:${tex}`;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false, // bad TeX renders as red source instead of crashing
      strict: "ignore",
      trust: false, // no \href, \includegraphics, etc.
      output: "htmlAndMathml", // MathML for screen readers
    });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, html);
  }
  return html;
}

function InlineRun({ run }: { run: Inline }) {
  switch (run.type) {
    case "em":
      return <em>{run.value}</em>;
    case "strong":
      return <strong className="font-semibold">{run.value}</strong>;
    case "smallcaps":
      return <span className="[font-variant-caps:small-caps]">{run.value}</span>;
    case "underline":
      return <span className="underline underline-offset-2">{run.value}</span>;
    default:
      return <>{run.value}</>;
  }
}

/**
 * Renders arXiv text with LaTeX math (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`)
 * via KaTeX and text-mode macros (`\emph{}`, `--`, ...) as typography.
 * Display math is shown inline in titles/abstracts to keep the text flowing.
 */
export function MathText({ text, allowDisplay = false }: { text: string; allowDisplay?: boolean }) {
  return (
    <>
      {parseMathText(text).map((segment, i) =>
        segment.type === "math" ? (
          <span
            key={i}
            className={segment.display && allowDisplay ? "math-display block" : "math-inline"}
            // KaTeX escapes its input and trust is off, so this HTML is safe.
            dangerouslySetInnerHTML={{ __html: renderFormula(segment.value, segment.display && allowDisplay) }}
          />
        ) : (
          <Fragment key={i}>
            {parseTextMacros(segment.value).map((run, j) => (
              <InlineRun key={j} run={run} />
            ))}
          </Fragment>
        ),
      )}
    </>
  );
}
