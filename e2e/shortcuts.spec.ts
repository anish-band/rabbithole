import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const slide = (page: Page, i: number) => page.locator(`[role="feed"] > article[data-index="${i}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slide(page, 0).getByRole("heading", { level: 2 })).toBeVisible();
});

test("? opens the shortcuts overlay and Escape closes it", async ({ page }) => {
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("term")).toContainText(["Next paper", "Previous paper", "First / last paper", "Like", "Save", "Not interested", "Set a mood"]);
  // The feed doesn't move underneath while it's open.
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, 0)).toHaveAttribute("data-active", "");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the top-bar button opens it too and focus returns", async ({ page }) => {
  const button = page.getByRole("banner").getByRole("button", { name: "Keyboard shortcuts" });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});

test("L, S and X act on the paper on screen and are announced", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, 1)).toHaveAttribute("data-active", "");
  const s = slide(page, 1);

  await page.keyboard.press("l");
  await expect(s.getByRole("button", { name: "Liked", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('p[aria-live="polite"]').filter({ hasText: "Liked" })).toBeAttached();

  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: "Saved papers (1)" })).toBeVisible();

  await page.keyboard.press("x");
  await expect(s.getByRole("button", { name: "Liked", exact: true })).toHaveCount(0);
  await page.keyboard.press("l");
  await expect(s.getByRole("button", { name: "Liked", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Paper 0 was never touched.
  await expect(slide(page, 0).getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("letters typed into the mood bar don't trigger shortcuts", async ({ page }) => {
  await page.keyboard.press("/");
  await page.keyboard.type("lsx?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();
  await expect(slide(page, 0).getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "false");
});
