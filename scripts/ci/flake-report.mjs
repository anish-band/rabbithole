// Summarises a Playwright JSON report for the GitHub job summary: totals and
// any test that only passed on retry (the flake rate tracked in #21).
import fs from "node:fs";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.log("No Playwright JSON report found.");
  process.exit(0);
}

const report = JSON.parse(fs.readFileSync(file, "utf8"));
const { expected = 0, unexpected = 0, flaky = 0, skipped = 0 } = report.stats ?? {};
const total = expected + unexpected + flaky;
const flakyTests = [];
const walk = (suite, trail) => {
  for (const s of suite.suites ?? []) walk(s, [...trail, s.title]);
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests ?? [])
      if (t.status === "flaky") flakyTests.push(`${t.projectName} › ${[...trail, spec.title].filter(Boolean).join(" › ")}`);
};
walk(report, []);

const rate = total ? ((flaky / total) * 100).toFixed(1) : "0.0";
console.log("### End-to-end tests\n");
console.log("| Passed | Failed | Flaky (passed on retry) | Skipped | Flake rate |");
console.log("|---|---|---|---|---|");
console.log(`| ${expected} | ${unexpected} | ${flaky} | ${skipped} | ${rate}% |`);
if (flakyTests.length) console.log(`\nFlaky:\n${flakyTests.map((t) => `- ${t}`).join("\n")}`);
