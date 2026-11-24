import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FileQueue } from "./file-queue";

// Each test gets its own directory under the OS temp dir (left for the OS to clean).
const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "rabbithole-queue-"));
const T0 = 1_000_000;

test("enqueue is idempotent while a job is queued or running", async () => {
  const q = new FileQueue<{ id: string }>(freshDir());
  const a = await q.enqueue("p@v2", { id: "p" }, T0);
  const b = await q.enqueue("p@v2", { id: "p" }, T0 + 5);
  assert.equal(b.createdAt, a.createdAt);
  const claimed = await q.claim("w1", T0 + 10);
  assert.equal(claimed?.status, "running");
  assert.equal((await q.enqueue("p@v2", { id: "p" }, T0 + 20)).status, "running");
});

test("a claimed job can't be claimed again while its lease is live", async () => {
  const q = new FileQueue<null>(freshDir(), { leaseMs: 1_000 });
  await q.enqueue("k", null, T0);
  assert.ok(await q.claim("w1", T0));
  assert.equal(await q.claim("w2", T0 + 500), null);
});

test("a stale lease is reclaimed, so a crashed worker's job isn't lost", async () => {
  const q = new FileQueue<null>(freshDir(), { leaseMs: 1_000 });
  await q.enqueue("k", null, T0);
  await q.claim("crashed", T0); // never completes
  const again = await q.claim("w2", T0 + 1_001);
  assert.equal(again?.key, "k");
  assert.equal(again?.attempts, 2);
});

test("a lock held by a dead process is stale even before it expires", async () => {
  const dir = freshDir();
  const q = new FileQueue<null>(dir, { leaseMs: 60_000 });
  await q.enqueue("k", null, T0);
  await q.claim("w1", T0);
  // Pretend attempt 1's owner was another process that has since died:
  // pid 2^22 + 1 is above macOS/Linux pid limits, so no such process exists.
  fs.writeFileSync(path.join(dir, "locks", `k.${T0}.1.lock`), JSON.stringify({ owner: "ghost", pid: 4_194_305, until: T0 + 60_000 }));
  assert.equal((await q.claim("w2", T0 + 1))?.attempts, 2);
});

test("concurrent claims: exactly one worker wins, for a fresh job and for a stale one", async () => {
  const q = new FileQueue<null>(freshDir(), { leaseMs: 1_000 });
  await q.enqueue("k", null, T0);
  const fresh = await Promise.all(["a", "b", "c", "d"].map((w) => q.claim(w, T0)));
  assert.equal(fresh.filter(Boolean).length, 1);
  const stale = await Promise.all(["e", "f", "g", "h"].map((w) => q.claim(w, T0 + 5_000)));
  assert.equal(stale.filter(Boolean).length, 1);
  assert.equal((await q.get("k"))?.attempts, 2);
});

test("retries back off, then dead-letter when attempts run out", async () => {
  const q = new FileQueue<null>(freshDir(), { maxAttempts: 2, backoffMs: () => 100, exhaustedRetryAfterMs: 1_000 });
  await q.enqueue("k", null, T0);
  const first = (await q.claim("w", T0))!;
  const backedOff = await q.retry(first, "w", "rate limited", T0);
  assert.equal(backedOff.status, "queued");
  assert.equal(await q.claim("w", T0 + 50), null, "not runnable during backoff");
  const second = (await q.claim("w", T0 + 100))!;
  const dead = await q.retry(second, "w", "rate limited", T0 + 100);
  assert.equal(dead.status, "dead");
  assert.equal(dead.deadReason, "exhausted");
  assert.deepEqual((await q.deadLetters()).map((j) => j.key), ["k"]);
  assert.equal(await q.claim("w", T0 + 10_000), null, "dead jobs are never claimed");
});

test("a dead job stays dead until retryAfter, then enqueue revives it", async () => {
  const q = new FileQueue<null>(freshDir());
  await q.enqueue("k", null, T0);
  const job = (await q.claim("w", T0))!;
  await q.deadLetter(job, "w", "budget", 1_000, "budget used up", T0);
  assert.equal((await q.enqueue("k", null, T0 + 999)).status, "dead");
  const revived = await q.enqueue("k", null, T0 + 1_000);
  assert.equal(revived.status, "queued");
  assert.equal(revived.attempts, 0);
  assert.deepEqual(await q.deadLetters(), []);
});

test("a done job is queued again if its result is asked for (it went missing)", async () => {
  const q = new FileQueue<null>(freshDir());
  await q.enqueue("k", null, T0);
  await q.complete((await q.claim("w", T0))!, "w", T0);
  assert.equal((await q.get("k"))?.status, "done");
  assert.equal((await q.enqueue("k", null, T0 + 1)).status, "queued");
});

test("the journal survives and can be set aside", async () => {
  const q = new FileQueue<null>(freshDir());
  await q.writeJournal("k", { text: "reply" });
  assert.deepEqual(await q.readJournal("k"), { text: "reply" });
  await q.discardJournal("k");
  assert.equal(await q.readJournal("k"), undefined);
});
