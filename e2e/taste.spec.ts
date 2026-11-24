import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const slide = (page: Page, i: number) => page.locator(`[role="feed"] > article[data-index="${i}"]`);
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("rabbithole:taste") ?? "null"));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slide(page, 0).getByRole("heading", { level: 2 })).toBeVisible();
});

test("a like survives scrolling away and reloading", async ({ page }) => {
  await slide(page, 0).getByRole("button", { name: "Like", exact: true }).click();
  for (let i = 1; i <= 4; i++) {
    await page.keyboard.press("ArrowDown");
    await expect(slide(page, i)).toHaveAttribute("data-active", "");
  }
  await page.keyboard.press("Home");
  await expect(slide(page, 0)).toHaveAttribute("data-active", "");
  await expect(slide(page, 0).getByRole("button", { name: "Liked", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(slide(page, 0).getByRole("button", { name: "Liked", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("saved papers appear in the drawer and can be removed", async ({ page }) => {
  const title = (await slide(page, 0).getByRole("heading", { level: 2 }).textContent())!;
  const open = page.getByRole("button", { name: /^Saved papers/ });
  await expect(open).toHaveAccessibleName("Saved papers");
  await slide(page, 0).getByRole("button", { name: "Save", exact: true }).click();
  await expect(open).toHaveAccessibleName("Saved papers (1)");

  await open.click();
  const drawer = page.getByRole("dialog", { name: "Saved" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("listitem")).toHaveCount(1);
  await expect(drawer.getByRole("link")).toContainText(title.slice(0, 20));

  // The feed doesn't page while the drawer is open.
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, 0)).toHaveAttribute("data-active", "");

  await drawer.getByRole("button", { name: /^Remove/ }).click();
  await expect(drawer.getByText("Nothing saved yet")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(open).toBeFocused();
  await expect(slide(page, 0).getByRole("button", { name: "Save", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("records view history with dwell time", async ({ page }) => {
  const firstId = await slide(page, 0).getAttribute("aria-label");
  expect(firstId).toBeTruthy();
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, 1)).toHaveAttribute("data-active", "");
  await expect.poll(async () => (await stored(page))?.history?.length ?? 0).toBeGreaterThan(0);
  const { history } = await stored(page);
  expect(history[0].dwellMs).toBeGreaterThan(0);
});

test("corrupt stored data falls back to an empty profile", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("rabbithole:taste", "{nope"));
  await page.reload();
  await expect(slide(page, 0).getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "false");
  await slide(page, 0).getByRole("button", { name: "Like", exact: true }).click();
  expect(Object.keys((await stored(page)).reactions)).toHaveLength(1);
});
