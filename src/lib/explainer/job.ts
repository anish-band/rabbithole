/**
 * One explainer generation job, run by the background worker. Pure
 * orchestration over a FileQueue and injected dependencies (the Claude call,
 * parsing, storage), so it can be tested without a server or an API key.
 *
 * Crash safety and spend:
 * - The raw reply is journaled the moment it arrives, before it is parsed or
 *   stored. A worker killed after that point resumes from the journal on the
 *   next claim, without a second call: a reply is never paid for twice.
 * - A worker killed while a call is in flight loses no work: its lease goes
 *   stale and the job runs again. That repeats the call, and the first one may
 *   already be billed by the API. It's the one unavoidable window.
 * - Budget is checked before calling; a budget refusal is dead-lettered, never
 *   retried in a loop. Rate limits and outages back off and retry.
 */
import type { FileQueue, Job } from "@/lib/queue/file-queue";

export type FallbackReason = "budget" | "rate-limited" | "unavailable" | "failed";
export type ExplainerJob = { paperId: string };
/** What the model sent back, as journaled. */
export type Reply = { text: string; model: string; stopReason: string | null };

export type JobDeps<D> = {
  /** Already generated (by an earlier run of this job, or another worker)? */
  isDone(paperId: string): Promise<boolean>;
  /** Room in the budget for this call's worst case? */
  canAfford(paperId: string): boolean | Promise<boolean>;
  call(paperId: string): Promise<Reply>;
  classify(err: unknown): FallbackReason;
  interpret(reply: Reply): { data: D } | { error: string };
  save(paperId: string, data: D, model: string): Promise<void>;
  /** Test hook: runs right after the reply is journaled. */
  afterJournal?(): void | Promise<void>;
  log?(message: string): void;
};

/** How long a dead-lettered job waits before a new request may revive it. */
export const REVIVE_AFTER_MS: Record<"budget" | "failed", number> = {
  budget: 10 * 60_000,
  failed: 24 * 60 * 60_000,
};

/** What the API tells the client about a dead-lettered job. */
export function deadReasonToFallback(reason: string | undefined): FallbackReason {
  if (reason === "budget") return "budget";
  if (reason === "failed") return "failed";
  return "unavailable"; // exhausted retries on rate limits / outages: transient
}

export async function runExplainerJob<D>(queue: FileQueue<ExplainerJob>, job: Job<ExplainerJob>, owner: string, deps: JobDeps<D>): Promise<"done" | "retry" | "dead"> {
  const { paperId } = job.payload;
  const log = deps.log ?? (() => {});

  if (await deps.isDone(paperId)) {
    await queue.complete(job, owner);
    return "done";
  }

  let reply = await queue.readJournal<Reply>(job.key);
  if (!reply) {
    if (!(await deps.canAfford(paperId))) {
      await queue.deadLetter(job, owner, "budget", REVIVE_AFTER_MS.budget, "not enough budget left for this call");
      return "dead";
    }
    try {
      reply = await deps.call(paperId);
    } catch (err) {
      const reason = deps.classify(err);
      const message = err instanceof Error ? err.message : String(err);
      log(`${job.key}: ${reason}: ${message}`);
      if (reason === "budget") {
        await queue.deadLetter(job, owner, "budget", REVIVE_AFTER_MS.budget, message);
        return "dead";
      }
      if (reason === "failed") {
        await queue.deadLetter(job, owner, "failed", REVIVE_AFTER_MS.failed, message);
        return "dead";
      }
      const next = await queue.retry(job, owner, message); // rate limit / outage: back off
      return next.status === "dead" ? "dead" : "retry";
    }
    await queue.writeJournal(job.key, reply);
    await deps.afterJournal?.();
  }

  const parsed = deps.interpret(reply);
  if ("error" in parsed) {
    log(`${job.key}: rejected output: ${parsed.error}`);
    // Keep the bad reply for inspection; the next revival makes a fresh call.
    await queue.discardJournal(job.key);
    await queue.deadLetter(job, owner, "failed", REVIVE_AFTER_MS.failed, parsed.error);
    return "dead";
  }
  await deps.save(paperId, parsed.data, reply.model);
  await queue.complete(job, owner);
  return "done";
}
