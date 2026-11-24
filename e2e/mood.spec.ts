import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const slide = (page: Page, i: number) => page.locator(`[role="feed"] > article[data-index="${i}"]`);
const mood = (page: Page) => page.getByRole("searchbox", { name: "Mood" }).or(page.getByRole("textbox", { name: "Mood" }));

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(slide(page, 0).getByRole("heading", { level: 2 })).toBeVisible();
});

test("a mood restarts the feed with matching papers", async ({ page, feedRequests }) => {
  await mood(page).fill("driving");
  await mood(page).press("Enter");
  await expect(slide(page, 0)).toHaveAttribute("aria-label", /Driving/i);
  expect(feedRequests.at(-1)?.mood).toBe("driving");
  await expect(mood(page)).not.toBeFocused();
  // Arrow keys page the new feed once the field is blurred.
  await expect(page.getByText("Showing papers for driving")).toBeAttached();
});

test("clearing the mood returns to the default feed", async ({ page, feedRequests }) => {
  await mood(page).fill("driving");
  await mood(page).press("Enter");
  await expect(slide(page, 0)).toHaveAttribute("aria-label", /Driving/i);
  await page.getByRole("button", { name: "Clear mood" }).click();
  await expect(mood(page)).toHaveValue("");
  await expect(slide(page, 0)).not.toHaveAttribute("aria-label", /Driving/i);
  expect(feedRequests.at(-1)?.mood).toBeUndefined();
});

test("slash focuses the mood bar and Escape gives the keyboard back", async ({ page }) => {
  await page.keyboard.press("/");
  await expect(mood(page)).toBeFocused();
  await page.keyboard.type("j");
  await expect(mood(page)).toHaveValue("j");
  await page.keyboard.press("Escape");
  await expect(mood(page)).toHaveValue("");
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, 1)).toHaveAttribute("data-active", "");
});

test("a mood with no matches shows an empty state", async ({ page }) => {
  await mood(page).fill("zzzqqq");
  await mood(page).press("Enter");
  await expect(page.getByText("Nothing matched that mood")).toBeVisible();
  await page.getByRole("button", { name: "Clear mood" }).click();
  await expect(mood(page)).toHaveValue("");
  await expect(slide(page, 0).getByRole("heading", { level: 2 })).toBeVisible();
});

test("shows a skeleton while the first page loads", async ({ page }) => {
  await mood(page).fill("driving");
  await mood(page).press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Finding papers for “driving”" })).toBeVisible();
  await expect(slide(page, 0)).toBeVisible();
});

test("feed requests carry the on-device taste signals", async ({ page, feedRequests }) => {
  const id = await slide(page, 0).evaluate(() => JSON.parse(localStorage.getItem("rabbithole:taste") ?? "null"));
  expect(id).toBeNull();
  await slide(page, 0).getByRole("button", { name: "Like", exact: true }).click();
  await mood(page).fill("driving");
  await mood(page).press("Enter");
  await expect(slide(page, 0)).toHaveAttribute("aria-label", /Driving/i);
  const signals = feedRequests.at(-1)?.signals as { liked: string[]; categories: string[] };
  expect(signals.liked).toHaveLength(1);
  expect(signals.categories).toEqual(["math.PR"]);
});

test("a failed first page offers a retry", async ({ page }) => {
  let fail = true;
  await page.route("**/api/feed", async (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({ status: 502, json: { error: "down" } });
    }
    return route.fallback();
  });
  await mood(page).fill("driving");
  await mood(page).press("Enter");
  await expect(page.getByRole("feed").getByRole("alert")).toContainText("Couldn’t load papers");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(slide(page, 0)).toHaveAttribute("aria-label", /Driving/i);
});
