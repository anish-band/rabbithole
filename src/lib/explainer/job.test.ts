import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FileQueue } from "@/lib/queue/file-queue";
import { runExplainerJob, type ExplainerJob } from "./job";
import { CALL_USD, fakeDeps, readSpend, savedFile } from "./job.fakes";

const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "rabbithole-job-"));
const KEY = "2611.00001@p2";
const PAPER = "2611.00001";

async function setup() {
  const dir = freshDir();
  const queue = new FileQueue<ExplainerJob>(dir, { backoffMs: () => 0 });
  await queue.enqueue(KEY, { paperId: PAPER });
  return { dir, queue };
}

test("a job calls once, saves, and completes", async () => {
  const { dir, queue } = await setup();
  const job = (await queue.claim("w"))!;
  assert.equal(await runExplainerJob(queue, job, "w", fakeDeps(dir)), "done");
  assert.deepEqual(readSpend(dir), { calls: 1, usd: CALL_USD });
  assert.ok(fs.existsSync(savedFile(dir, PAPER)));
  assert.equal((await queue.get(KEY))?.status, "done");
});

test("an already generated paper completes without a call", async () => {
  const { dir, queue } = await setup();
  fs.writeFileSync(savedFile(dir, PAPER), "{}");
  assert.equal(await runExplainerJob(queue, (await queue.claim("w"))!, "w", fakeDeps(dir)), "done");
  assert.equal(readSpend(dir).calls, 0);
});

test("budget: checked before calling, and a budget refusal is dead-lettered, not retried", async () => {
  const { dir, queue } = await setup();
  const outcome = await runExplainerJob(queue, (await queue.claim("w"))!, "w", { ...fakeDeps(dir), canAfford: () => false });
  assert.equal(outcome, "dead");
  assert.equal(readSpend(dir).calls, 0);
  assert.equal((await queue.get(KEY))?.deadReason, "budget");
  assert.equal(await queue.claim("w"), null);

  const second = await setup();
  const refused = await runExplainerJob(second.queue, (await second.queue.claim("w"))!, "w", {
    ...fakeDeps(second.dir),
    call: async () => {
      throw new Error("over budget");
    },
    classify: () => "budget",
  });
  assert.equal(refused, "dead");
  assert.equal((await second.queue.get(KEY))?.deadReason, "budget");
});

test("rate limits back off and retry, then dead-letter after max attempts", async () => {
  const dir = freshDir();
  const queue = new FileQueue<ExplainerJob>(dir, { backoffMs: () => 0, maxAttempts: 3 });
  await queue.enqueue(KEY, { paperId: PAPER });
  const deps = {
    ...fakeDeps(dir),
    call: async () => {
      throw new Error("429 rate limited");
    },
    classify: () => "rate-limited" as const,
  };
  const outcomes = [];
  for (let i = 0; i < 3; i++) outcomes.push(await runExplainerJob(queue, (await queue.claim("w"))!, "w", deps));
  assert.deepEqual(outcomes, ["retry", "retry", "dead"]);
  assert.equal((await queue.get(KEY))?.deadReason, "exhausted");
});

test("unusable output is dead-lettered and the bad reply set aside", async () => {
  const { dir, queue } = await setup();
  const deps = { ...fakeDeps(dir), call: async () => ({ text: "{oops", model: "fake", stopReason: "end_turn" }) };
  assert.equal(await runExplainerJob(queue, (await queue.claim("w"))!, "w", deps), "dead");
  assert.equal((await queue.get(KEY))?.deadReason, "failed");
  assert.equal(await queue.readJournal(KEY), undefined, "the next revival makes a fresh call");
  assert.ok(fs.readdirSync(path.join(dir, "journal")).some((f) => f.endsWith(".rejected")), "kept for inspection");
});

/** Run the crash worker until it reaches `point`, then SIGKILL it. */
async function killAt(dir: string, point: "mid-call" | "after-journal") {
  const child = spawn(process.execPath, ["--import", "tsx", path.join(import.meta.dirname, "job.crash-worker.ts"), dir, point], { stdio: "inherit" });
  const exited = new Promise((resolve) => child.on("exit", resolve));
  const marker = path.join(dir, `at-${point}`);
  const deadline = Date.now() + 30_000;
  while (!fs.existsSync(marker)) {
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`worker never reached ${point}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill("SIGKILL");
  await exited;
}

test("killing the worker mid-call loses no work and records no duplicate spend", { timeout: 60_000 }, async () => {
  const { dir, queue } = await setup();
  await killAt(dir, "mid-call");
  assert.equal((await queue.get(KEY))?.status, "running", "the dead worker still holds the job");
  assert.equal(readSpend(dir).calls, 0, "nothing was billed before the kill");

  // A new worker takes over at once: the lease's owner process is gone.
  const job = await queue.claim("rescuer");
  assert.equal(job?.attempts, 2);
  assert.equal(await runExplainerJob(queue, job!, "rescuer", fakeDeps(dir)), "done");
  assert.deepEqual(readSpend(dir), { calls: 1, usd: CALL_USD });
  assert.ok(fs.existsSync(savedFile(dir, PAPER)));
});

test("killing the worker after it paid resumes from the journal without calling again", { timeout: 60_000 }, async () => {
  const { dir, queue } = await setup();
  await killAt(dir, "after-journal");
  assert.equal(readSpend(dir).calls, 1, "the call was made and billed");
  assert.ok(!fs.existsSync(savedFile(dir, PAPER)), "but the result wasn't saved");

  const job = await queue.claim("rescuer");
  const deps = fakeDeps(dir);
  let calls = 0;
  const outcome = await runExplainerJob(queue, job!, "rescuer", {
    ...deps,
    call: (id) => {
      calls++;
      return deps.call(id);
    },
  });
  assert.equal(outcome, "done");
  assert.equal(calls, 0, "no second call");
  assert.deepEqual(readSpend(dir), { calls: 1, usd: CALL_USD });
  assert.deepEqual(JSON.parse(fs.readFileSync(savedFile(dir, PAPER), "utf8")), { tldr: `about ${PAPER}` });
});
