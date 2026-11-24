import { expect, test } from "./fixtures";

const slide = (page: import("@playwright/test").Page, i: number) => page.locator(`[role="feed"] > article[data-index="${i}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slide(page, 0)).toBeVisible();
});

// Fixture slides 0, 3 and 4 contain LaTeX in their abstracts (see src/fixtures/papers.json).
for (const i of [0, 3, 4]) {
  test(`slide ${i} renders math with KaTeX and shows no raw TeX`, async ({ page }) => {
    for (let k = 0; k < i; k++) await page.keyboard.press("ArrowDown");
    const s = slide(page, i);
    await expect(s.locator(".katex").first()).toBeVisible();
    await expect(s.locator(".katex-error")).toHaveCount(0);

    // Visible prose (excluding KaTeX's own markup) has no leftover TeX.
    const prose = await s.evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".katex").forEach((k) => k.remove());
      return clone.textContent ?? "";
    });
    expect(prose).not.toMatch(/\$|\\(frac|sim|approx|mathrm|emph|sf)\b/);
  });
}

test("formulas are exposed to screen readers as MathML", async ({ page }) => {
  await expect(slide(page, 0).locator(".katex math").first()).toBeAttached();
});

test("math uses the surrounding text colour", async ({ page }) => {
  const [formula, prose] = await slide(page, 0).evaluate((el) => {
    const k = el.querySelector(".math-inline .katex") as HTMLElement;
    return [getComputedStyle(k).color, getComputedStyle(k.closest("p")!).color];
  });
  expect(formula).toBe(prose);
});
