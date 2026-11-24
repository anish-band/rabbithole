import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { actualUsd, estimateTokens, record, reserve, worstCaseUsd } from "./budget";

/**
 * The ONLY place the app talks to Claude. Every call goes through the $10
 * budget guard and the per-minute rate limit in ./budget.ts.
 * Never construct `new Anthropic()` anywhere else.
 */

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from .env.local

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model"> & { model?: string };

export async function callClaude(route: string, params: CreateParams): Promise<Anthropic.Message> {
  const model = params.model ?? CLAUDE_MODEL;
  const inputEstimate = estimateTokens(JSON.stringify({ system: params.system, messages: params.messages, tools: params.tools }));
  const release = reserve(worstCaseUsd(model, inputEstimate, params.max_tokens));

  try {
    const response = await client.messages.create({ ...params, model });
    record(route, actualUsd(model, response.usage));
    return response;
  } finally {
    release();
  }
}

/** Convenience: first text block of a response, or "". */
export function textOf(message: Anthropic.Message) {
  for (const block of message.content) if (block.type === "text") return block.text;
  return "";
}
