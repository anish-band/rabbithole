import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { actualUsd, estimateTokens, noteApiResult, record, reserve, worstCaseUsd } from "./budget";

/**
 * The ONLY place the app talks to Claude. Every call goes through the $10
 * budget guard and the per-minute rate limit in ./budget.ts.
 * Never construct `new Anthropic()` anywhere else.
 */

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

/** Thrown when no API key is configured; callers fall back like for budget errors. */
export class ClaudeUnavailableError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "ClaudeUnavailableError";
  }
}

// Created on first use so the app (and its fallbacks) still work without a key.
let client: Anthropic | undefined;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new ClaudeUnavailableError();
  return (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY from .env.local
}

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model"> & { model?: string };

export async function callClaude(route: string, params: CreateParams): Promise<Anthropic.Message> {
  const model = params.model ?? CLAUDE_MODEL;
  const anthropic = getClient();
  const inputEstimate = estimateTokens(JSON.stringify({ system: params.system, messages: params.messages, tools: params.tools }));
  const release = reserve(worstCaseUsd(model, inputEstimate, params.max_tokens));

  try {
    const response = await anthropic.messages.create({ ...params, model });
    record(route, actualUsd(model, response.usage));
    noteApiResult(true);
    return response;
  } catch (err) {
    // Account-level trouble (usage limit, auth, overload, outage), not our own bad requests.
    if (err instanceof Anthropic.APIError && isAccountProblem(err)) noteApiResult(false);
    throw err;
  } finally {
    release();
  }
}

function isAccountProblem(err: InstanceType<typeof Anthropic.APIError>) {
  const status = err.status as number | undefined;
  return status === undefined || status === 401 || status === 403 || status === 429 || status >= 500 || /usage limit|credit balance/i.test(err.message);
}

/** Convenience: first text block of a response, or "". */
export function textOf(message: Anthropic.Message) {
  for (const block of message.content) if (block.type === "text") return block.text;
  return "";
}
