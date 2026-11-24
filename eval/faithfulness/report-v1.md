# Faithfulness: v1

12 explainers, prompt v1. Judge: claude-haiku-5-5 (judge v1).

| Run | Factual claims | Unsupported | Unsupported rate |
|---|---|---|---|
| v1 | 147 | 7 | 4.8% |

| Claim kind | v1 rate |
|---|---|
| tldr | 0.0% (0/12) |
| key point | 0.0% (0/36) |
| caption | 4.8% (3/62) |
| on-screen | 10.8% (4/37) |

## Per paper

| Paper | Unsupported rate |
|---|---|
| Precision-Aware Learning Rate Transfer Across Block Count in LLM Post- | 0.0% (0/12) |
| EEG Decoding in Context: A Framework for Tuning-Free EEG Foundation Mo | 0.0% (0/11) |
| Polynomial mixing for 2D Ising with plus boundary conditions | 0.0% (0/14) |
| On-Policy Codec Distillation for Efficient All-in-One Video Generation | 10.0% (1/10) |
| CO-GRAFT: Attributing Reinforcement Learning Gains in Search Agents vi | 0.0% (0/12) |
| Know When to Abstain: Conformal Confidence Estimation for Text-to-SQL | 7.1% (1/14) |
| Matching Under Metric Privacy | 0.0% (0/11) |
| CTLink: A Text-Prompted Segmentation Model for Linking Radiology Repor | 16.7% (2/12) |
| Agentic AI for Intent Management and Control in Autonomous Communicati | 15.4% (2/13) |
| Self-Supervised Dataset Distillation via Mutual Information Maximizati | 7.1% (1/14) |
| Language Models Steer on Injected Uncertainty Tokens, but Fail to Self | 0.0% (0/15) |
| Let Vision-Language Models Generate Images through Their Representatio | 0.0% (0/9) |

## Unsupported claims

- `2611.31184` caption 2: “Most of these condition tokens repeat the same spatiotemporal content from frame to frame.” — Abstract says conditions carry redundant spatiotemporal information but does not specify they repeat frame to frame.
- `2611.31190` on-screen 5: “22.6% · no abstain · 9.1% · 52.4% accepted · 15% budget · AUARC 89.5 vs 81.2 · (vs logit baseline) · BIRD AUROC 0.72 · guarantee not transferred” — The abstract gives AUARC 89.5 vs 81.2 only for Spider with Olmo-3-32B as generator, not the 0.899 headline comparison line; the on-screen line mixes these with an unlabeled 'vs logit baseline' framing. The line juxtaposes figures from different settings without stating that, which misleads about the comparison.
- `2611.31222` caption 5: “A seven-model ensemble led all 48 teams in the MICCAI challenge and matched radiologist agreement. Diffuse findings remain hard.” — Abstract does not say the seven-model ensemble matched radiologist agreement; the inter-rater comparison is for CTLink on 50 scans without specifying the ensemble.
- `2611.31222` on-screen 5: “#1 of 48 teams · hit 0.782, instance F1 0.386 · ≥ inter-radiologist agreement · Limit: diffuse findings” — Abstract does not attribute the inter-radiologist agreement result to the seven-model ensemble; only the hit rate and F1 rank are tied to it.
- `2611.31223` on-screen 1: “"Prioritize video" · radio control · gap” — The example intent "Prioritize video" is not in the abstract, which only mentions differentiated connectivity.
- `2611.31223` on-screen 3: “"Prioritize video" · Language model · $\max_{\pi}\; \sum_k w_k\, f_k(\pi)$” — The weighted multi-objective formula and the "Prioritize video" example are not in the abstract.
- `2611.31225` caption 4: “Mutual information also rewards spreading samples across all prototypes, avoiding the trivial case where everything collapses onto a few.” — The abstract says MIPA avoids trivial solutions via an explicit constraint; it does not say MI itself rewards spreading samples across prototypes.
