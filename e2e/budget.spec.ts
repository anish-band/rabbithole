import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const pill = (page: Page) => page.getByRole("banner").getByRole("button", { name: /Claude budget/ });

test("shows what's left and explains it in a popover", async ({ page }) => {
  await page.goto("/");
  await expect(pill(page)).toHaveText("$9.52 left");
  await expect(pill(page)).toHaveAttribute("data-budget-state", "ok");

  await pill(page).click();
  const popover = page.getByRole("dialog", { name: "Claude budget" });
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("$0.48 of $10.00 used");
  await expect(popover.getByRole("meter", { name: "Budget left" })).toHaveAttribute("aria-valuetext", "$9.52 left");

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(pill(page)).toBeFocused();
});

test("is keyboard reachable from the top bar", async ({ page }) => {
  await page.goto("/");
  await expect(pill(page)).toBeVisible();
  await pill(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Claude budget" })).toBeVisible();
});

test.describe("budget used up", () => {
  test.use({ budget: { budgetUsd: 10, spentUsd: 9.9, remainingUsd: 0.1, calls: 140, configured: true, rateLimitedMs: 0, apiFailing: false } });

  test("says so and the feed keeps working", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[role="feed"] > article[data-index="0"]').getByRole("heading", { level: 2 })).toBeVisible();
    await expect(pill(page)).toHaveText("Budget used up");
    await pill(page).click();
    await expect(page.getByRole("dialog", { name: "Claude budget" })).toContainText("new papers get a title card");
    await page.keyboard.press("Escape");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[role="feed"] > article[data-index="1"]')).toHaveAttribute("data-active", "");
  });
});

test.describe("rate limited", () => {
  test.use({ budget: { budgetUsd: 10, spentUsd: 1, remainingUsd: 9, calls: 30, configured: true, rateLimitedMs: 12_000, apiFailing: false } });
  test("shows a short wait", async ({ page }) => {
    await page.goto("/");
    await expect(pill(page)).toHaveText("Busy · 12s");
  });
});

test.describe("API paused", () => {
  test.use({ budget: { budgetUsd: 10, spentUsd: 1, remainingUsd: 9, calls: 30, configured: true, rateLimitedMs: 0, apiFailing: true } });
  test("says AI is paused", async ({ page }) => {
    await page.goto("/");
    await expect(pill(page)).toHaveText("AI paused");
  });
});

test.describe("no API key", () => {
  test.use({ budget: { budgetUsd: 10, spentUsd: 0, remainingUsd: 10, calls: 0, configured: false, rateLimitedMs: 0, apiFailing: false } });
  test("says AI is off", async ({ page }) => {
    await page.goto("/");
    await expect(pill(page)).toHaveText("AI off");
  });
});
