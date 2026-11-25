/**
 * The Claude spend ledger behind the budget cap, with two backends.
 *
 * Every call first reserves its worst-case cost; the reservation is refused if
 * spent + reserved + amount would pass the cap, and is later replaced by the
 * real cost (`settle`) or dropped (`release`).
 *
 * - FileLedger: data/spend.json plus in-memory reservations. Correct only
 *   within one process (the original design).
 * - PgLedger: reservations are rows, checked and inserted in one transaction
 *   that locks the single `spend` row, so any number of instances share the
 *   cap. Reservations expire, so a crashed instance can't hold budget forever.
 *
 * No server-only import, so tests can drive both backends directly.
 */
import fs from "fs";
import path from "path";
import type { Sql } from "./client";

export class BudgetExceededError extends Error {
  constructor(
    public spentUsd: number,
    public budgetUsd: number,
  ) {
    super(`Claude budget reached: $${spentUsd.toFixed(4)} of $${budgetUsd.toFixed(2)} spent`);
    this.name = "BudgetExceededError";
  }
}

export type LedgerSnapshot = { spentUsd: number; calls: number; byRoute: Record<string, number>; updatedAt: string };

export interface Ledger {
  /** Reserve worst-case cost; throws BudgetExceededError. Returns a reservation id. */
  reserve(amountUsd: number, capUsd: number): Promise<string>;
  /** Replace a reservation with the real cost. */
  settle(id: string, route: string, costUsd: number): Promise<void>;
  /** Drop a reservation (the call failed or was never sent). */
  release(id: string): Promise<void>;
  snapshot(): Promise<LedgerSnapshot>;
}

const empty = (): LedgerSnapshot => ({ spentUsd: 0, calls: 0, byRoute: {}, updatedAt: new Date().toISOString() });

export class FileLedger implements Ledger {
  private readonly reserved = new Map<string, number>();
  private next = 0;

  constructor(private readonly file: string) {}

  private read(): LedgerSnapshot {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as LedgerSnapshot;
    } catch {
      return empty();
    }
  }

  private write(ledger: LedgerSnapshot) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
    fs.renameSync(tmp, this.file); // atomic replace
  }

  // Synchronous inside: check and reserve can't interleave within one process.
  async reserve(amountUsd: number, capUsd: number) {
    const { spentUsd } = this.read();
    const reservedUsd = [...this.reserved.values()].reduce((a, b) => a + b, 0);
    if (spentUsd + reservedUsd + amountUsd > capUsd) throw new BudgetExceededError(spentUsd, capUsd);
    const id = String(++this.next);
    this.reserved.set(id, amountUsd);
    return id;
  }

  async settle(id: string, route: string, costUsd: number) {
    this.reserved.delete(id);
    const ledger = this.read();
    ledger.spentUsd += costUsd;
    ledger.calls += 1;
    ledger.byRoute[route] = (ledger.byRoute[route] ?? 0) + costUsd;
    ledger.updatedAt = new Date().toISOString();
    this.write(ledger);
  }

  async release(id: string) {
    this.reserved.delete(id);
  }

  async snapshot() {
    return this.read();
  }
}

export class PgLedger implements Ledger {
  constructor(
    private readonly sql: () => Sql,
    /** How long an unsettled reservation counts against the cap. */
    private readonly reservationTtlMs = 10 * 60_000,
  ) {}

  async reserve(amountUsd: number, capUsd: number) {
    return this.sql().begin(async (tx) => {
      // Serialises every reservation on the one ledger row.
      const [spend] = await tx<{ spent_usd: string }[]>`select spent_usd from spend where id = 1 for update`;
      const [held] = await tx<{ total: string }[]>`
        select coalesce(sum(amount_usd), 0) as total from reservations where expires_at > now()`;
      const spent = Number(spend.spent_usd);
      if (spent + Number(held.total) + amountUsd > capUsd) throw new BudgetExceededError(spent, capUsd);
      const [row] = await tx<{ id: string }[]>`
        insert into reservations (amount_usd, expires_at)
        values (${amountUsd}, now() + ${this.reservationTtlMs} * interval '1 millisecond')
        returning id`;
      // Housekeeping: expired reservations no longer count; drop old ones.
      await tx`delete from reservations where expires_at < now() - interval '1 day'`;
      return String(row.id);
    });
  }

  async settle(id: string, route: string, costUsd: number) {
    await this.sql().begin(async (tx) => {
      await tx`delete from reservations where id = ${id}`;
      await tx`
        update spend set
          spent_usd = spent_usd + ${costUsd},
          calls = calls + 1,
          by_route = jsonb_set(by_route, array[${route}], to_jsonb(coalesce((by_route ->> ${route})::numeric, 0) + ${costUsd})),
          updated_at = now()
        where id = 1`;
    });
  }

  async release(id: string) {
    await this.sql()`delete from reservations where id = ${id}`;
  }

  async snapshot(): Promise<LedgerSnapshot> {
    const [row] = await this.sql()<{ spent_usd: string; calls: number; by_route: Record<string, string | number>; updated_at: Date }[]>`
      select spent_usd, calls, by_route, updated_at from spend where id = 1`;
    if (!row) return empty();
    return {
      spentUsd: Number(row.spent_usd),
      calls: row.calls,
      byRoute: Object.fromEntries(Object.entries(row.by_route).map(([k, v]) => [k, Number(v)])),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** Seed an empty ledger (e.g. from data/spend.json) so moving to Postgres can't reset the cap. */
  async seedIfEmpty(from: LedgerSnapshot): Promise<boolean> {
    const rows = await this.sql()`
      update spend set spent_usd = ${from.spentUsd}, calls = ${from.calls}, by_route = ${this.sql().json(from.byRoute)}, updated_at = now()
      where id = 1 and calls = 0 and spent_usd = 0
      returning id`;
    return rows.length > 0;
  }
}
