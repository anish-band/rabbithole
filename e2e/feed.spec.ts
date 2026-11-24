import { expect, test, type Page } from "@playwright/test";

const feed = (page: Page) => page.locator('[role="feed"]');
const slides = (page: Page) => page.locator('[role="feed"] > article');

/** Wait until the feed has stopped scrolling, then return the snapped slide index. */
async function settledIndex(page: Page) {
  return feed(page).evaluate(
    (el) =>
      new Promise<number>((resolve) => {
        let last = -1;
        let stableFrames = 0;
        const tick = () => {
          if (el.scrollTop === last) stableFrames++;
          else stableFrames = 0;
          last = el.scrollTop;
          if (stableFrames >= 10) resolve(Math.round(el.scrollTop / el.clientHeight));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Index of the slide the app considers active. */
async function activeIndex(page: Page) {
  return Number(await page.locator("[data-active]").getAttribute("data-index"));
}

async function expectAt(page: Page, index: number) {
  expect(await settledIndex(page)).toBe(index);
  await expect.poll(() => activeIndex(page)).toBe(index);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slides(page).first()).toBeVisible();
});

test("renders a full-screen first paper", async ({ page }) => {
  const box = await slides(page).first().boundingBox();
  expect(box?.height).toBe(page.viewportSize()!.height);
  await expect(slides(page).first().getByRole("heading", { level: 2 })).not.toBeEmpty();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rabbithole");
});

test("arrow keys and j/k move exactly one paper at a time", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await expectAt(page, 1);
  await page.keyboard.press("j");
  await expectAt(page, 2);
  await page.keyboard.press("k");
  await expectAt(page, 1);
  await page.keyboard.press("ArrowUp");
  await expectAt(page, 0);
});

test("rapid key presses accumulate", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expectAt(page, 3);
});

test("does not scroll above the first paper", async ({ page }) => {
  await page.keyboard.press("ArrowUp");
  await expectAt(page, 0);
});

test("one mouse-wheel notch moves exactly one paper", async ({ page }) => {
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 100);
  await expectAt(page, 1);
  await page.waitForTimeout(400); // let the gesture end
  await page.mouse.wheel(0, -100);
  await expectAt(page, 0);
});

test("one long trackpad gesture (with momentum) moves only one paper", async ({ page }) => {
  await page.mouse.move(700, 450);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 40); // a stream of small deltas, well under 180 ms apart
    await page.waitForTimeout(20);
  }
  await expectAt(page, 1);
});

test("active paper follows native scrolling, including upward", async ({ page }) => {
  await feed(page).evaluate((el) => el.scrollTo({ top: el.clientHeight * 3, behavior: "instant" }));
  await expectAt(page, 3);
  await feed(page).evaluate((el) => el.scrollTo({ top: el.clientHeight * 2, behavior: "instant" }));
  await expectAt(page, 2);
  // The keyboard continues from where native scrolling left off.
  await page.keyboard.press("ArrowDown");
  await expectAt(page, 3);
});

test("focus follows keyboard navigation", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await expectAt(page, 1);
  await expect(slides(page).nth(1)).toBeFocused();
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
  await expectAt(page, 0);
});

test("Space activates a focused button instead of paging", async ({ page }) => {
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "probe";
    button.textContent = "probe";
    button.style.cssText = "position:fixed;top:8px;left:8px"; // on screen, so focusing it doesn't scroll
    button.onclick = () => button.setAttribute("data-clicked", "");
    document.querySelector("article")!.append(button);
  });
  await page.focus("#probe");
  await expectAt(page, 0);
  await page.keyboard.press(" ");
  await expect(page.locator("#probe")).toHaveAttribute("data-clicked", "");
  await expectAt(page, 0);
});
