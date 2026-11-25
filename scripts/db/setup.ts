/**
 * Database setup, against DATABASE_URL:
 *
 *   npm run db:migrate   apply pending migrations
 *   npm run db:seed      migrate, then copy local data/ into the database:
 *                        - the spend ledger, into an EMPTY ledger only, so moving
 *                          to Postgres can never reset the budget cap
 *                        - cached explainers, mood plans, served papers, arXiv
 *                          responses and paper embeddings (existing rows are
 *                          never overwritten)
 *
 * Reads data/ only; never modifies it.
 */
import fs from "node:fs";
import path from "node:path";
import { connect } from "@/lib/db/client";
import { PgDocs } from "@/lib/db/docs";
import { PgLedger, type LedgerSnapshot } from "@/lib/db/ledger";
import { migrate } from "@/lib/db/migrations";

const DATA = path.join(process.cwd(), "data");

const files = (dir: string, suffix: string) => {
  try {
    return fs.readdirSync(path.join(DATA, dir)).filter((f) => f.endsWith(suffix));
  } catch {
    return [];
  }
};
const readJson = <T>(...parts: string[]) => JSON.parse(fs.readFileSync(path.join(DATA, ...parts), "utf8")) as T;

async function main() {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env.local");
    } catch {}
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see docker-compose.yml or .env.example)");
  const sql = connect(url, { max: 4 });
  try {
    const applied = await migrate(sql);
    console.log(applied.length ? `applied migrations: ${applied.join(", ")}` : "migrations: up to date");
    if (!process.argv.includes("--seed")) return;

    const ledgerFile = path.join(DATA, "spend.json");
    if (fs.existsSync(ledgerFile)) {
      const local = readJson<LedgerSnapshot>("spend.json");
      const seeded = await new PgLedger(() => sql).seedIfEmpty(local);
      console.log(seeded ? `ledger: seeded with $${local.spentUsd.toFixed(4)} spent (${local.calls} calls)` : "ledger: already has spend, left alone");
    }

    const copy = async <T>(table: string, dir: string, suffix: string, keyOf: (file: string, value: T) => string, raw = false) => {
      const store = new PgDocs<T>(table, () => sql);
      let added = 0;
      const names = files(dir, suffix).filter((f) => !f.endsWith(".tmp"));
      for (const name of names) {
        const text = fs.readFileSync(path.join(DATA, dir, name), "utf8");
        const value = (raw ? text : JSON.parse(text)) as T;
        if (await store.putIfAbsent(keyOf(name, value), value)) added++;
      }
      console.log(`${table}: ${added} added, ${names.length - added} already there`);
    };
    const id = (suffix: string) => (file: string) => file.slice(0, -suffix.length);

    // Explainers: <id>.json, but not <id>.failed.json (failures are retried, not copied).
    const explainers = new PgDocs<{ id: string }>("explainers", () => sql);
    let added = 0;
    const okFiles = files("explainers", ".json").filter((f) => !f.endsWith(".failed.json"));
    for (const name of okFiles) {
      const value = readJson<{ id: string }>("explainers", name);
      if (await explainers.putIfAbsent(value.id ?? id(".json")(name), value)) added++;
    }
    console.log(`explainers: ${added} added, ${okFiles.length - added} already there`);

    await copy<{ mood: string }>("mood_plans", "moods", ".json", (_, v) => v.mood);
    await copy<{ id: string }>("papers", "papers", ".json", (_, v) => v.id);
    await copy<string>("arxiv_cache", "arxiv", ".xml", id(".xml"), true);

    // Paper embeddings: data/embeddings/minilm-l6-v2/<id>.f32 (384 float32s).
    const vecDir = path.join("embeddings", "minilm-l6-v2");
    const vecFiles = files(vecDir, ".f32");
    const rows = vecFiles
      .map((f) => ({ model: "minilm-l6-v2", id: f.slice(0, -4), vec: fs.readFileSync(path.join(DATA, vecDir, f)) }))
      .filter((r) => r.vec.byteLength === 384 * 4);
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await sql`insert into embeddings ${sql(rows.slice(i, i + 500), "model", "id", "vec")} on conflict do nothing returning id`;
      inserted += res.length;
    }
    console.log(`embeddings: ${inserted} added, ${rows.length - inserted} already there`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
