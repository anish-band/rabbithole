/**
 * A worker process for job.test.ts to kill. Usage:
 *   node --import tsx job.crash-worker.ts <queue dir> <hang: "mid-call" | "after-journal">
 * It claims the job and runs it, hanging at the given point (after writing
 * <dir>/at-<point>) so the test can SIGKILL it there. Spend is "billed" to
 * <dir>/spend.json only when a call returns, as callClaude records it.
 */
import fs from "node:fs";
import path from "node:path";
import { FileQueue } from "@/lib/queue/file-queue";
import { runExplainerJob, type ExplainerJob } from "./job";
import { fakeDeps } from "./job.fakes";

const [dir, hang] = process.argv.slice(2);
const queue = new FileQueue<ExplainerJob>(dir);
const forever = () => new Promise<never>(() => {});
const mark = (point: string) => fs.writeFileSync(path.join(dir, `at-${point}`), String(process.pid));

async function main() {
  const job = await queue.claim("doomed");
  if (!job) throw new Error("nothing to claim");
  const deps = fakeDeps(dir);
  await runExplainerJob(queue, job, "doomed", {
    ...deps,
    call: async (id) => {
      if (hang === "mid-call") {
        mark("mid-call");
        return forever(); // killed while the request is in flight: never billed here
      }
      return deps.call(id);
    },
    afterJournal: async () => {
      if (hang === "after-journal") {
        mark("after-journal");
        await forever(); // killed after paying, before saving
      }
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
