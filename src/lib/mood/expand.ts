import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { callClaude, textOf } from "@/lib/claude";
import { cleanCategories, cleanKeywords, fallbackPlan, normalizeMood, type MoodPlan } from "./query";

/**
 * Mood → arXiv search plan. One small Haiku call per distinct mood, cached on
 * disk forever (data/moods/), so repeating a mood is free. Any failure (no key,
 * budget used up, rate limit, account usage limit, bad output) falls back to
 * searching the mood's own words; fallbacks are not cached so a later request
 * can still get the better plan.
 */
const CACHE_DIR = path.join(process.cwd(), "data", "moods");
const MODEL = "claude-haiku-5-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "queries", "categories"],
  properties: {
    label: { type: "string", description: "2-4 word title for the mood, e.g. 'Weird physics'." },
    queries: {
      type: "array",
      description: "2-4 alternative searches; each is 1-4 plain keywords (no operators) that appear in matching paper abstracts.",
      items: { type: "array", items: { type: "string" } },
    },
    categories: {
      type: "array",
      description: "0-5 arXiv category codes that fit, e.g. cs.LG, hep-th, q-bio.NC. Empty if the mood spans many fields.",
      items: { type: "string" },
    },
  },
} as const;

const SYSTEM = `You turn a reader's mood into arXiv searches. The reader wants to scroll interesting recent papers.
Return varied, concrete searches: technical terms authors actually use, not the reader's casual words.
Prefer specific phrases split into keywords (e.g. ["mixture", "experts"]) over generic ones (["machine", "learning"]).`;

const cacheFile = (mood: string) => path.join(CACHE_DIR, `${crypto.createHash("sha1").update(mood).digest("hex")}.json`);

async function readCache(mood: string): Promise<MoodPlan | undefined> {
  try {
    return JSON.parse(await fs.readFile(cacheFile(mood), "utf8")) as MoodPlan;
  } catch {
    return undefined;
  }
}

async function writeCache(mood: string, plan: MoodPlan) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFile(mood);
  await fs.writeFile(`${file}.tmp`, JSON.stringify({ mood, ...plan }, null, 2));
  await fs.rename(`${file}.tmp`, file);
}

/** Validate and sanitise the model's JSON. Throws if nothing usable is left. */
export function planFromModel(raw: unknown, mood: string): MoodPlan {
  const data = raw as { label?: unknown; queries?: unknown; categories?: unknown };
  const queries = Array.isArray(data.queries) ? data.queries : [];
  const keywords = queries
    .map((q) => cleanKeywords((Array.isArray(q) ? q : [q]).map(String), 4))
    .filter((k) => k.length > 0)
    .slice(0, 4);
  if (keywords.length === 0) throw new Error("no usable queries");
  const categories = cleanCategories(Array.isArray(data.categories) ? data.categories.map(String) : []);
  const label = typeof data.label === "string" && data.label.trim() ? data.label.trim().slice(0, 40) : mood.slice(0, 40);
  return { label, keywords, categories, source: "claude" };
}

const inFlight = new Map<string, Promise<MoodPlan>>();

export async function expandMood(rawMood: string): Promise<MoodPlan> {
  const mood = normalizeMood(rawMood);
  if (!mood) return fallbackPlan("");
  if (process.env.RABBITHOLE_FIXTURES === "1") return fallbackPlan(mood);

  const cached = await readCache(mood);
  if (cached) return cached;

  const pending = inFlight.get(mood);
  if (pending) return pending;

  const request = (async () => {
    try {
      const message = await callClaude("mood-expand", {
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: `Mood: ${JSON.stringify(mood)}` }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      });
      const plan = planFromModel(JSON.parse(textOf(message)), mood);
      await writeCache(mood, plan).catch(() => {});
      return plan;
    } catch (err) {
      console.warn(`[mood] falling back for "${mood}":`, err instanceof Error ? err.message : err);
      return fallbackPlan(mood);
    } finally {
      inFlight.delete(mood);
    }
  })();
  inFlight.set(mood, request);
  return request;
}
