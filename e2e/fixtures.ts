import { test as base, expect } from "@playwright/test";
import papers from "../src/fixtures/papers.json";

/**
 * Every test talks to a fake /api/feed backed by the fixture papers, so the
 * suite is offline, deterministic and never spends Claude budget.
 * - No mood: fixtures in order, 6 per page, then done.
 * - Mood: fixtures whose title/abstract mention any mood word; "zzz" matches nothing.
 * Requests are recorded on `feedRequests` for assertions.
 *
 * /api/explainer is faked too (never a real Claude call): papers listed in
 * `explainers` get that response, everything else the "offline" fallback.
 * Requested ids are recorded on `explainerRequests`. /api/budget returns `budget`.
 */
export const PAGE_SIZE = 6;

type FeedBody = { mood?: string; exclude?: string[]; signals?: Record<string, unknown> };

type ExplainerResponse = Record<string, unknown>;
const OFFLINE: ExplainerResponse = { status: "fallback", reason: "unavailable" };

export const test = base.extend<{
  feedRequests: FeedBody[];
  feedDelayMs: number;
  explainers: Record<string, ExplainerResponse>;
  explainerDelayMs: number;
  explainerRequests: string[];
  budget: Record<string, unknown>;
  budgetMock: void;
}>({
  budget: [{ budgetUsd: 10, spentUsd: 0.48, remainingUsd: 9.52, calls: 8, configured: true, rateLimitedMs: 0, apiFailing: false }, { option: true }],
  budgetMock: [
    async ({ page, budget }, use) => {
      await page.route("**/api/budget", (route) => route.fulfill({ json: budget }));
      await use();
    },
    { auto: true },
  ],
  explainers: [{}, { option: true }],
  explainerDelayMs: [0, { option: true }],
  explainerRequests: [
    async ({ page, explainers, explainerDelayMs }, use) => {
      const requests: string[] = [];
      await page.route("**/api/explainer?*", async (route) => {
        const id = new URL(route.request().url()).searchParams.get("id") ?? "";
        requests.push(id);
        await new Promise((r) => setTimeout(r, explainerDelayMs));
        await route.fulfill({ json: explainers[id] ?? OFFLINE });
      });
      await use(requests);
    },
    { auto: true },
  ],
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
