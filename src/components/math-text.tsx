import katex from "katex";
import { parseRich, type RichNode } from "@/lib/math/parse";

/** Small cache: the same titles/abstracts re-render as the feed scrolls. */
const cache = new Map<string, string>();
const CACHE_LIMIT = 500;

function renderFormula(tex: string, display: boolean): string {
  const key = `${display ? "D" : "I"}:${tex}`;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false, // bad TeX renders as its source instead of crashing
      strict: "ignore",
      trust: false, // no \href, \includegraphics, etc.
      output: "htmlAndMathml", // MathML for screen readers
    });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, html);
  }
  return html;
}

const STYLE_CLASS: Record<string, string | undefined> = {
  strong: "font-semibold",
  smallcaps: "[font-variant-caps:small-caps]",
  underline: "underline underline-offset-2",
};

function Nodes({ nodes, allowDisplay }: { nodes: RichNode[]; allowDisplay: boolean }) {
  return nodes.map((node, i) => {
    if (node.type === "text") return node.value;
    if (node.type === "math") {
      const display = node.display && allowDisplay;
      return (
        <span
          key={i}
          className={display ? "math-display block" : "math-inline"}
          // Only KaTeX output is injected; KaTeX escapes its input and trust is off.
          dangerouslySetInnerHTML={{ __html: renderFormula(node.value, display) }}
        />
      );
    }
    const children = <Nodes nodes={node.children} allowDisplay={allowDisplay} />;
    if (node.style === "em") return <em key={i}>{children}</em>;
    if (node.style === "strong") return <strong key={i} className={STYLE_CLASS.strong}>{children}</strong>;
    return (
      <span key={i} className={STYLE_CLASS[node.style]}>
        {children}
      </span>
    );
  });
}

/**
 * Renders arXiv text with LaTeX math (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`)
 * via KaTeX and text-mode formatting (`\emph{}`, `\textbf{}`, dashes, quotes)
 * as typography; formatting and math can nest. Display math is shown inline in
 * titles/abstracts unless `allowDisplay` is set, to keep the text flowing.
 */
export function MathText({ text, allowDisplay = false }: { text: string; allowDisplay?: boolean }) {
  return <Nodes nodes={parseRich(text)} allowDisplay={allowDisplay} />;
}
