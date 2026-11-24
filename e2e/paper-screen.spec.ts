import { expect, test, type Page } from "@playwright/test";

const first = (page: Page) => page.locator('[role="feed"] > article[data-index="0"]');

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(first(page).getByRole("heading", { level: 2 })).toBeVisible();
});

test("desktop: explainer on the left, info on the right", async ({ page }) => {
  const explainer = await first(page).getByRole("figure", { name: "Explainer" }).boundingBox();
  const title = await first(page).getByRole("heading", { level: 2 }).boundingBox();
  expect(explainer && title).toBeTruthy();
  expect(explainer!.x + explainer!.width).toBeLessThanOrEqual(title!.x);
  // Explainer takes roughly the left 55%.
  expect(explainer!.width / page.viewportSize()!.width).toBeGreaterThan(0.45);
});

test("narrow: panels stack with the explainer on top", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  const explainer = await first(page).getByRole("figure", { name: "Explainer" }).boundingBox();
  const title = await first(page).getByRole("heading", { level: 2 }).boundingBox();
  expect(explainer!.y + explainer!.height).toBeLessThanOrEqual(title!.y);
});

test("shows category, authors, date and links", async ({ page }) => {
  const s = first(page);
  await expect(s.locator("span[title=\"math.PR\"]")).toHaveText("Probability"); // first fixture
  await expect(s.locator("time").first()).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}/);
  const arxiv = s.getByRole("link", { name: "arXiv page" });
  await expect(arxiv).toHaveAttribute("href", /^https:\/\/arxiv\.org\/abs\//);
  await expect(arxiv).toHaveAttribute("target", "_blank");
  await expect(s.getByRole("link", { name: "PDF" })).toHaveAttribute("href", /^https:\/\/arxiv\.org\/pdf\//);
});

test("long author lists collapse and expand", async ({ page }) => {
  // Fixture 1 has 12 authors.
  await page.keyboard.press("ArrowDown");
  const s = page.locator('[role="feed"] > article[data-index="1"]');
  const more = s.getByRole("button", { name: /^\+\d+ more$/ });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(s.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
});

test("abstract expands and collapses", async ({ page }) => {
  const s = first(page);
  const toggle = s.getByRole("button", { name: "More" });
  const abstract = s.locator('p[id^="abstract-"]');
  const collapsed = (await abstract.boundingBox())!.height;
  await toggle.click();
  await expect(s.getByRole("button", { name: "Less" })).toHaveAttribute("aria-expanded", "true");
  expect((await abstract.boundingBox())!.height).toBeGreaterThan(collapsed);
});

test("like, save and not interested toggle", async ({ page }) => {
  const s = first(page);
  for (const [name, active] of [
    ["Like", "Liked"],
    ["Save", "Saved"],
    ["Not interested", "Hidden"],
  ]) {
    const button = s.getByRole("button", { name, exact: true });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await button.click();
    await expect(s.getByRole("button", { name: active, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
});

test("buttons inside a paper don't move the feed when pressed with Space", async ({ page }) => {
  await first(page).getByRole("button", { name: "Like", exact: true }).focus();
  await page.keyboard.press(" ");
  await expect(first(page).getByRole("button", { name: "Liked", exact: true })).toBeVisible();
  expect(await page.locator('[role="feed"]').evaluate((el) => el.scrollTop)).toBe(0);
});
