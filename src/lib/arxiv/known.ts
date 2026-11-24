import "server-only";
import fs from "fs/promises";
import path from "path";
import type { Paper } from "./types";

/**
 * Papers this server has handed out in a feed, kept on disk by id. Lets other
 * endpoints (explainers) trust paper content by id instead of accepting it
 * from the client, without another arXiv request.
 */
const DIR = path.join(process.cwd(), "data", "papers");
const file = (id: string) => path.join(DIR, `${id.replace(/[^\w.-]/g, "_")}.json`);

/** id@version already on disk from this process; a feed serves the same papers over and over. */
const stored = new Set<string>();

export async function rememberPapers(papers: Paper[]) {
  const fresh = papers.filter((p) => !stored.has(`${p.id}@${p.version}`));
  if (fresh.length === 0) return;
  await fs.mkdir(DIR, { recursive: true });
  await Promise.all(
    fresh.map(async (p) => {
      const target = file(p.id);
      // A unique temp name per write: concurrent requests serving the same
      // paper used to share one and steal each other's file mid-rename.
      const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(p));
      await fs.rename(tmp, target);
      stored.add(`${p.id}@${p.version}`);
    }),
  );
}

/**
 * A paper this server has served, or null. Deliberately no arXiv fallback: an
 * endpoint that spends budget per paper must not accept arbitrary ids.
 */
export async function knownPaper(id: string): Promise<Paper | null> {
  try {
    return JSON.parse(await fs.readFile(file(id), "utf8")) as Paper;
  } catch {
    return null;
  }
}
