import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanTextMode, mathNodes, parseRich, plainText, type RichNode } from "./parse";

const math = (value: string, display = false): RichNode => ({ type: "math", value, display });
const text = (value: string): RichNode => ({ type: "text", value });
const styled = (style: "em" | "strong" | "smallcaps" | "plain", ...children: RichNode[]): RichNode => ({ type: "styled", style, children });

describe("math", () => {
  test("plain text is one node", () => {
    assert.deepEqual(parseRich("no math here"), [text("no math here")]);
  });

  test("inline $...$", () => {
    assert.deepEqual(parseRich("an $L^2$ bound"), [text("an "), math("L^2"), text(" bound")]);
  });

  test("display $$...$$ and \\[...\\], inline \\(...\\)", () => {
    assert.deepEqual(parseRich("a $$x^2$$ b"), [text("a "), math("x^2", true), text(" b")]);
    assert.deepEqual(parseRich("a \\[x^2\\] b"), [text("a "), math("x^2", true), text(" b")]);
    assert.deepEqual(parseRich("a \\(x\\) b"), [text("a "), math("x"), text(" b")]);
  });

  test("prices are not math", () => {
    assert.deepEqual(parseRich("costs $5 and $10 today"), [text("costs $5 and $10 today")]);
  });

  test("escaped dollar is literal, inside math it stays math", () => {
    assert.deepEqual(parseRich("a \\$5 fee"), [text("a $5 fee")]);
    assert.deepEqual(parseRich("$a\\$b$"), [math("a\\$b")]);
  });

  test("unclosed $ and empty $$ $$ stay text", () => {
    assert.deepEqual(parseRich("an $x open formula"), [text("an $x open formula")]);
    assert.deepEqual(mathNodes(parseRich("a $$ $$ b")), []);
  });

  test("closing $ followed by a digit is not a close", () => {
    assert.deepEqual(parseRich("$x$5 more"), [text("$x$5 more")]);
  });

  test("$ inside braces does not close ($\\text{a $b$}$)", () => {
    assert.deepEqual(parseRich("$\\text{a $b$}$"), [math("\\text{a $b$}")]);
  });

  test("\\\\ before math is a line break, not an escaped dollar", () => {
    assert.deepEqual(parseRich("end\\\\$x$"), [text("end "), math("x")]);
  });

  test("braces and macros inside math are kept", () => {
    assert.deepEqual(parseRich("${\\sf QIP}(3) = {\\sf PSPACE}$"), [math("{\\sf QIP}(3) = {\\sf PSPACE}")]);
  });

  test("real arXiv abstract fragment", () => {
    const nodes = parseRich("is $\\frac12 N\\log N+O(N)$, with $(\\log 2-π^2/24)N+O(\\log^2 N)$.");
    assert.equal(mathNodes(nodes).length, 2);
    assert.ok(!plainText(nodes).includes("$"));
  });
});

describe("text macros", () => {
  test("\\emph becomes emphasis", () => {
    assert.deepEqual(parseRich("a \\emph{new} idea"), [text("a "), styled("em", text("new")), text(" idea")]);
  });

  test("math inside a macro argument", () => {
    assert.deepEqual(parseRich("\\emph{the $x$ case}"), [styled("em", text("the "), math("x"), text(" case"))]);
  });

  test("nested macros and nested braces", () => {
    assert.deepEqual(parseRich("\\textbf{\\emph{x}}"), [styled("strong", styled("em", text("x")))]);
    assert.deepEqual(parseRich("\\emph{a {b} c}"), [styled("em", text("a {b} c"))]);
  });

  test("a } inside math does not close the macro", () => {
    assert.deepEqual(parseRich("\\emph{set $\\{x\\}$ here}"), [styled("em", text("set "), math("\\{x\\}"), text(" here"))]);
  });

  test("old-style {\\bf x}", () => {
    assert.deepEqual(parseRich("{\\bf bold} text"), [styled("strong", text("bold")), text(" text")]);
  });

  test("unknown macros and unbalanced braces are left alone", () => {
    assert.deepEqual(parseRich("\\foo{x}"), [text("\\foo{x}")]);
    assert.deepEqual(parseRich("\\emph{open"), [text("\\emph{open")]);
  });
});

describe("cleanTextMode", () => {
  test("dashes, quotes, ties and escapes", () => {
    assert.equal(cleanTextMode("a--b---c ``q'' x~y 50\\% R\\&D"), "a–b—c “q” x y 50% R&D");
  });

  test("spaced dashes", () => {
    assert.equal(cleanTextMode("this -- and that --- too"), "this – and that — too");
  });

  test("command-line flags are not turned into dashes", () => {
    assert.equal(cleanTextMode("run with --flag"), "run with --flag");
  });

  test("URLs are left untouched", () => {
    assert.equal(cleanTextMode("see https://x.org/~user/a--b now~ok"), "see https://x.org/~user/a--b now ok");
  });
});
