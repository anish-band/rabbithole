# Explainer faithfulness eval

Checks whether everything an explainer tells the reader traces back to the paper's abstract, which is the only source the generator sees.

```bash
npm run eval:faithfulness -- --run v1               # judge a frozen run (cached verdicts are free)
npm run eval:faithfulness -- --compare v1,v2        # compare two runs on the papers they share
npm run eval:faithfulness -- --snapshot <label>     # freeze the explainers currently in data/explainers/
npm run eval:faithfulness -- --regenerate a,b --snapshot <label>   # regenerate ≤ 5 with the current prompt, then freeze them
```

## How it works

1. **Claims.** Each explainer is split into what a reader sees: the TL;DR, the 3 key points, every caption, and each scene's on-screen text, labels and formulas (one line per scene).
2. **Judge.** Claude Haiku (through `callClaude()`) labels each claim against the abstract:
   - **supported**
   - **unsupported:** it adds numbers, datasets, comparisons, mechanisms or results that the abstract doesn't state, or contradicts it
   - **framing:** an analogy, a definition or a bare label, which isn't counted
3. **Metric.** The **unsupported-claim rate** is unsupported / (supported + unsupported).

Runs are frozen in `runs/`, and verdicts are cached in `judgments.json` (keyed by the claims, the abstract and the judge version), so a re-run costs nothing. `spend.json` tracks this task's cumulative Claude spend, which the script caps at $1.00.

## Results

**Baseline (prompt v1, 12 explainers): 4.8% unsupported (7 of 147 factual claims).** Full details in [report-v1.md](report-v1.md).

| Claim kind | Unsupported |
|---|---|
| TL;DR | 0% (0/12) |
| Key points | 0% (0/36) |
| Captions | 4.8% (3/62) |
| On-screen labels | 10.8% (4/37) |

All of the problems were in the animation, never in the summary. They fell into three patterns:
- **Invented examples and formulas.** A sample user intent "Prioritize video", and a weighted-objective formula the abstract never gives.
- **Misattributed results.** An ensemble credited with a single model's result, and numbers from different settings combined on one label.
- **Mechanisms explained further than the abstract goes.**

**Prompt change (v2).** Four faithfulness rules were added to the generation prompt in `src/lib/explainer/generate.ts` (`PROMPT_VERSION` 2):
- tie each result to its own setting
- only use formulas the abstract states
- no invented examples
- no mechanism beyond the abstract

**Measured on the same 4 papers ([compare-v1-v2.md](compare-v1-v2.md)): 11.3% → 2.0% unsupported (6 → 1).** On-screen labels went from 23.5% to 0%. The remaining case is a caption that dropped the abstract's "partly because" hedge.

## Caveats

- **Small and selected sample.** The before/after uses the 4 papers that had problems under v1, so part of the drop is regression to the mean, since generation is random. A fifth regeneration (2611.31184) returned invalid JSON (a stray brace) and was not retried, because of the ≤ 5 regeneration limit. Treat the result as a strong signal, not a precise rate.
- **Silver labels.** The judge is an LLM. Its verdicts read as strict and specific (see the reasons in the reports), but they haven't been checked against human judgments.
- **The abstract is the only reference.** A claim that's true of the full paper but not stated in the abstract counts as unsupported. That's intended, because the abstract is all the generator sees.
