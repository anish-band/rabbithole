import "server-only";
import fs from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { Paper } from "@/lib/arxiv/types";
import { BudgetExceededError, RateLimitedError } from "@/lib/budget";
import { CLAUDE_MODEL, ClaudeUnavailableError, callClaude, textOf } from "@/lib/claude";
import { GenerationSchema, MODEL_SCHEMA } from "./generation-schema";
import { sampleExplainer } from "./samples";
import type { Explainer } from "./schema";

/**
 * One Claude call per paper → explainer script + TL;DR + 3 key points.
 * Results are cached on disk forever (data/explainers/<id>.json), so each paper
 * costs once. Failures that would repeat (invalid output, refusal) are
 * remembered for a day so a bad paper can't drain the budget; budget, rate
 * limit and availability failures are not remembered.
 */
export const PROMPT_VERSION = 1;
const DIR = path.join(process.cwd(), "data", "explainers");
const RETRY_FAILED_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_TOKENS = 16_000;

export type Summary = { tldr: string; keyPoints: string[] };
export type FallbackReason = "budget" | "rate-limited" | "unavailable" | "failed";
export type ExplainerResult =
  | { status: "ready"; explainer: Explainer; summary?: Summary; source: "claude" | "sample" }
  | { status: "fallback"; reason: FallbackReason };

type CacheEntry = { id: string; model: string; promptVersion: number; createdAt: string; explainer: Explainer; summary: Summary };
type FailureEntry = { id: string; at: number; reason: string };

const safe = (id: string) => id.replace(/[^\w.-]/g, "_");
const okFile = (id: string) => path.join(DIR, `${safe(id)}.json`);
const failFile = (id: string) => path.join(DIR, `${safe(id)}.failed.json`);

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(data, null, 1));
  await fs.rename(`${file}.tmp`, file);
}

const SYSTEM = `You write short animated explainers for arXiv papers, in the style of 3Blue1Brown: a dark canvas, a few bright colours, one idea per scene, visuals that build the intuition rather than restate the text.

Canvas: 160 wide × 90 tall, origin top-left. Keep everything inside x 6–154, y 6–84. A good layout puts the diagram on the left (x 10–90) and short labels or one formula on the right (centred near x 123), or a single centred visual.

Elements (pick what fits, ≤ 14 per scene):
- text {x, y, text ≤ 30 chars, size sm|md|lg, color, align} — labels, never sentences.
- math {x, y, tex, size, color} — one KaTeX formula, centred at x,y. Keep it short.
- dots {points: [[x,y],…], r} — data, samples, nodes.
- path {points, smooth, closed} — curves, tours, trajectories, plotted functions (sample ≥ 20 points for curves).
- line {from, to, arrow, dashed} — edges, arrows, boundaries.
- circle / rect {…, fill} — regions, nodes, matrices.
- axes {x, y (origin, bottom-left), w, h, xLabel, yLabel} — draw plotted curves in the same coordinates.
- highlight {x, y, w, h} — call attention to a region.
Colours: blue, teal, green, yellow, red, white, muted. Use colour to carry meaning, consistently across scenes.

Animation: every element has enter {at ms from scene start, effect fade|draw|grow|rise, duration ms}. Use draw for lines/paths/outlines, rise for text, grow for points of focus. Stagger entrances so the eye follows the argument. Optional move {at, dx, dy, duration} and exitAt.

Script: 4–6 scenes, each 5000–9000 ms, caption 1–2 plain sentences (≤ 200 chars, may use $inline math$). Scene 1 sets up the problem, the middle scenes show the key mechanism or insight, the last shows the result. Repeat persistent elements (e.g. the same axes) in later scenes with a quick fade (at 0, duration 300).

Be faithful to the abstract: no invented numbers, datasets or claims. If the abstract is abstract, visualise the structure of the idea (inputs → mechanism → outcome) rather than fake data.

Also return a TL;DR (one plain-English sentence for a curious non-expert, ≤ 200 chars) and exactly 3 key points (each ≤ 160 chars).`;

function userPrompt(paper: Paper) {
  return `Title: ${paper.title}\nCategory: ${paper.primaryCategory}\nAuthors: ${paper.authors.slice(0, 6).join(", ")}\n\nAbstract:\n${paper.abstract}`;
}

function fallbackReason(err: unknown): FallbackReason {
  if (err instanceof BudgetExceededError) return "budget";
  if (err instanceof RateLimitedError || err instanceof Anthropic.RateLimitError) return "rate-limited";
  if (err instanceof ClaudeUnavailableError || err instanceof Anthropic.APIError) return "unavailable";
  return "failed";
}

async function generate(paper: Paper): Promise<ExplainerResult> {
  let message: Anthropic.Message;
  try {
    message = await callClaude("explainer", {
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt(paper) }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: MODEL_SCHEMA } },
    });
  } catch (err) {
    const reason = fallbackReason(err);
    console.warn(`[explainer] ${paper.id}: ${reason}:`, err instanceof Error ? err.message : err);
    return { status: "fallback", reason };
  }

  type Parsed = { data: ReturnType<typeof GenerationSchema.parse>; error?: undefined } | { error: string; data?: undefined };
  const parsed: Parsed = (() => {
    if (message.stop_reason !== "end_turn") return { error: `stop_reason ${message.stop_reason}` };
    try {
      const result = GenerationSchema.safeParse(JSON.parse(textOf(message)));
      return result.success ? { data: result.data } : { error: result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    } catch (err) {
      return { error: `invalid JSON: ${err instanceof Error ? err.message : err}` };
    }
  })();

  if (parsed.error !== undefined) {
    console.warn(`[explainer] ${paper.id}: rejected output: ${parsed.error}`);
    await writeJson(failFile(paper.id), { id: paper.id, at: Date.now(), reason: parsed.error } satisfies FailureEntry).catch(() => {});
    return { status: "fallback", reason: "failed" };
  }

  const { explainer, tldr, keyPoints } = parsed.data;
  const entry: CacheEntry = {
    id: paper.id,
    model: message.model ?? CLAUDE_MODEL,
    promptVersion: PROMPT_VERSION,
    createdAt: new Date().toISOString(),
    explainer,
    summary: { tldr, keyPoints },
  };
  await writeJson(okFile(paper.id), entry).catch((err) => console.warn("[explainer] cache write failed:", err));
  return { status: "ready", explainer, summary: entry.summary, source: "claude" };
}

const inFlight = new Map<string, Promise<ExplainerResult>>();

/** Cached explainer for a paper, generating it (once) if needed. */
export async function getExplainer(paper: Paper): Promise<ExplainerResult> {
  const sample = sampleExplainer(paper.id);
  if (sample) return { status: "ready", explainer: sample, source: "sample" };

  const cached = await readJson<CacheEntry>(okFile(paper.id));
  if (cached) return { status: "ready", explainer: cached.explainer, summary: cached.summary, source: "claude" };

  if (process.env.RABBITHOLE_FIXTURES === "1") return { status: "fallback", reason: "unavailable" };

  const failed = await readJson<FailureEntry>(failFile(paper.id));
  if (failed && Date.now() - failed.at < RETRY_FAILED_AFTER_MS) return { status: "fallback", reason: "failed" };

  const pending = inFlight.get(paper.id);
  if (pending) return pending;
  const request = generate(paper).finally(() => inFlight.delete(paper.id));
  inFlight.set(paper.id, request);
  return request;
}
