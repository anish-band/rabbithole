/** Download the local embedding model into data/models (for image builds). No-op if it's already there. */
import { embedQuery } from "@/lib/rank/embed";

embedQuery("warm up")
  .then((v) => console.log(`embedding model ready (${v.length} dimensions)`))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
