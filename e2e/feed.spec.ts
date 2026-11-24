import { expect, test, type Page } from "@playwright/test";

const slides = (page: Page) => page.locator('[role="feed"] > article');

/** Index of the slide currently snapped into view. */
async function visibleIndex(page: Page) {
  return page.locator('[role="feed"]').evaluate((el) => Math.round(el.scrollTop / el.clientHeight));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slides(page).first()).toBeVisible();
});

test("renders a full-screen first paper", async ({ page }) => {
  const box = await slides(page).first().boundingBox();
  const viewport = page.viewportSize()!;
  expect(box?.height).toBe(viewport.height);
  await expect(slides(page).first().getByRole("heading", { level: 2 })).not.toBeEmpty();
});

test("arrow keys and j/k move between papers", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => visibleIndex(page)).toBe(1);
  await page.keyboard.press("j");
  await expect.poll(() => visibleIndex(page)).toBe(2);
  await page.keyboard.press("k");
  await expect.poll(() => visibleIndex(page)).toBe(1);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => visibleIndex(page)).toBe(0);
});

test("does not scroll above the first paper", async ({ page }) => {
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  expect(await visibleIndex(page)).toBe(0);
});

test("one mouse-wheel notch moves exactly one paper", async ({ page }) => {
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => visibleIndex(page)).toBe(1);
  await page.waitForTimeout(400); // let the gesture end
  await page.mouse.wheel(0, -100);
  await expect.poll(() => visibleIndex(page)).toBe(0);
});

test("one long trackpad gesture (with momentum) moves only one paper", async ({ page }) => {
  await page.mouse.move(700, 450);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 40); // a stream of small deltas, < 180 ms apart
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(800);
  expect(await visibleIndex(page)).toBe(1);
});

test("prefetches more papers near the end", async ({ page }) => {
  const initial = await slides(page).count();
  for (let i = 0; i < initial - 2; i++) await page.keyboard.press("ArrowDown");
  await expect.poll(() => slides(page).count(), { timeout: 5_000 }).toBeGreaterThan(initial);
});

test("ignores shortcuts while typing in a text field", async ({ page }) => {
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "probe";
    document.body.prepend(input);
  });
  await page.focus("#probe");
  await page.keyboard.press("j");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  expect(await visibleIndex(page)).toBe(0);
});
