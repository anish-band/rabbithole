/**
 * Pure helpers for the explainer faithfulness eval (scripts/eval/faithfulness.ts):
 * split a generated explainer into checkable claims, and summarise a judge's
 * verdicts into an unsupported-claim rate.
 */

export type ClaimKind = "tldr" | "key point" | "caption" | "on-screen";
export type Claim = { kind: ClaimKind; scene?: number; text: string };
export type Verdict = "supported" | "unsupported" | "framing";
export type Judged = Claim & { verdict: Verdict; reason: string };

/** The parts of a cached explainer the eval reads. */
export type ExplainerSnapshot = {
  id: string;
  title: string;
  abstract: string;
  summary: { tldr: string; keyPoints: string[] };
  scenes: { caption: string; labels: string[] }[];
};

type SceneElement = { kind: string; text?: string; tex?: string; xLabel?: string; yLabel?: string };

/** Visible words and formulas on one scene's stage (labels, axis titles, math). */
export function sceneLabels(elements: SceneElement[]): string[] {
  const out: string[] = [];
  for (const el of elements) {
    if (el.kind === "text" && el.text) out.push(el.text);
    if (el.kind === "math" && el.tex) out.push(`$${el.tex}$`);
    if (el.kind === "axes") for (const l of [el.xLabel, el.yLabel]) if (l) out.push(`axis: ${l}`);
  }
  return out;
}

/** Every statement a reader sees: TL;DR, key points, captions, and each scene's on-screen text as one claim. */
export function extractClaims(s: ExplainerSnapshot): Claim[] {
  const claims: Claim[] = [{ kind: "tldr", text: s.summary.tldr }];
  for (const k of s.summary.keyPoints) claims.push({ kind: "key point", text: k });
  s.scenes.forEach((scene, i) => {
    claims.push({ kind: "caption", scene: i + 1, text: scene.caption });
    if (scene.labels.length) claims.push({ kind: "on-screen", scene: i + 1, text: scene.labels.join(" · ") });
  });
  return claims.filter((c) => c.text.trim());
}

export type Rates = { claims: number; checked: number; unsupported: number; rate: number };

/** Unsupported share of the factual claims (framing — analogies, setup — is not counted). */
export function rates(judged: Judged[]): Rates {
  const checked = judged.filter((j) => j.verdict !== "framing");
  const unsupported = checked.filter((j) => j.verdict === "unsupported").length;
  return { claims: judged.length, checked: checked.length, unsupported, rate: checked.length ? unsupported / checked.length : 0 };
}

export function ratesByKind(judged: Judged[]): Record<ClaimKind, Rates> {
  const kinds: ClaimKind[] = ["tldr", "key point", "caption", "on-screen"];
  return Object.fromEntries(kinds.map((k) => [k, rates(judged.filter((j) => j.kind === k))])) as Record<ClaimKind, Rates>;
}
