import { test as base, expect } from "@playwright/test";
import papers from "../src/fixtures/papers.json";

/**
 * Every test talks to a fake /api/feed backed by the fixture papers, so the
 * suite is offline, deterministic and never spends Claude budget.
 * - No mood: fixtures in order, 6 per page, then done.
 * - Mood: fixtures whose title/abstract mention any mood word; "zzz" matches nothing.
 * Requests are recorded on `feedRequests` for assertions.
 */
export const PAGE_SIZE = 6;

type FeedBody = { mood?: string; exclude?: string[]; signals?: Record<string, unknown> };

export const test = base.extend<{ feedRequests: FeedBody[]; feedDelayMs: number }>({
  feedDelayMs: [400, { option: true }],
  feedRequests: [
    async ({ page, feedDelayMs }, use) => {
      const requests: FeedBody[] = [];
      await page.route("**/api/feed", async (route) => {
        const body = (route.request().postDataJSON() ?? {}) as FeedBody;
        requests.push(body);
        const words = (body.mood ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const pool = words.length
          ? papers.filter((p) => words.some((w) => `${p.title} ${p.abstract}`.toLowerCase().includes(w)))
          : papers;
        const exclude = new Set(body.exclude ?? []);
        const page = pool.filter((p) => !exclude.has(p.id)).slice(0, PAGE_SIZE);
        await new Promise((r) => setTimeout(r, feedDelayMs));
        await route.fulfill({
          json: {
            papers: page,
            nextRound: 0,
            done: page.length < PAGE_SIZE,
            mood: body.mood ? { label: body.mood, source: "fallback" } : undefined,
            ranked: true,
          },
        });
      });
      await use(requests);
    },
    { auto: true },
  ],
});

export { expect };
