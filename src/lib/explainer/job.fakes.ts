/** Fake job dependencies for tests: no network, spend and results kept as files under `dir`. */
import fs from "node:fs";
import path from "node:path";
import type { JobDeps } from "./job";

export const CALL_USD = 0.02;
export type Spend = { calls: number; usd: number };

export function readSpend(dir: string): Spend {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "spend.json"), "utf8")) as Spend;
  } catch {
    return { calls: 0, usd: 0 };
  }
}

export const savedFile = (dir: string, id: string) => path.join(dir, `saved-${id}.json`);

export function fakeDeps(dir: string): JobDeps<{ tldr: string }> {
  return {
    isDone: async (id) => fs.existsSync(savedFile(dir, id)),
    canAfford: () => true,
    call: async (id) => {
      const spend = readSpend(dir);
      fs.writeFileSync(path.join(dir, "spend.json"), JSON.stringify({ calls: spend.calls + 1, usd: spend.usd + CALL_USD }));
      return { text: JSON.stringify({ tldr: `about ${id}` }), model: "fake", stopReason: "end_turn" };
    },
    classify: () => "failed",
    interpret: (reply) => {
      try {
        return { data: JSON.parse(reply.text) as { tldr: string } };
      } catch {
        return { error: "invalid JSON" };
      }
    },
    save: async (id, data) => fs.writeFileSync(savedFile(dir, id), JSON.stringify(data)),
  };
}
