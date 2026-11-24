/**
 * A small durable job queue on the local filesystem (SQS would replace it when
 * deployed). Crash-safe by construction:
 *
 * - every file write is atomic (unique temp file + rename);
 * - a job is claimed by creating the lock file for its next attempt
 *   exclusively (`wx`), so two workers can never both win; the lock is the
 *   lease, and it goes stale when it expires or its owner process is gone, so
 *   a killed worker's job is picked up again instead of being lost;
 * - a job's reply journal (see `writeJournal`) is written before the reply is
 *   used, so work that was paid for survives a crash.
 *
 * Layout: <dir>/jobs/<key>.json (live), <dir>/dead/<key>.json (dead letters),
 * <dir>/locks/<key>.<createdAt>.<attempt>.lock, <dir>/journal/<key>.json.
 * No server-only imports, so it is unit-testable and usable from scripts.
 */
import fs from "node:fs/promises";
import path from "node:path";

export type JobStatus = "queued" | "running" | "done" | "dead";

export type Job<P> = {
  key: string;
  payload: P;
  status: JobStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  /** Not claimable before this (backoff). */
  runAfter: number;
  lastError?: string;
  /** Why it was dead-lettered, e.g. "budget" or "failed". */
  deadReason?: string;
  /** A dead job is revived by `enqueue` from this time on. */
  retryAfter?: number;
};

export type QueueOptions = {
  /** A claim older than this is stale even if its owner is alive. */
  leaseMs?: number;
  /** Attempts (including the first) before a retryable failure is dead-lettered. */
  maxAttempts?: number;
  /** Delay before attempt n + 1. */
  backoffMs?: (attempt: number) => number;
  /** How long a job that used up its attempts stays dead before `enqueue` may revive it. */
  exhaustedRetryAfterMs?: number;
};

type Lock = { owner: string; pid: number; until: number };

const safe = (key: string) => key.replace(/[^\w.@-]/g, "_");

