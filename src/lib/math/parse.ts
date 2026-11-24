/**
 * Parses arXiv-style text (titles, abstracts) into a small tree of prose,
 * LaTeX math and text-mode formatting, in a single pass so formatting and
 * math can nest: `\emph{the $x$ case}`, `\textbf{\emph{x}}`, `{\bf a {b} c}`.
 *
 * Math delimiters: `$...$`, `\(...\)` (inline) and `$$...$$`, `\[...\]` (display).
 * Single-dollar math follows Pandoc's rules so prices are not mistaken for math:
 * the opening `$` must not be followed by whitespace, the closing `$` must not be
 * preceded by whitespace or followed by a digit, and a `$` inside braces (e.g. in
 * `\text{...}`) does not close. `\$` is a literal dollar sign, `\\` a line break.
 * Unclosed delimiters and unknown macros stay as plain text.
 */

export type Style = "em" | "strong" | "smallcaps" | "underline" | "plain";

export type RichNode =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean }
  | { type: "styled"; style: Style; children: RichNode[] };

const MACROS: Record<string, Style> = {
  emph: "em",
  textit: "em",
  textsl: "em",
  textbf: "strong",
  textsc: "smallcaps",
  underline: "underline",
  textrm: "plain",
  textsf: "plain",
  texttt: "plain",
  textup: "plain",
  text: "plain",
};

const OLD_STYLE: Record<string, Style> = { em: "em", it: "em", sl: "em", bf: "strong", sc: "smallcaps", rm: "plain", sf: "plain", tt: "plain" };

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);

/** End index (exclusive) of inline `$...$` math starting at `start`, or -1. */
function inlineDollarEnd(text: string, start: number): number {
  if (isSpace(text[start + 1])) return -1;
  let depth = 0;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === "$" && depth === 0) {
      if (i === start + 1 || isSpace(text[i - 1]) || /\d/.test(text[i + 1] ?? "")) return -1;
      return i + 1;
    }
  }
  return -1;
}

/** End index (exclusive) of a delimited span whose body starts at `from`, or -1. */
function delimitedEnd(text: string, from: number, close: string): number {
  for (let i = from; i <= text.length - close.length; i++) {
    if (text.startsWith(close, i)) return i + close.length;
    if (text[i] === "\\" && close[0] !== "\\") i++;
  }
  return -1;
}

/** If a math span starts at `i`, return [end, body, display]; otherwise null. */
function mathAt(text: string, i: number): [number, string, boolean] | null {
  const ch = text[i];
  const next = text[i + 1];
  if (ch === "\\" && (next === "(" || next === "[")) {
    const end = delimitedEnd(text, i + 2, next === "(" ? "\\)" : "\\]");
    if (end !== -1) return [end, text.slice(i + 2, end - 2), next === "["];
  }
  if (ch === "$" && next === "$") {
    const end = delimitedEnd(text, i + 2, "$$");
    if (end !== -1) return [end, text.slice(i + 2, end - 2), true];
  } else if (ch === "$") {
    const end = inlineDollarEnd(text, i);
    if (end !== -1) return [end, text.slice(i + 1, end - 1), false];
  }
  return null;
}

/** Index of the `}` balancing the `{` at `open`, treating math spans as atomic; or -1. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      const math = mathAt(text, i);
      if (math) {
        i = math[0] - 1;
        continue;
      }
      i++;
      continue;
    }
    if (ch === "$") {
      const math = mathAt(text, i);
      if (math) {
        i = math[0] - 1;
        continue;
      }
    }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

export function parseRich(input: string): RichNode[] {
  const nodes: RichNode[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) nodes.push({ type: "text", value: cleanTextMode(buffer) });
    buffer = "";
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === "\\" && next === "\\") {
      buffer += " "; // LaTeX line break
      i += 2;
      continue;
    }
    if (ch === "\\" && next === "$") {
      buffer += "$";
      i += 2;
      continue;
    }

    if (ch === "$" || (ch === "\\" && (next === "(" || next === "["))) {
      const math = mathAt(input, i);
      if (math && math[1].trim()) {
        flush();
        nodes.push({ type: "math", value: math[1].trim(), display: math[2] });
        i = math[0];
        continue;
      }
      if (ch === "$" && next === "$") {
        buffer += "$$";
        i += 2;
        continue;
      }
    }

    // \macro{...}
    if (ch === "\\") {
      const name = /^[a-zA-Z]+/.exec(input.slice(i + 1))?.[0];
      if (name && MACROS[name] && input[i + 1 + name.length] === "{") {
        const open = i + 1 + name.length;
        const close = matchingBrace(input, open);
        if (close !== -1) {
          flush();
          nodes.push({ type: "styled", style: MACROS[name], children: parseRich(input.slice(open + 1, close)) });
          i = close + 1;
          continue;
        }
      }
    }

    // {\bf ...}
    if (ch === "{") {
      const old = /^\{\\([a-z]{2})\s+/.exec(input.slice(i));
      if (old && OLD_STYLE[old[1]]) {
        const close = matchingBrace(input, i);
        if (close !== -1) {
          flush();
          nodes.push({ type: "styled", style: OLD_STYLE[old[1]], children: parseRich(input.slice(i + old[0].length, close)) });
          i = close + 1;
          continue;
        }
      }
    }

    buffer += ch;
    i++;
  }

  flush();
  return nodes;
}

const URL_PATTERN = /\bhttps?:\/\/\S+/g;

/** Typographic substitutions for LaTeX text mode. URLs are left untouched. */
export function cleanTextMode(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    out += cleanProse(text.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + cleanProse(text.slice(last));
}

function cleanProse(text: string): string {
  return text
    .replace(/(?<=\S)---(?=\S)/g, "—")
    .replace(/(?<=\S)--(?=\S)/g, "–")
    .replace(/ --- /g, " — ")
    .replace(/ -- /g, " – ")
    .replace(/``/g, "“")
    .replace(/''/g, "”")
    .replace(/(^|[^\\])~/g, "$1 ")
    .replace(/\\([%&_#{}])/g, "$1")
    .replace(/\\(ldots|dots)\b/g, "…")
    .replace(/\\,/g, " ");
}

/** Flatten a tree to the math segments it contains (useful for checks). */
export function mathNodes(nodes: RichNode[]): Extract<RichNode, { type: "math" }>[] {
  return nodes.flatMap((n) => (n.type === "math" ? [n] : n.type === "styled" ? mathNodes(n.children) : []));
}

/** Concatenated prose (no math), for checks and plain-text fallbacks. */
export function plainText(nodes: RichNode[]): string {
  return nodes.map((n) => (n.type === "text" ? n.value : n.type === "styled" ? plainText(n.children) : "")).join("");
}
