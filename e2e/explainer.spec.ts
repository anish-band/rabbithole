import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Fixture paper 0 (2611.31241) ships with a hand-written 5-scene sample script.
const slide = (page: Page, i: number) => page.locator(`[role="feed"] > article[data-index="${i}"]`);
const player = (page: Page) => slide(page, 0).locator(".ex-player");
const progressScale = (page: Page) =>
  slide(page, 0)
    .locator(".ex-progress")
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slide(page, 0).getByRole("heading", { level: 2 })).toBeVisible();
});

test("plays the sample explainer with captions and scene progress", async ({ page }) => {
  const stage = slide(page, 0).getByRole("img", { name: /Animated explainer, scene 1 of 5/ });
  await expect(stage).toBeVisible();
  await expect(player(page)).not.toHaveAttribute("data-paused");
  await expect(slide(page, 0).getByText(/Drop n points uniformly/)).toBeVisible();
  await expect(slide(page, 0).getByRole("button", { name: "Scene 1 of 5" })).toHaveAttribute("aria-current", "step");
  await expect(stage.locator("circle").first()).toBeAttached();
});

test("pause freezes progress and play resumes it", async ({ page }) => {
  await slide(page, 0).getByRole("button", { name: "Pause" }).click();
  await expect(player(page)).toHaveAttribute("data-paused", "");
  const a = await progressScale(page);
  await page.waitForTimeout(400);
  expect(await progressScale(page)).toBe(a);
  await slide(page, 0).getByRole("button", { name: "Play" }).click();
  await expect.poll(() => progressScale(page)).toBeGreaterThan(a);
});

test("scene buttons jump, captions render math, and the end offers replay", async ({ page }) => {
  await slide(page, 0).getByRole("button", { name: "Scene 2 of 5" }).click();
  await expect(slide(page, 0).getByRole("img", { name: /scene 2 of 5/ })).toBeVisible();
  await expect(slide(page, 0).locator(".ex-player p .katex")).toBeVisible();

  await slide(page, 0).getByRole("button", { name: "Scene 5 of 5" }).click();
  // Finish the last scene's progress animation instead of waiting 8 s.
  await slide(page, 0).locator(".ex-progress").evaluate((el) => el.getAnimations().forEach((a) => a.finish()));
  const replay = slide(page, 0).getByRole("button", { name: "Replay" });
  await expect(replay).toBeVisible();
  await replay.click();
  await expect(slide(page, 0).getByRole("button", { name: "Scene 1 of 5" })).toHaveAttribute("aria-current", "step");
  await expect(player(page)).not.toHaveAttribute("data-paused");
});

test("the explainer pauses when its paper scrolls away", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, 1)).toHaveAttribute("data-active", "");
  await expect(player(page)).toHaveAttribute("data-paused", "");
  await page.keyboard.press("ArrowUp");
  await expect(player(page)).not.toHaveAttribute("data-paused");
});

test("papers without a script play a title card instead", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, 1).getByRole("img", { name: /Animated explainer/ })).toBeVisible();
});
