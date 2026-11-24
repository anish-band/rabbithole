import { expect, test, type Page } from "@playwright/test";

const slide = (page: Page, i: number) => page.locator(`[role="feed"] > article[data-index="${i}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slide(page, 0).getByRole("heading", { level: 2 })).toBeVisible();
});

test("top bar floats over the feed with a frosted material", async ({ page }) => {
  const bar = page.getByRole("banner");
  await expect(bar.getByRole("heading", { level: 1, name: "Rabbithole" })).toBeVisible();
  const style = await bar.evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, backdrop: s.backdropFilter, image: s.backgroundImage };
  });
  expect(style.position).toBe("fixed");
  expect(style.image).toBe("none"); // no gradients
  // The explainer starts below the bar, not under it.
  const barBox = (await bar.boundingBox())!;
  const stage = (await slide(page, 0).getByRole("figure", { name: "Explainer" }).boundingBox())!;
  expect(stage.y).toBeGreaterThanOrEqual(barBox.y + barBox.height);
});

test("previous/next buttons page the feed", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Feed" });
  const prev = nav.getByRole("button", { name: "Previous paper" });
  const next = nav.getByRole("button", { name: "Next paper" });
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(slide(page, 1)).toHaveAttribute("data-active", "");
  await expect(prev).toBeEnabled();
  await prev.click();
  await expect(slide(page, 0)).toHaveAttribute("data-active", "");
});

test("off-screen papers are dimmed and the active one is fully visible", async ({ page }) => {
  const opacityOf = (i: number) =>
    slide(page, i).locator(".reveal-group > *").first().evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect.poll(() => opacityOf(0)).toBe(1);
  expect(await opacityOf(1)).toBeLessThan(1);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => opacityOf(1)).toBe(1);
});
