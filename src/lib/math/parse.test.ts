import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanTextMode, parseMathText, parseTextMacros } from "./parse";

const math = (value: string, display = false) => ({ type: "math", value, display });
const text = (value: string) => ({ type: "text", value });

describe("parseMathText", () => {
  test("plain text is one segment", () => {
    assert.deepEqual(parseMathText("no math here"), [text("no math here")]);
  });

  test("inline $...$", () => {
    assert.deepEqual(parseMathText("an $L^2$ bound"), [text("an "), math("L^2"), text(" bound")]);
  });

  test("several inline formulas", () => {
    assert.deepEqual(parseMathText("$c=2$ and $W_3$"), [math("c=2"), text(" and "), math("W_3")]);
  });

  test("display $$...$$ and \\[...\\]", () => {
    assert.deepEqual(parseMathText("a $$x^2$$ b"), [text("a "), math("x^2", true), text(" b")]);
    assert.deepEqual(parseMathText("a \\[x^2\\] b"), [text("a "), math("x^2", true), text(" b")]);
  });

  test("inline \\(...\\)", () => {
    assert.deepEqual(parseMathText("a \\(x\\) b"), [text("a "), math("x"), text(" b")]);
  });

  test("prices are not math", () => {
    assert.deepEqual(parseMathText("costs $5 and $10 today"), [text("costs $5 and $10 today")]);
  });

  test("escaped dollar is literal", () => {
    assert.deepEqual(parseMathText("a \\$5 fee"), [text("a $5 fee")]);
  });

  test("escaped dollar inside math stays in math", () => {
    assert.deepEqual(parseMathText("$a\\$b$"), [math("a\\$b")]);
  });

  test("unclosed $ stays text", () => {
    assert.deepEqual(parseMathText("an $x open formula"), [text("an $x open formula")]);
  });

  test("braces and macros inside math are kept", () => {
    assert.deepEqual(parseMathText("${\\sf QIP}(3) = {\\sf PSPACE}$"), [math("{\\sf QIP}(3) = {\\sf PSPACE}")]);
  });

  test("closing $ followed by a digit is not a close", () => {
    assert.deepEqual(parseMathText("$x$5 more"), [text("$x$5 more")]);
  });

  test("real arXiv abstract fragment", () => {
    const segs = parseMathText("is $\\frac12 N\\log N+O(N)$, with $(\\log 2-π^2/24)N+O(\\log^2 N)$.");
    assert.equal(segs.filter((s) => s.type === "math").length, 2);
    assert.ok(segs.every((s) => s.type === "math" || !s.value.includes("$")));
  });
});

describe("parseTextMacros", () => {
  test("\\emph becomes emphasis", () => {
    assert.deepEqual(parseTextMacros("a \\emph{new} idea"), [
      { type: "plain", value: "a " },
      { type: "em", value: "new" },
      { type: "plain", value: " idea" },
    ]);
  });

  test("old-style {\\bf x}", () => {
    assert.deepEqual(parseTextMacros("{\\bf bold}"), [{ type: "strong", value: "bold" }]);
  });

  test("unknown macros are left alone", () => {
    assert.deepEqual(parseTextMacros("\\foo{x}"), [{ type: "plain", value: "\\foo{x}" }]);
  });
});

describe("cleanTextMode", () => {
  test("dashes, quotes, ties and escapes", () => {
    assert.equal(cleanTextMode("a--b---c ``q'' x~y 50\\% R\\&D"), "a–b—c “q” x y 50% R&D");
  });
});
