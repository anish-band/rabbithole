/**
 * A small document store with two backends: local files (the default, same
 * paths as before) or a Postgres table when `DATABASE_URL` is set. Used for
 * caches that a multi-instance deployment can't keep on local disk.
 */
import fs from "fs/promises";
import path from "path";
import type postgres from "postgres";
import { db, hasDatabase, type Sql } from "./client";

export type Stored<T> = { value: T; updatedAt: number };

export interface DocStore<T> {
  get(key: string): Promise<Stored<T> | undefined>;
  put(key: string, value: T): Promise<void>;
  /** Write only if absent; true if this call wrote it. */
  putIfAbsent(key: string, value: T): Promise<boolean>;
}

export type FileOptions = {
  dir: string;
  /** File name for a key. */
  name: (key: string) => string;
  /** Store strings as-is (e.g. XML) instead of as JSON. */
  raw?: boolean;
};

export class FileDocs<T> implements DocStore<T> {
  constructor(private readonly o: FileOptions) {}

  private file(key: string) {
    return path.join(this.o.dir, this.o.name(key));
  }

  async get(key: string): Promise<Stored<T> | undefined> {
    try {
      const file = this.file(key);
      const [text, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
      return { value: (this.o.raw ? text : JSON.parse(text)) as T, updatedAt: stat.mtimeMs };
    } catch {
      return undefined;
    }
  }

  async put(key: string, value: T) {
    const file = this.file(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // A unique temp name per write: concurrent writers of one key must not share it.
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, this.o.raw ? String(value) : JSON.stringify(value, null, 1));
    await fs.rename(tmp, file);
  }

  async putIfAbsent(key: string, value: T) {
    if (await this.get(key)) return false;
    await this.put(key, value);
    return true;
  }
}

export class PgDocs<T> implements DocStore<T> {
  constructor(
    private readonly table: string,
    private readonly sql: () => Sql = db,
  ) {
    if (!/^[a-z_]+$/.test(table)) throw new Error(`bad table name ${table}`);
  }

  async get(key: string): Promise<Stored<T> | undefined> {
    const sql = this.sql();
    const [row] = await sql<{ value: T; updated_at: Date }[]>`select value, updated_at from ${sql(this.table)} where key = ${key}`;
    return row && { value: row.value, updatedAt: row.updated_at.getTime() };
  }

  async put(key: string, value: T) {
    const sql = this.sql();
    await sql`
      insert into ${sql(this.table)} (key, value) values (${key}, ${sql.json(value as postgres.JSONValue)})
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
  }

  async putIfAbsent(key: string, value: T) {
    const sql = this.sql();
    const rows = await sql`
      insert into ${sql(this.table)} (key, value) values (${key}, ${sql.json(value as postgres.JSONValue)})
      on conflict (key) do nothing returning key`;
    return rows.length > 0;
  }
}


/** Postgres when `DATABASE_URL` is set, otherwise files. Chosen per call, so tests and scripts can switch. */
export function docs<T>(table: string, file: FileOptions): DocStore<T> {
  const pg = new PgDocs<T>(table);
  const local = new FileDocs<T>(file);
  const pick = () => (hasDatabase() ? pg : local);
  return {
    get: (key) => pick().get(key),
    put: (key, value) => pick().put(key, value),
    putIfAbsent: (key, value) => pick().putIfAbsent(key, value),
  };
}

/** Where local files go: `RABBITHOLE_DATA_DIR`, or ./data (a read-only image can point it at /tmp). */
export const dataDir = (...parts: string[]) => path.join(process.env.RABBITHOLE_DATA_DIR ?? path.join(process.cwd(), "data"), ...parts);

export const safeName = (id: string) => id.replace(/[^\w.-]/g, "_");
