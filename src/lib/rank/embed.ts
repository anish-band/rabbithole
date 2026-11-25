import "server-only";
import fs from "fs/promises";
import path from "path";
import { db, hasDatabase } from "@/lib/db/client";
import { dataDir } from "@/lib/db/docs";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { Paper } from "@/lib/arxiv/types";

/**
 * Local sentence embeddings (all-MiniLM-L6-v2, 384-d, quantised) run in the
 * Node server: no API calls, no budget. The model downloads once (~23 MB) into
 * data/models/. Paper embeddings are cached per arXiv id (in Postgres when
 * DATABASE_URL is set, shared by every instance; otherwise on disk under
 * data/embeddings/), with a bounded in-memory layer on top, so each paper is
 * embedded once.
 */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const DIMS = 384;
// The model can ship read-only inside an image (RABBITHOLE_MODELS_DIR); the
// embedding cache needs a writable data dir (RABBITHOLE_DATA_DIR, e.g. /tmp).
const MODELS_DIR = process.env.RABBITHOLE_MODELS_DIR ?? path.join(process.cwd(), "data", "models");
const CACHE_DIR = dataDir("embeddings", "minilm-l6-v2");
const BATCH = 16;
/** Bounded in-process layer over the cache: ~1.5 KB per vector, so ~7.5 MB. */
const MEMORY_LIMIT = 5000;
const MODEL_KEY = "minilm-l6-v2";
const QUERY_CACHE_LIMIT = 200;

type GlobalEmbed = {
  __embedPipeline?: Promise<FeatureExtractionPipeline>;
  __queryCache?: Map<string, Float32Array>;
  __paperVecs?: Map<string, Float32Array>;
};
const g = globalThis as GlobalEmbed;

function extractor(): Promise<FeatureExtractionPipeline> {
  g.__embedPipeline ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = MODELS_DIR;
    return pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
  })().catch((err) => {
    g.__embedPipeline = undefined; // allow a retry after a failed download
    throw err;
  });
  return g.__embedPipeline;
}

/** Embed texts; each result is L2-normalised so dot product = cosine similarity. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const fe = await extractor();
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const tensor = await fe(texts.slice(i, i + BATCH), { pooling: "mean", normalize: true });
    const data = tensor.data as Float32Array;
    for (let j = 0; j * DIMS < data.length; j++) out.push(data.slice(j * DIMS, (j + 1) * DIMS));
  }
  return out;
}

/** Embed a short query (e.g. a mood), memoised in-process. */
export async function embedQuery(text: string): Promise<Float32Array> {
  const key = text.trim().toLowerCase().replace(/\s+/g, " ");
  const cache = (g.__queryCache ??= new Map());
  const hit = cache.get(key);
  if (hit) return hit;
  const [vec] = await embedTexts([key]);
  if (cache.size >= QUERY_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, vec);
  return vec;
}

export const paperText = (p: Pick<Paper, "title" | "abstract">) =>
  `${p.title}. ${p.abstract}`.replace(/\s+/g, " ").trim();

/** Safe file name for an arXiv id (old-style ids contain a slash). */
const cacheFile = (id: string) => path.join(CACHE_DIR, `${id.replace(/[^\w.-]/g, "_")}.f32`);

async function readFile(id: string): Promise<Float32Array | undefined> {
  try {
    const buf = await fs.readFile(cacheFile(id));
    if (buf.byteLength !== DIMS * 4) return undefined;
    return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch {
    return undefined;
  }
}

async function writeFile(id: string, vec: Float32Array) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFile(id);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
  await fs.rename(tmp, file);
}

const toVec = (buf: Uint8Array) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

function remember(id: string, vec: Float32Array) {
  const mem = (g.__paperVecs ??= new Map());
  if (mem.size >= MEMORY_LIMIT) mem.delete(mem.keys().next().value!);
  mem.set(id, vec);
}

/** Cached vectors by id: memory, then Postgres (one query) or files. */
async function readCachedMany(ids: string[]): Promise<Map<string, Float32Array>> {
  const out = new Map<string, Float32Array>();
  const mem = (g.__paperVecs ??= new Map());
  const rest = [...new Set(ids)].filter((id) => {
    const hit = mem.get(id);
    if (hit) out.set(id, hit);
    return !hit;
  });
  if (rest.length === 0) return out;
  if (hasDatabase()) {
    try {
      const rows = await db()<{ id: string; vec: Uint8Array }[]>`select id, vec from embeddings where model = ${MODEL_KEY} and id = any(${rest})`;
      for (const r of rows) {
        if (r.vec.byteLength !== DIMS * 4) continue;
        const vec = toVec(r.vec);
        out.set(r.id, vec);
        remember(r.id, vec);
      }
    } catch (err) {
      console.warn("[embed] cache read failed:", err instanceof Error ? err.message : err);
    }
    return out;
  }
  const vecs = await Promise.all(rest.map(readFile));
  rest.forEach((id, i) => {
    if (vecs[i]) {
      out.set(id, vecs[i]!);
      remember(id, vecs[i]!);
    }
  });
  return out;
}

async function writeCachedMany(entries: [string, Float32Array][]) {
  for (const [id, vec] of entries) remember(id, vec);
  if (hasDatabase()) {
    const rows = entries.map(([id, vec]) => ({ model: MODEL_KEY, id, vec: Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength) }));
    await db()`insert into embeddings ${db()(rows, "model", "id", "vec")} on conflict do nothing`;
    return;
  }
  await Promise.all(entries.map(([id, vec]) => writeFile(id, vec)));
}

/** Embeddings for papers, from the cache where possible. */
export async function embedPapers(papers: Pick<Paper, "id" | "title" | "abstract">[]): Promise<Map<string, Float32Array>> {
  const result = await readCachedMany(papers.map((p) => p.id));
  const queued = new Set<string>();
  const missing = papers.filter((p) => {
    if (result.has(p.id) || queued.has(p.id)) return false;
    queued.add(p.id);
    return true;
  });
  if (missing.length) {
    const vecs = await embedTexts(missing.map(paperText));
    missing.forEach((p, i) => result.set(p.id, vecs[i]));
    await writeCachedMany(missing.map((p, i) => [p.id, vecs[i]])).catch((err) =>
      console.warn("[embed] cache write failed:", err instanceof Error ? err.message : err),
    ); // best-effort
  }
  return result;
}

/** Cached embeddings only (for taste vectors from ids the client sends). */
export async function cachedEmbeddings(ids: string[]): Promise<Float32Array[]> {
  const found = await readCachedMany(ids);
  return ids.map((id) => found.get(id)).filter((v): v is Float32Array => v !== undefined);
}
