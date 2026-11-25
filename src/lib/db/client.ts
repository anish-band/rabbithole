/**
 * Optional Postgres connection. With `DATABASE_URL` set, the spend ledger and
 * the caches live in Postgres (safe across several server instances); without
 * it, everything stays on local files, as before.
 * No server-only import, so tests and scripts can use it.
 */
import postgres from "postgres";

export type Sql = postgres.Sql;

const globalForDb = globalThis as typeof globalThis & { __rabbitholeSql?: Sql };

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);

export function connect(url: string, options: postgres.Options<Record<string, never>> = {}): Sql {
  return postgres(url, {
    // Serverless-friendly: few connections per instance, closed when idle.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    ...options,
  });
}

/** The shared connection pool (one per process, surviving dev hot reloads). */
export function db(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (globalForDb.__rabbitholeSql ??= connect(url));
}
