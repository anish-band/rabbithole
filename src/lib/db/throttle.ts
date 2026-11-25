import type { Sql } from "./client";

/**
 * Claim the next shared request slot (e.g. arXiv's one request per 3 s) across
 * every instance. One UPDATE under the row lock: my slot is the later of the
 * stored `next_at` and now, and `next_at` moves `intervalMs` past it.
 * Returns how long to wait before sending, measured on the database clock so
 * instances with skewed clocks still agree.
 */
export async function claimSlot(sql: Sql, intervalMs: number): Promise<number> {
  const [row] = await sql<{ wait_ms: number }[]>`
    update arxiv_throttle
       set next_at = greatest(next_at, now()) + ${intervalMs} * interval '1 millisecond'
     where id = 1
    returning greatest(0, extract(epoch from (next_at - ${intervalMs} * interval '1 millisecond' - now())) * 1000)::float8 as wait_ms`;
  return row.wait_ms;
}
