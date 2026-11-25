/**
 * Postgres backend tests. They need a database: set TEST_DATABASE_URL (e.g.
 * `docker compose up -d db` and the URL in docker-compose.yml). Each run works
 * in its own throwaway schema. Skipped when no database is configured.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { connect, type Sql } from "./client";
import { PgDocs } from "./docs";
import { BudgetExceededError, FileLedger, PgLedger } from "./ledger";
import { migrate } from "./migrations";
import { claimSlot } from "./throttle";

const URL = process.env.TEST_DATABASE_URL;

describe("postgres backend", { skip: !URL && "TEST_DATABASE_URL not set" }, () => {
  const schema = `test_${process.pid}_${Date.now()}`;
  let admin: Sql;
  let sql: Sql;

  before(async () => {
    admin = connect(URL!, { max: 1 });
    await admin.unsafe(`create schema ${schema}`);
    sql = connect(URL!, { max: 60, connection: { search_path: schema } });
    assert.deepEqual(await migrate(sql), ["001_init"]);
  });

  after(async () => {
    await sql?.end();
    await admin?.unsafe(`drop schema if exists ${schema} cascade`);
    await admin?.end();
  });

  test("migrations are idempotent, even when run concurrently", async () => {
    const runs = await Promise.all([migrate(sql), migrate(sql), migrate(sql)]);
    assert.deepEqual(runs, [[], [], []]);
  });

  test("N parallel reservations never exceed the cap", async () => {
    await sql`delete from reservations`;
    const ledger = new PgLedger(() => sql);
    // Cap $3.00, each reservation $0.30: exactly 10 of 50 may succeed.
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => ledger.reserve(0.3, 3)));
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    assert.equal(won.length, 10);
    assert.ok(lost.every((r) => (r as PromiseRejectedResult).reason instanceof BudgetExceededError));
    const [{ total }] = await sql<{ total: string }[]>`select sum(amount_usd) as total from reservations`;
    assert.ok(Number(total) <= 3);
  });

  test("settling swaps a reservation for the real cost; releasing frees it", async () => {
    await sql`delete from reservations`;
    const ledger = new PgLedger(() => sql);
    const before = await ledger.snapshot();
    const a = await ledger.reserve(1, 100);
    const b = await ledger.reserve(1, 100);
    await ledger.settle(a, "explainer", 0.25);
    await ledger.release(b);
    const now = await ledger.snapshot();
    assert.equal(Number((now.spentUsd - before.spentUsd).toFixed(6)), 0.25);
    assert.equal(now.calls - before.calls, 1);
    assert.equal(now.byRoute.explainer, (before.byRoute.explainer ?? 0) + 0.25);
    assert.equal((await sql`select id from reservations`).length, 0);
  });

  test("spend counts against the cap across ledgers (i.e. instances)", async () => {
    await sql`delete from reservations`;
    const spent = (await new PgLedger(() => sql).snapshot()).spentUsd;
    const one = new PgLedger(() => sql);
    const two = new PgLedger(() => sql);
    await one.reserve(0.5, spent + 1);
    await assert.rejects(two.reserve(0.6, spent + 1), BudgetExceededError);
    await two.reserve(0.5, spent + 1);
  });

  test("expired reservations stop counting (a crashed instance can't hold budget)", async () => {
    await sql`delete from reservations`;
    const spent = (await new PgLedger(() => sql).snapshot()).spentUsd;
    const crashed = new PgLedger(() => sql, 1);
    await crashed.reserve(1, spent + 1); // never settled
    await new Promise((r) => setTimeout(r, 20));
    await new PgLedger(() => sql).reserve(1, spent + 1);
  });

  test("seeding copies the file ledger into an empty ledger only", async () => {
    const fresh = `${schema}_seed`;
    await admin.unsafe(`create schema ${fresh}`);
    const s = connect(URL!, { max: 2, connection: { search_path: fresh } });
    try {
      await migrate(s);
      const ledger = new PgLedger(() => s);
      assert.equal(await ledger.seedIfEmpty({ spentUsd: 1.72, calls: 40, byRoute: { explainer: 1.5 }, updatedAt: "" }), true);
      assert.equal(await ledger.seedIfEmpty({ spentUsd: 0, calls: 0, byRoute: {}, updatedAt: "" }), false);
      const snap = await ledger.snapshot();
      assert.equal(snap.spentUsd, 1.72);
      assert.equal(snap.byRoute.explainer, 1.5);
      await assert.rejects(ledger.reserve(8.5, 10), BudgetExceededError);
    } finally {
      await s.end();
      await admin.unsafe(`drop schema ${fresh} cascade`);
    }
  });

  test("documents: put, get, overwrite, putIfAbsent", async () => {
    const store = new PgDocs<{ n: number }>("explainers", () => sql);
    assert.equal(await store.get("x"), undefined);
    await store.put("x", { n: 1 });
    await store.put("x", { n: 2 });
    assert.deepEqual((await store.get("x"))?.value, { n: 2 });
    assert.equal(await store.putIfAbsent("x", { n: 3 }), false);
    assert.equal(await store.putIfAbsent("y", { n: 4 }), true);
    const text = new PgDocs<string>("arxiv_cache", () => sql);
    await text.put("q", "<feed/>");
    assert.equal((await text.get("q"))?.value, "<feed/>");
  });

  test("the shared throttle hands out slots at least the interval apart", async () => {
    const waits = (await Promise.all(Array.from({ length: 5 }, () => claimSlot(sql, 3_000)))).sort((a, b) => a - b);
    for (let i = 1; i < waits.length; i++) assert.ok(waits[i] - waits[i - 1] >= 2_990, `slots ${waits[i - 1]} → ${waits[i]}`);
  });
});

test("file ledger: same cap semantics within one process", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rabbithole-ledger-")), "spend.json");
  const ledger = new FileLedger(file);
  const results = await Promise.allSettled(Array.from({ length: 50 }, () => ledger.reserve(0.3, 3)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 10);
  const id = (results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<string>).value;
  await ledger.settle(id, "mood", 0.01);
  assert.equal((await ledger.snapshot()).spentUsd, 0.01);
});
