# Ranking eval

Measures how well a mood turns into a good first page of the feed, with numbers instead of eyeballing. The latest results are in [report.md](report.md).

```bash
npm run eval:rank            # free, offline, deterministic: prints the tables, writes report.md and results.json
npm run eval:rank -- --check # also fails if the production system dropped > 0.02 below baseline.json (runs in CI)
npm run eval:rank:build      # one-time, resumable setup (the only step that calls Claude; ~$0.03 total)
```

## What's frozen here

| File | What | How it was made |
|---|---|---|
| `pool.json` | 322 papers | Every paper in the cached arXiv responses (`data/arxiv/`). No new arXiv traffic. |
| `moods.json` | 30 moods | Hand-written to span the pool's topics at different levels of vagueness. |
| `plans.json` | Each mood's Claude query plan and its keyword fallback | `expandMood()` (Haiku, through `callClaude()`), the same code the feed uses |
| `labels.json` | Relevance judgments: 2 = clearly fits, 1 = related, unjudged = 0 | A Haiku judge over each mood's pooled candidates (the union of every system's top 30) |
| `baseline.json` | The production system's P@8 and nDCG@10 | `--update-baseline` |

## Systems

- **claude plan → rank** (production): the Claude plan's searches, emulated over the pool (every keyword must appear, any listed category matches), then ranked with the production weights.
- **keyword fallback → rank**: what the feed does without Claude, which is to search the mood's own words.
- **rank whole pool**: no retrieval step. Embeddings rank all 322 papers. This is a ceiling for the ranking stage alone.

## Metrics

- **P@8**: share of the first page (8 papers) that clearly fits the mood. It's strict on purpose, because the judge is generous with "related".
- **nDCG@10**: graded ranking quality, where clearly relevant papers count more than related ones.
- **Coverage@10**: of the primary categories that hold a clearly relevant paper, the share that shows up in the top 10.
- **Retrieval recall**: share of the judged-relevant papers that the searches retrieve at all.
- **Judged@10**: share of the top 10 that has a label. Unjudged papers count as irrelevant, so a low value would mean the numbers are pessimistic.

## Caveats (read before quoting numbers)

- **Silver labels.** The labels come from an LLM judge, not people. A spot check found the "clearly" grade trustworthy and the "related" grade noisier, which is why P@8 counts only "clearly".
- **Small pool, so pessimistic retrieval.** In this 322-paper pool, a 3–4-keyword AND search often matches nothing, while live arXiv, with millions of papers, usually returns 25. Retrieval recall is therefore a lower bound, and moods that score 0 here may do fine live.
- **Biased pool.** The pool came from the searches of four real moods ("weird physics", "practical llm agents", "black holes", "cars"), so those four plans retrieve unusually well.
- **No taste signals.** Likes and dislikes aren't simulated, so the sweep only covers recency and diversity.