/** Exponential backoff: 2 s, 8 s, 32 s, then capped at 2 min. */
export const defaultBackoff = (attempt: number) => Math.min(120_000, 2_000 * 4 ** (attempt - 1));

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class FileQueue<P> {
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: (attempt: number) => number;
  private readonly exhaustedRetryAfterMs: number;

  constructor(
    readonly dir: string,
    { leaseMs = 5 * 60_000, maxAttempts = 4, backoffMs = defaultBackoff, exhaustedRetryAfterMs = 10 * 60_000 }: QueueOptions = {},
  ) {
    this.leaseMs = leaseMs;
    this.maxAttempts = maxAttempts;
    this.backoffMs = backoffMs;
    this.exhaustedRetryAfterMs = exhaustedRetryAfterMs;
  }

  private file(kind: "jobs" | "dead" | "journal", key: string) {
    return path.join(this.dir, kind, `${safe(key)}.json`);
  }

  private async write(file: string, data: unknown, flag?: "wx") {
    await fs.mkdir(path.dirname(file), { recursive: true });
    if (flag) return fs.writeFile(file, JSON.stringify(data), { flag });
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, file);
  }

  private async read<T>(file: string): Promise<T | undefined> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  /** The job in either the live queue or the dead-letter queue. */
  async get(key: string): Promise<Job<P> | undefined> {
    return (await this.read<Job<P>>(this.file("jobs", key))) ?? (await this.read<Job<P>>(this.file("dead", key)));
  }

  /**
   * Idempotent: a job already queued or running is returned as is. A finished
   * job is queued again (its result went missing). A dead job is revived only
   * once its `retryAfter` has passed; until then it is returned dead.
   */
  async enqueue(key: string, payload: P, now = Date.now()): Promise<Job<P>> {
    const live = await this.read<Job<P>>(this.file("jobs", key));
    if (live && live.status !== "done") return live;
    const dead = await this.read<Job<P>>(this.file("dead", key));
    if (dead && (dead.retryAfter ?? Infinity) > now) return dead;

    const job: Job<P> = { key, payload, status: "queued", attempts: 0, createdAt: now, updatedAt: now, runAfter: now };
    await this.write(this.file("jobs", key), job);
    if (dead) await fs.rename(this.file("dead", key), `${this.file("dead", key)}.${now}.revived`).catch(() => {});
    return job;
  }

  /**
   * One lock file per attempt (`<key>.<createdAt>.<attempt>.lock`), created
   * exclusively. Contenders for the same attempt race on the same name, so
   * exactly one wins; there is no read-then-overwrite window.
   */
  private lockFile(job: Job<P>, attempt: number) {
    return path.join(this.dir, "locks", `${safe(job.key)}.${job.createdAt}.${attempt}.lock`);
  }

  /** Is the lease on a running job's current attempt still held? */
  private async leaseHeld(job: Job<P>, now: number) {
    const held = await this.read<Lock>(this.lockFile(job, job.attempts));
    return !!held && held.until > now && alive(held.pid);
  }

  private async lock(job: Job<P>, owner: string, now: number): Promise<boolean> {
    const mine: Lock = { owner, pid: process.pid, until: now + this.leaseMs };
    try {
      await this.write(this.lockFile(job, job.attempts + 1), mine, "wx");
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw err;
    }
  }

  private async unlock(job: Job<P>) {
    await fs.unlink(this.lockFile(job, job.attempts)).catch(() => {});
  }

  /** Jobs not yet finished or dead (queued, backing off, or running), oldest first. */
  async live(): Promise<Job<P>[]> {
    let names: string[];
    try {
      names = (await fs.readdir(path.join(this.dir, "jobs"))).filter((n) => n.endsWith(".json"));
    } catch {
      return [];
    }
    const jobs = (await Promise.all(names.map((n) => this.read<Job<P>>(path.join(this.dir, "jobs", n))))).filter(
      (j): j is Job<P> => !!j && (j.status === "queued" || j.status === "running"),
    );
    return jobs.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Claim the oldest runnable job: queued and past its backoff, or running under a stale lease. */
  async claim(owner: string, now = Date.now()): Promise<Job<P> | null> {
    for (const job of (await this.live()).filter((j) => j.runAfter <= now)) {
      if (job.status === "running" && (await this.leaseHeld(job, now))) continue;
      if (!(await this.lock(job, owner, now))) continue;
      // Won: the previous attempt's lock (if its worker died) is now just litter.
      if (job.status === "running") await this.unlock(job);
      const claimed: Job<P> = { ...job, status: "running", attempts: job.attempts + 1, updatedAt: now };
      await this.write(this.file("jobs", job.key), claimed);
      return claimed;
    }
    return null;
  }

  async complete(job: Job<P>, _owner: string, now = Date.now()) {
    await this.write(this.file("jobs", job.key), { ...job, status: "done", updatedAt: now, lastError: undefined } satisfies Job<P>);
    await this.unlock(job);
  }

  /** A transient failure: back off and try again, or dead-letter once attempts run out. */
  async retry(job: Job<P>, owner: string, error: string, now = Date.now()): Promise<Job<P>> {
    if (job.attempts >= this.maxAttempts) return this.deadLetter(job, owner, "exhausted", this.exhaustedRetryAfterMs, error, now);
    const next: Job<P> = { ...job, status: "queued", runAfter: now + this.backoffMs(job.attempts), lastError: error, updatedAt: now };
    await this.write(this.file("jobs", job.key), next);
    await this.unlock(job);
    return next;
  }

  /** Move a job to the dead-letter queue; `enqueue` revives it after `retryAfterMs`. */
  async deadLetter(job: Job<P>, owner: string, reason: string, retryAfterMs: number, error?: string, now = Date.now()): Promise<Job<P>> {
    const dead: Job<P> = { ...job, status: "dead", deadReason: reason, lastError: error ?? job.lastError, retryAfter: now + retryAfterMs, updatedAt: now };
    await this.write(this.file("dead", job.key), dead);
    await fs.unlink(this.file("jobs", job.key)).catch(() => {});
    await this.unlock(job);
    return dead;
  }

  /** Dead letters, newest first (for inspection). */
  async deadLetters(): Promise<Job<P>[]> {
    try {
      const names = (await fs.readdir(path.join(this.dir, "dead"))).filter((n) => n.endsWith(".json"));
      const jobs = await Promise.all(names.map((n) => this.read<Job<P>>(path.join(this.dir, "dead", n))));
      return jobs.filter((j): j is Job<P> => !!j).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  /** Write-ahead journal: persist a paid-for result before acting on it. */
  writeJournal<T>(key: string, data: T) {
    return this.write(this.file("journal", key), data);
  }

  readJournal<T>(key: string): Promise<T | undefined> {
    return this.read<T>(this.file("journal", key));
  }

  /** Set a journal aside (kept for inspection) so the next attempt makes a fresh call. */
  async discardJournal(key: string, now = Date.now()) {
    await fs.rename(this.file("journal", key), `${this.file("journal", key)}.${now}.rejected`).catch(() => {});
  }
}
