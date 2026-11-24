/**
 * Load test for POST /api/feed. Never point this at a server that can reach
 * arXiv or Claude: start the app offline first, with the frozen 322-paper pool:
 *
 *   npm run build
 *   RABBITHOLE_FIXTURES=1 RABBITHOLE_FIXTURES_POOL=eval/rank/pool.json npx next start -p 3300
 *   npm run load:feed -- before        # writes load/results-before.json and prints a table
 *
 * Scenarios × concurrency 1 / 10 / 50, 10 s each.
 */
import fs from "node:fs";
import path from "node:path";
import autocannon from "autocannon";

const URL = process.env.LOAD_URL ?? "http://localhost:3300";
const LABEL = process.argv[2] ?? "run";
const DURATION = Number(process.env.LOAD_SECONDS ?? 10);
const LEVELS = (process.env.LOAD_LEVELS ?? "1,10,50").split(",").map(Number);

const pool = JSON.parse(fs.readFileSync("eval/rank/pool.json", "utf8"));
const ids = pool.map((p) => p.id);
// A realistic heavy client: a few dozen likes, skips and views.
const signals = { liked: ids.slice(0, 20), saved: ids.slice(20, 25), skipped: ids.slice(25, 55), hidden: ids.slice(55, 60), seen: ids.slice(0, 80) };

let n = 0;
const SCENARIOS = {
  "default feed": () => ({}),
  "mood": () => ({ mood: "black holes" }),
  "mood + taste": () => ({ mood: "black holes", signals }),
  // Every request a mood the server has never embedded: the model runs each time.
  "new mood each time": () => ({ mood: `topic ${n++} in physics` }),
};

function run(scenario, connections) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: `${URL}/api/feed`,
        method: "POST",
        headers: { "content-type": "application/json" },
        connections,
        duration: DURATION,
        requests: [{ setupRequest: (req) => ({ ...req, body: JSON.stringify(SCENARIOS[scenario]()) }) }],
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    instance.on("error", reject);
  });
}

async function main() {
  const probe = await fetch(`${URL}/api/feed`, { method: "POST", body: "{}" }).catch(() => null);
  if (!probe?.ok) throw new Error(`No offline app at ${URL} (see the header of this file).`);

  const rows = [];
  for (const scenario of Object.keys(SCENARIOS)) {
    for (const c of LEVELS) {
      const r = await run(scenario, c);
      const row = {
        scenario,
        connections: c,
        rps: r.requests.average,
        p50: r.latency.p50,
        // autocannon's percentiles are p50 / p90 / p97.5 / p99; no p95.
        p90: r.latency.p90,
        p975: r.latency.p97_5,
        p99: r.latency.p99,
        errors: r.errors + r.non2xx + r.timeouts,
        total: r.requests.total,
      };
      rows.push(row);
      console.log(`${scenario.padEnd(20)} c=${String(c).padStart(2)}  ${row.rps.toFixed(1).padStart(7)} req/s  p50 ${row.p50} ms  p90 ${row.p90} ms  p97.5 ${row.p975} ms  p99 ${row.p99} ms  errors ${row.errors}/${row.total}`);
    }
  }
  fs.mkdirSync("load", { recursive: true });
  fs.writeFileSync(path.join("load", `results-${LABEL}.json`), `${JSON.stringify({ label: LABEL, url: URL, duration: DURATION, at: new Date().toISOString(), rows }, null, 1)}\n`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
