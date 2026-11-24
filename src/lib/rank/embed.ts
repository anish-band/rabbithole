import "server-only";
import fs from "fs/promises";
import path from "path";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { Paper } from "@/lib/arxiv/types";

/**
 * Local sentence embeddings (all-MiniLM-L6-v2, 384-d, quantised) run in the
 * Node server: no API calls, no budget. The model downloads once (~23 MB) into
 * data/models/. Paper embeddings are cached on disk per arXiv id under
 * data/embeddings/, so each paper is embedded once.
 */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const DIMS = 384;
const DATA = path.join(process.cwd(), "data");
const CACHE_DIR = path.join(DATA, "embeddings", "minilm-l6-v2");
const BATCH = 16;
const QUERY_CACHE_LIMIT = 200;

type GlobalEmbed = {
  __embedPipeline?: Promise<FeatureExtractionPipeline>;
  __queryCache?: Map<string, Float32Array>;
};
const g = globalThis as GlobalEmbed;

function extractor(): Promise<FeatureExtractionPipeline> {
  g.__embedPipeline ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = path.join(DATA, "models");
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

async function readCached(id: string): Promise<Float32Array | undefined> {
  try {
    const buf = await fs.readFile(cacheFile(id));
    if (buf.byteLength !== DIMS * 4) return undefined;
    return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch {
    return undefined;
  }
}

async function writeCached(id: string, vec: Float32Array) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFile(id);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
  await fs.rename(tmp, file);
}

/** Embeddings for papers, from the disk cache where possible. */
export async function embedPapers(papers: Pick<Paper, "id" | "title" | "abstract">[]): Promise<Map<string, Float32Array>> {
  const result = new Map<string, Float32Array>();
  const cached = await Promise.all(papers.map((p) => readCached(p.id)));
  const queued = new Set<string>();
  const missing = papers.filter((p, i) => {
    if (cached[i]) result.set(p.id, cached[i]!);
    if (cached[i] || queued.has(p.id)) return false;
    queued.add(p.id);
    return true;
  });
  if (missing.length) {
    const vecs = await embedTexts(missing.map(paperText));
    await Promise.all(
      missing.map(async (p, i) => {
        result.set(p.id, vecs[i]);
        await writeCached(p.id, vecs[i]).catch(() => {}); // cache is best-effort
      }),
    );
  }
  return result;
}

/** Cached embeddings only (for taste vectors from ids the client sends). */
export async function cachedEmbeddings(ids: string[]): Promise<Float32Array[]> {
  const vecs = await Promise.all(ids.map(readCached));
  return vecs.filter((v): v is Float32Array => v !== undefined);
}
