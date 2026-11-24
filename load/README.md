# Load test: `POST /api/feed`

How the feed endpoint holds up under concurrent load, what broke first, and the fix.

## How it was run

No traffic goes to arXiv or Claude. The app runs offline, serving the ranking eval's frozen pool of 322 real papers, 50 candidates a round like live arXiv:

```bash
npm run build
RABBITHOLE_FIXTURES=1 RABBITHOLE_FIXTURES_POOL=eval/rank/pool.json npx next start -p 3300
npm run load:feed -- <label>     # autocannon, 10 s per cell; writes load/results-<label>.json
```

There are four scenarios, each at 1, 10 and 50 concurrent connections:

| Scenario | Body |
|---|---|
| default feed | `{}` |
| mood | `{ mood: "black holes" }` (mood embedding cached after the first request) |
| mood + taste | the same, plus 25 liked or saved, 30 skipped, 5 hidden and 80 seen ids |
| new mood each time | a mood the server has never seen, so the embedding model runs on every request |

Everything ran on one MacBook (Apple silicon, `next start`, one Node process) with other apps open (load average about 4–6). Compare runs with each other, not with production hardware.

## Before

Throughput was flat at about 70–85 req/s whatever the concurrency, and latency grew linearly with it:

| Scenario | c | req/s | p50 | p97.5 | p99 |
|---|---|---|---|---|---|
| default feed | 1 | 83 | 11 ms | 12 ms | 13 ms |
| default feed | 50 | 82 | 589 ms | 917 ms | 1564 ms |
| mood + taste | 50 | 67 | 706 ms | 1341 ms | 2007 ms |
| new mood each time | 50 | 76 | 634 ms | 1140 ms | 1765 ms |

Flat throughput with linearly growing latency means each request spent about 12 ms of synchronous CPU on the single event loop, and everything else queued behind it. Timing the parts of a request:

| Part (50 candidates) | Time |
|---|---|
| `rank()` | **10.1 ms** |
| embeddings from the disk cache (50 reads) | 0.9 ms |
| embed a new mood (model) | 0.8 ms |
| `rememberPapers` (8 writes) | 0.8 ms |

**The bottleneck was the MMR diversity pass in `rank()`.** On every placement it recomputed each head candidate's similarity to every paper already placed: about 50k 384-d dot products, plus array allocations, per request.

## Fix 1: incremental MMR (`perf(rank)`)

Each candidate now keeps its similarity to the closest placed paper, updated once per placement: n² dot products in total, about 20× fewer. The ordering is exactly the same:
- A unit test checks it against the old algorithm on 20 randomised trials.
- The ranking eval output is byte-identical.

## Fix 2: `rememberPapers` race (#50)

The server log showed **22,590 `ENOENT` warnings** in one run. Concurrent requests serving the same paper wrote the same `data/papers/<id>.json.tmp`, and one rename stole the other's file. Each write now uses its own temp name, and papers this process has already stored are skipped. After the fix: 0 warnings and 0 orphaned temp files.

## After

| Scenario | c | req/s | p50 | p97.5 | p99 |
|---|---|---|---|---|---|
| default feed | 1 | 441 | 2 ms | 2 ms | 3 ms |
| default feed | 10 | 467 | 21 ms | 24 ms | 25 ms |
| default feed | 50 | 427 | 115 ms | 132 ms | 141 ms |
| mood | 50 | 425 | 115 ms | 133 ms | 138 ms |
| mood + taste | 50 | 204 | 238 ms | 279 ms | 555 ms |
| new mood each time | 50 | 316 | 154 ms | 177 ms | 197 ms |

**Throughput is up 5.2× (82 → 427 req/s) and p99 at 50 connections is down 11× (1564 → 141 ms) for the default feed.** With taste signals, throughput is up 3× (67 → 204 req/s). Full numbers are in `results-before.json`, `results-after.json` (MMR fix only) and `results-after-race-fix.json`.

## What's next

The endpoint is still CPU-bound on one event loop, at about 2 ms per request without taste and about 4 ms with it. The next costs are:
- reading the taste profile's embeddings from disk on every request (55 small files). An in-memory LRU would remove that.
- the dislike term (max similarity over 35 vectors per candidate)

Beyond that, scale out: more Node processes, or a worker for ranking. Live, the real limit is arXiv itself (1 request per 3 s, mitigated by the disk cache), not this endpoint.
