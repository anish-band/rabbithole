import "server-only";
import crypto from "crypto";
import { db, hasDatabase } from "@/lib/db/client";
import { dataDir, docs } from "@/lib/db/docs";
import { claimSlot } from "@/lib/db/throttle";
import { parseAtomFeed } from "./parse";
import type { Paper, SearchOptions, SearchResult } from "./types";

/**
 * arXiv API client. Server-side only (uses the filesystem).
 *
 * - Throttled to at most one request every 3 seconds (arXiv's published limit),
 *   shared by every caller in this process (state lives on globalThis so dev
 *   HMR and separately bundled routes share one queue) and, with a database,
 *   by every instance (a shared slot in Postgres).
 * - Responses are cached (Postgres, or on disk in data/arxiv/). Search results expire after
 *   SEARCH_TTL_MS; lookups by ID never expire. Empty results are never cached.
 * - Identical concurrent requests share one in-flight fetch.
 */

const API_URL = "https://export.arxiv.org/api/query";
const MIN_INTERVAL_MS = 3_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
const cache = docs<string>("arxiv_cache", { dir: dataDir("arxiv"), name: (key) => `${key}.xml`, raw: true });
const USER_AGENT = "rabbithole/0.1 (personal arXiv reader)";

type ThrottleState = {
  queue: Promise<unknown>;
  lastRequestAt: number;
  inFlight: Map<string, Promise<SearchResult>>;
};

const globalForArxiv = globalThis as typeof globalThis & { __arxivThrottle?: ThrottleState };
const state = (globalForArxiv.__arxivThrottle ??= {
  queue: Promise.resolve(),
  lastRequestAt: 0,
  inFlight: new Map(),
});

/** Run fn after the previous request finished and at least 3 s have passed since it started. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    const wait = hasDatabase() ? await sharedWait() : state.lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    state.lastRequestAt = Date.now();
    return fn();
  });
  state.queue = run.catch(() => undefined); // a failed request must not block the queue
  return run;
}

/** Wait for this request's slot in the cross-instance schedule; local spacing if the database is unreachable. */
async function sharedWait() {
  try {
    return await claimSlot(db(), MIN_INTERVAL_MS);
  } catch (err) {
    console.warn("[arxiv] shared throttle unavailable, spacing locally:", err instanceof Error ? err.message : err);
    return state.lastRequestAt + MIN_INTERVAL_MS - Date.now();
  }
}

async function readCache(key: string, ttlMs: number | null): Promise<string | null> {
  try {
    const hit = await cache.get(key);
    if (!hit || (ttlMs !== null && Date.now() - hit.updatedAt > ttlMs)) return null;
    return hit.value;
  } catch {
    return null;
  }
}

/** Failures are logged, never thrown: the data was fetched fine. */
async function writeCache(key: string, xml: string) {
  try {
    await cache.put(key, xml);
  } catch (err) {
    console.warn("[arxiv] cache write failed:", err instanceof Error ? err.message : err);
  }
}

async function fetchFromNetwork(url: string, key: string): Promise<SearchResult> {
  const xml = await throttled(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) {
      // arXiv reports bad queries as an Atom error entry; surface its message if present.
      try {
        parseAtomFeed(body);
      } catch (err) {
        throw err instanceof Error && err.message.startsWith("arXiv API error") ? err : new Error(`arXiv API returned ${res.status}`);
      }
      throw new Error(`arXiv API returned ${res.status} ${res.statusText}`);
    }
    return body;
  });

  const result = parseAtomFeed(xml); // validate before caching
  // arXiv occasionally returns a spurious empty feed; never cache that.
  if (result.papers.length > 0) await writeCache(key, xml);
  return result;
}

async function fetchFeed(params: URLSearchParams, ttlMs: number | null): Promise<SearchResult> {
  const url = `${API_URL}?${params.toString()}`;
  const key = crypto.createHash("sha1").update(url).digest("hex");

  const cached = await readCache(key, ttlMs);
  if (cached) return parseAtomFeed(cached);

  const pending = state.inFlight.get(key);
  if (pending) return pending;

  const request = fetchFromNetwork(url, key).finally(() => state.inFlight.delete(key));
  state.inFlight.set(key, request);
  return request;
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
