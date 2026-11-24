import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Fixture paper 0 has a built-in sample; papers 1+ go through /api/explainer (mocked).
const slide = (page: Page, i: number) => page.locator(`[role="feed"] > article[data-index="${i}"]`);
const open = async (page: Page) => {
  await page.goto("/");
  await expect(slide(page, 0).getByRole("heading", { level: 2 })).toBeVisible();
};
const next = async (page: Page, i: number) => {
  await page.keyboard.press("ArrowDown");
  await expect(slide(page, i)).toHaveAttribute("data-active", "");
};

const GENERATED = {
  status: "ready",
  source: "claude",
  summary: {
    tldr: "Smaller driving models can keep their skills if you prune the right parts.",
    keyPoints: ["Pruning targets the vision tokens.", "Accuracy holds at half the compute.", "Latency drops on real hardware."],
  },
  explainer: {
    type: "scenes",
    version: 1,
    scenes: [
      {
        caption: "A driving model looks at the road and decides what to do.",
        duration: 4000,
        elements: [{ kind: "text", x: 80, y: 45, text: "Generated scene", enter: { at: 0, effect: "fade", duration: 300 } }],
      },
    ],
  },
};

test.describe("generated explainers", () => {
  test.use({ explainers: { "2611.31240": GENERATED } });

  test("show the generated script and fill in the summary", async ({ page }) => {
    await open(page);
    await next(page, 1);
    const s = slide(page, 1);
    await expect(s.getByRole("img", { name: /scene 1 of 1/ })).toBeVisible();
    await expect(s.getByText("Generated scene")).toBeAttached();
    const summary = s.getByRole("region", { name: "Paper details" }).getByRole("region", { name: "Summary" });
    await expect(summary).toContainText("Smaller driving models");
    await expect(summary.getByRole("listitem")).toHaveCount(3);
    await expect(s.locator("[data-explainer-note]")).toHaveCount(0);
  });
});

test.describe("lazy loading", () => {
  test.use({ explainers: { "2611.31240": GENERATED, "2611.31239": GENERATED, "2611.31236": GENERATED } });

  test("only the paper on screen and the next one are requested", async ({ page, explainerRequests }) => {
    await open(page);
    // Paper 0 uses its sample, so only paper 1 (next) is fetched.
    await expect.poll(() => explainerRequests).toEqual(["2611.31240"]);
    await next(page, 1);
    await expect.poll(() => explainerRequests).toEqual(["2611.31240", "2611.31239"]);
    await next(page, 2);
    await expect.poll(() => explainerRequests).toEqual(["2611.31240", "2611.31239", "2611.31236"]);
    // Scrolling back reuses what we already have.
    await page.keyboard.press("ArrowUp");
    await expect(slide(page, 1)).toHaveAttribute("data-active", "");
    await page.waitForTimeout(300);
    expect(explainerRequests).toEqual(["2611.31240", "2611.31239", "2611.31236"]);
  });
});

test("retries an offline explainer the next time the paper is wanted", async ({ page, explainerRequests }) => {
  await open(page);
  await next(page, 1);
  await next(page, 2);
  await next(page, 3); // paper 1 is no longer current or next
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(slide(page, 1)).toHaveAttribute("data-active", "");
  await expect.poll(() => explainerRequests.filter((id) => id === "2611.31240").length).toBe(2);
});

test("falls back to an animated title card when explainers are offline", async ({ page }) => {
  await open(page);
  await next(page, 1);
  const s = slide(page, 1);
  await expect(s.getByRole("img", { name: /Animated explainer/ })).toBeVisible();
  await expect(s.locator("svg text").first()).toContainText(/\w/);
  await expect(s.locator('[data-explainer-note="unavailable"]')).toHaveText("Explainers are offline");
  await expect(s.getByRole("region", { name: "Summary" })).toHaveCount(0);
});

test.describe("budget used up", () => {
  test.use({ explainers: { "2611.31240": { status: "fallback", reason: "budget" } } });

  test("says so on the stage", async ({ page }) => {
    await open(page);
    await next(page, 1);
    await expect(slide(page, 1).locator('[data-explainer-note="budget"]')).toHaveText("Explainer budget used up");
  });
});

test.describe("while generating", () => {
  test.use({ explainerDelayMs: 1500, explainers: { "2611.31240": GENERATED } });

  test("plays the title card with a generating note, then swaps in the script", async ({ page }) => {
    await open(page);
    await next(page, 1);
    const s = slide(page, 1);
    // The next paper was prefetched, so the request may already be in flight; either state is fine,
    // but the note must clear and the generated script must win.
    await expect(s.getByText("Generated scene")).toBeAttached({ timeout: 5000 });
    await expect(s.locator("[data-explainer-note]")).toHaveCount(0);
  });

  test("shows the generating note on the stage", async ({ page }) => {
    await page.goto("/");
    await expect(slide(page, 1).locator('[data-explainer-note="loading"]')).toHaveText("Generating explainer…");
  });
});
