/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 * Inline (not .sql files) so they ship inside any bundle without file copying.
 * Never edit a migration that has been applied somewhere; add a new one.
 */
import type { Sql } from "./client";

/** Document tables: one row per cached thing, keyed like the old file names. */
const docTable = (name: string) => `
create table if not exists ${name} (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);`;

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
-- The Claude spend ledger: one row, updated only inside transactions.
create table if not exists spend (
  id         int primary key default 1 check (id = 1),
  spent_usd  numeric(14, 6) not null default 0,
  calls      integer not null default 0,
  by_route   jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into spend (id) values (1) on conflict do nothing;

-- In-flight worst-case reservations. They expire, so a crashed instance can't
-- hold budget forever.
create table if not exists reservations (
  id          bigserial primary key,
  amount_usd  numeric(14, 6) not null check (amount_usd >= 0),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists reservations_expires_at on reservations (expires_at);

${docTable("explainers")}
${docTable("explainer_failures")}
${docTable("mood_plans")}
${docTable("papers")}
${docTable("arxiv_cache")}

-- arXiv allows one request every 3 s per client. With several instances the
-- next free slot has to be shared.
create table if not exists arxiv_throttle (
  id      int primary key default 1 check (id = 1),
  next_at timestamptz not null default now()
);
insert into arxiv_throttle (id) values (1) on conflict do nothing;
`,
  },
  {
    id: "002_embeddings",
    sql: `
-- Paper embeddings (float32 little-endian), shared by every instance so each
-- paper is embedded once, not once per cold start.
create table if not exists embeddings (
  model      text not null,
  id         text not null,
  vec        bytea not null,
  created_at timestamptz not null default now(),
  primary key (model, id)
);
`,
  },
];

/** Apply pending migrations. Safe to run concurrently: one runner holds an advisory lock. */
export async function migrate(sql: Sql): Promise<string[]> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727274)`;
    await tx`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await tx<{ id: string }[]>`select id from schema_migrations`).map((r) => r.id));
    const applied: string[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await tx.unsafe(m.sql);
      await tx`insert into schema_migrations (id) values (${m.id})`;
      applied.push(m.id);
    }
    return applied;
  });
}
