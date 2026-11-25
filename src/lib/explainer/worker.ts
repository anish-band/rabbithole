import "server-only";
import { knownPaper } from "@/lib/arxiv/known";
import type { Paper } from "@/lib/arxiv/types";
import { claudeEnabled } from "@/lib/budget";
import { dataDir } from "@/lib/db/docs";
import { FileQueue } from "@/lib/queue/file-queue";
import {
  PROMPT_VERSION,
  cachedExplainer,
  callExplainer,
  canAffordExplainer,
  explainerWithoutGenerating,
  fallbackReason,
  interpretReply,
  saveGeneration,
  type ExplainerResult,
} from "./generate";
import { deadReasonToFallback, runExplainerJob, type ExplainerJob } from "./job";

/**
 * The background explainer worker: an in-process loop over a file-backed
 * queue under data/queue/explainers. Requests enqueue (idempotently: the key is
 * the paper id plus the prompt version) and wait a bounded time; the worker
 * keeps going after a request gives up, and jobs left behind by a crash or
 * restart are picked up the next time it runs.
 */
const queue = new FileQueue<ExplainerJob>(dataDir("queue", "explainers"));
const OWNER = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
/** Two at a time: the paper on screen and the next one. */
const CONCURRENCY = 2;
/** How long a request waits for its job before answering "not yet". */
const WAIT_MS = 45_000;
const IDLE_POLL_MS = 5_000;

const jobKey = (id: string) => `${id}@p${PROMPT_VERSION}`;

let slots = 0;
/** Wakes for idle loops, so a new job starts at once. */
const sleepers = new Set<() => void>();
const waiters = new Map<string, Set<() => void>>();

function notify(key: string) {
  for (const resolve of waiters.get(key) ?? []) resolve();
  waiters.delete(key);
}

const deps = {
  isDone: async (id: string) => !!(await cachedExplainer(id)),
  canAfford: async (id: string) => {
    const paper = await knownPaper(id);
    return !paper || canAffordExplainer(paper); // an unknown paper fails in `call` instead
  },
  call: async (id: string) => {
    const paper = await knownPaper(id);
    if (!paper) throw new Error(`unknown paper ${id}`);
    return callExplainer(paper);
  },
  classify: fallbackReason,
  interpret: interpretReply,
  save: async (id: string, data: Parameters<typeof saveGeneration>[1], model: string) => {
    await saveGeneration(id, data, model);
  },
  log: (message: string) => console.warn(`[explainer worker] ${message}`),
};

async function loop() {
  slots++;
  try {
    for (;;) {
      const job = await queue.claim(OWNER);
      if (job) {
        const outcome = await runExplainerJob(queue, job, OWNER, deps).catch((err) => {
          deps.log(`${job.key}: crashed: ${err instanceof Error ? err.message : err}`);
          return "retry" as const; // the lease expires and the job runs again
        });
        if (outcome !== "retry") notify(job.key);
        continue;
      }
      const live = await queue.live();
      if (live.length === 0) return;
      // Sleep until the next backoff ends (or a stale lease can be taken over), or a new job arrives.
      const wait = Math.min(IDLE_POLL_MS, Math.max(250, Math.min(...live.map((j) => j.runAfter)) - Date.now()));
      await new Promise<void>((resolve) => {
        const wake = () => {
          clearTimeout(timer);
          sleepers.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, wait);
        sleepers.add(wake);
      });
    }
  } finally {
    slots--;
  }
}

function startWorker() {
  for (const wake of [...sleepers]) wake();
  while (slots < CONCURRENCY) void loop();
}

/** Cached explainer for a paper, generating it on the worker queue if needed. */
export async function getExplainer(paper: Paper): Promise<ExplainerResult> {
  const ready = await explainerWithoutGenerating(paper);
  if (ready) return ready;
  // Switched off (no key, or RABBITHOLE_CLAUDE=off on a public deploy): cached explainers only.
  if (!claudeEnabled()) return { status: "fallback", reason: "unavailable" };

  const key = jobKey(paper.id);
  const job = await queue.enqueue(key, { paperId: paper.id });
  if (job.status === "dead") return { status: "fallback", reason: deadReasonToFallback(job.deadReason) };

  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      waiters.get(key)?.delete(done);
      resolve();
    };
    const timer = setTimeout(done, WAIT_MS);
    if (!waiters.has(key)) waiters.set(key, new Set());
    waiters.get(key)!.add(done);
    startWorker();
  });

  const cached = await cachedExplainer(paper.id);
  if (cached) return cached;
  const now = await queue.get(key);
  if (now?.status === "dead") return { status: "fallback", reason: deadReasonToFallback(now.deadReason) };
  // Still queued or backing off: transient, so the client asks again later and the worker keeps going.
  return { status: "fallback", reason: now?.lastError && /rate/i.test(now.lastError) ? "rate-limited" : "unavailable" };
}
