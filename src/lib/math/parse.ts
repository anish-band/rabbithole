/**
 * Splits arXiv-style text (titles, abstracts) into prose and LaTeX math.
 *
 * Math delimiters: `$...$`, `\(...\)` (inline) and `$$...$$`, `\[...\]` (display).
 * Single-dollar math follows Pandoc's rules so prices are not mistaken for math:
 * the opening `$` must not be followed by whitespace, the closing `$` must not be
 * preceded by whitespace or followed by a digit. `\$` is a literal dollar sign.
 * Unclosed delimiters stay as plain text.
 */

export type Segment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

function isSpace(ch: string | undefined) {
  return ch === undefined || /\s/.test(ch);
}

/** Index of the closing `$` for inline math opened at `start`, or -1. */
function findInlineDollarClose(text: string, start: number): number {
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++; // skip escaped char, including \$
      continue;
    }
    if (ch === "$") {
      if (i === start + 1) return -1; // empty "$$" handled by caller
      if (isSpace(text[i - 1]) || /\d/.test(text[i + 1] ?? "")) return -1;
      return i;
    }
  }
  return -1;
}

/** Index where `close` starts after `from`, skipping escaped characters, or -1. */
function findClose(text: string, from: number, close: string): number {
  for (let i = from; i <= text.length - close.length; i++) {
    if (text.startsWith(close, i)) return i;
    if (text[i] === "\\" && close !== "\\)" && close !== "\\]") i++;
  }
  return -1;
}

export function parseMathText(input: string): Segment[] {
  const segments: Segment[] = [];
  let buffer = "";

  const flushText = () => {
    if (buffer) segments.push({ type: "text", value: buffer });
    buffer = "";
  };
  const pushMath = (value: string, display: boolean) => {
    flushText();
    segments.push({ type: "math", value: value.trim(), display });
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];

    // Literal dollar.
    if (ch === "\\" && next === "$") {
      buffer += "$";
      i += 2;
      continue;
    }

    // \( ... \) and \[ ... \]
    if (ch === "\\" && (next === "(" || next === "[")) {
      const close = next === "(" ? "\\)" : "\\]";
      const end = findClose(input, i + 2, close);
      if (end > i + 2) {
        pushMath(input.slice(i + 2, end), next === "[");
        i = end + 2;
        continue;
      }
    }

    if (ch === "$") {
      // $$ ... $$
      if (next === "$") {
        const end = findClose(input, i + 2, "$$");
        if (end > i + 2) {
          pushMath(input.slice(i + 2, end), true);
          i = end + 2;
          continue;
        }
        buffer += "$$";
        i += 2;
        continue;
      }
      // $ ... $
      if (!isSpace(next)) {
        const end = findInlineDollarClose(input, i);
        if (end !== -1) {
          pushMath(input.slice(i + 1, end), false);
          i = end + 1;
          continue;
        }
      }
    }

    buffer += ch;
    i++;
  }

  flushText();
  return segments;
}

export type Inline =
  | { type: "plain"; value: string }
  | { type: "em" | "strong" | "smallcaps" | "underline"; value: string };

const MACROS: Record<string, Inline["type"]> = {
  emph: "em",
  textit: "em",
  textsl: "em",
  textbf: "strong",
  textsc: "smallcaps",
  underline: "underline",
  textrm: "plain",
  textsf: "plain",
  texttt: "plain",
  text: "plain",
};

/** Typographic substitutions for LaTeX text mode. */
export function cleanTextMode(text: string): string {
  return text
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/``/g, "“")
    .replace(/''/g, "”")
    .replace(/(^|[^\\])~/g, "$1 ")
    .replace(/\\([%&_#{}])/g, "$1")
    .replace(/\\ldots\b|\\dots\b/g, "…")
    .replace(/\\,/g, " ");
}

/**
 * Turns the text-mode formatting macros arXiv abstracts use outside math
 * (`\emph{}`, `\textbf{}`, ...) into inline runs. Unknown macros are kept as-is.
 */
export function parseTextMacros(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\\([a-zA-Z]+)\{([^{}]*)\}|\{\\(em|it|bf|sc)\s+([^{}]*)\}/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const [whole, cmd, arg, oldCmd, oldArg] = match;
    const type = cmd
      ? MACROS[cmd]
      : ({ em: "em", it: "em", bf: "strong", sc: "smallcaps" } as const)[oldCmd as "em" | "it" | "bf" | "sc"];
    if (!type) continue;
    if (match.index > last) out.push({ type: "plain", value: cleanTextMode(text.slice(last, match.index)) });
    out.push({ type, value: cleanTextMode(cmd ? arg : oldArg) });
    last = match.index + whole.length;
  }
  if (last < text.length) out.push({ type: "plain", value: cleanTextMode(text.slice(last)) });
  return out.filter((r) => r.value !== "");
}
