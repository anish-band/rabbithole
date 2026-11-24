# Faithfulness: v1 vs v2

Same 4 papers. Prompt v1 vs v2. Judge: claude-haiku-5-5 (judge v1).

| Run | Factual claims | Unsupported | Unsupported rate |
|---|---|---|---|
| v1 | 53 | 6 | 11.3% |
| v2 | 51 | 1 | 2.0% |

| Claim kind | v1 rate | v2 rate |
|---|---|---|
| tldr | 0.0% (0/4) | 0.0% (0/4) |
| key point | 0.0% (0/12) | 0.0% (0/12) |
| caption | 10.0% (2/20) | 4.5% (1/22) |
| on-screen | 23.5% (4/17) | 0.0% (0/13) |

## Unsupported claims in v2

- `2611.31222` caption 6: “On 50 scans segmented by two radiologists, CTLink matched or exceeded their agreement. Diffuse findings remain hard, as even radiologists outline them inconsistently.” — Abstract says radiologists' outlines of diffuse findings are inconsistent, not that radiologists were shown as 'outlining them inconsistently' as a reason beyond partly; the 'partly because' qualifier is dropped, making the causal framing stronger than stated.
