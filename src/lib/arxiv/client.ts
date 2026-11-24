import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { parseAtomFeed } from "./parse";
import type { Paper, SearchOptions, SearchResult } from "./types";

/**
 * arXiv API client. Server-side only (uses the filesystem).
 *
 * - Throttled to at most one request every 3 seconds (arXiv's published limit),
 *   shared by every caller in this process.
 * - Responses are cached on disk in data/arxiv/. Search results expire after
 *   SEARCH_TTL_MS; lookups by ID never expire.
 */

const API_URL = "https://export.arxiv.org/api/query";
const MIN_INTERVAL_MS = 3_000;
const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), "data", "arxiv");
const USER_AGENT = "rabbithole/0.1 (personal arXiv reader)";

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Run fn after the previous request finished and at least 3 s have passed since it started. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined); // a failed request must not block the queue
  return run;
}

async function readCache(key: string, ttlMs: number | null): Promise<string | null> {
  const file = path.join(CACHE_DIR, `${key}.xml`);
  try {
    if (ttlMs !== null) {
      const { mtimeMs } = await fs.stat(file);
      if (Date.now() - mtimeMs > ttlMs) return null;
    }
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function writeCache(key: string, xml: string) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${key}.xml`);
  await fs.writeFile(`${file}.tmp`, xml);
  await fs.rename(`${file}.tmp`, file);
}

async function fetchFeed(params: URLSearchParams, ttlMs: number | null): Promise<SearchResult> {
  const url = `${API_URL}?${params.toString()}`;
  const key = crypto.createHash("sha1").update(url).digest("hex");

  const cached = await readCache(key, ttlMs);
  if (cached) return parseAtomFeed(cached);

  const xml = await throttled(async () => {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`arXiv API returned ${res.status} ${res.statusText}`);
    return res.text();
  });

  const result = parseAtomFeed(xml); // validate before caching
  await writeCache(key, xml);
  return result;
}

/** Search arXiv. See https://info.arxiv.org/help/api/user-manual.html for query syntax. */
export function searchPapers({
  query,
  start = 0,
  maxResults = 20,
  sortBy = "relevance",
  sortOrder = "descending",
}: SearchOptions): Promise<SearchResult> {
  const params = new URLSearchParams({
    search_query: query,
    start: String(start),
    max_results: String(Math.min(maxResults, 100)),
    sortBy,
    sortOrder,
  });
  return fetchFeed(params, SEARCH_TTL_MS);
}

/** Fetch papers by arXiv ID (version suffix optional). Missing IDs are skipped. */
export async function getPapersByIds(ids: string[]): Promise<Paper[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)].sort();
  const params = new URLSearchParams({ id_list: unique.join(","), max_results: String(unique.length) });
  const { papers } = await fetchFeed(params, null);
  return papers;
}

export async function getPaper(id: string): Promise<Paper | null> {
  const [paper] = await getPapersByIds([id]);
  return paper ?? null;
}
