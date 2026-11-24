import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // System Chrome occasionally hangs in browser.newContext when many workers
  // start at once; 4 workers is fast and stable locally.
  workers: CI ? 2 : 4,
  // One retry in CI only, to absorb the Chrome newContext startup flake; the
  // JSON report feeds the flake-rate summary (scripts/ci/flake-report.mjs).
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["list"], ["github"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]]
    : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use the locally installed Chrome; no Playwright browser download needed.
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    {
      name: "reduced-motion",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
    },
  ],
  webServer: {
    // CI builds in its own step; locally, build first so tests run the production app.
    command: process.env.E2E_SKIP_BUILD ? `npx next start -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
