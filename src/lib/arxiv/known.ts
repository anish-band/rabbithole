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

export async function rememberPapers(papers: Paper[]) {
  await fs.mkdir(DIR, { recursive: true });
  await Promise.all(
    papers.map(async (p) => {
      const target = file(p.id);
      await fs.writeFile(`${target}.tmp`, JSON.stringify(p));
      await fs.rename(`${target}.tmp`, target);
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
