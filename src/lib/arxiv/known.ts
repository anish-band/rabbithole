import "server-only";
import { dataDir, docs, safeName } from "@/lib/db/docs";
import type { Paper } from "./types";

/**
 * Papers this server has handed out in a feed, stored by id (Postgres, or
 * data/papers/ without a database). Lets other endpoints (explainers) trust paper content by id instead of accepting it
 * from the client, without another arXiv request.
 */
const store = docs<Paper>("papers", { dir: dataDir("papers"), name: (id) => `${safeName(id)}.json` });

/** id@version already stored by this process; a feed serves the same papers over and over. */
const stored = new Set<string>();

export async function rememberPapers(papers: Paper[]) {
  const fresh = papers.filter((p) => !stored.has(`${p.id}@${p.version}`));
  if (fresh.length === 0) return;
  await Promise.all(
    fresh.map(async (p) => {
      await store.put(p.id, p);
      stored.add(`${p.id}@${p.version}`);
    }),
  );
}

/**
 * A paper this server has served, or null. Deliberately no arXiv fallback: an
 * endpoint that spends budget per paper must not accept arbitrary ids.
 */
export async function knownPaper(id: string): Promise<Paper | null> {
  return (await store.get(id).catch(() => undefined))?.value ?? null;
}
