# Rabbithole — build plan

> A full-screen feed of arXiv papers you can just scroll through. Tell it your mood ("weird physics", "practical LLM agents") and it changes the feed.
> Each screen = one paper: **animated explainer on the left**, **abstract + key info on the right**.

## Product spec

### The feed
- Full-screen desktop web app. One paper fills the viewport; scroll-snap between papers.
- Navigation: **↑/↓ arrow keys**, `j`/`k`, mouse wheel / trackpad, and swipe on touch. Scrolling must feel instant (prefetch the next 2 papers).
- Top bar (floating, frosted glass): app name, **mood bar** ("I'm in the mood for…"), remaining-budget pill (from `/api/budget`).

### One paper screen (split layout)
- **Left (~55%) — Explainer panel:** a short 3Blue1Brown-style animation that explains the paper's core idea (see "Explainers"). Play/pause, replay, progress dots. Captions under the animation.
- **Right (~45%) — Info panel:** title, authors, date, arXiv categories as chips, **TL;DR** (one plain-English sentence), **3 key points**, full abstract (collapsible), links (arXiv page, PDF), and actions: ♥ like, bookmark save, "not interested".
- Below ~900px wide, stack the panels vertically (explainer on top).

### Recommendations ("mood")
1. Mood text → Claude turns it into 2–4 arXiv search queries + category codes (JSON, structured output). Cache by normalized mood string.
2. Fetch candidates from the arXiv API (`http://export.arxiv.org/api/query`). **Respect arXiv: max 1 request / 3 s**, cache responses in `data/arxiv/`.
3. Rank candidates with **local embeddings** (`@huggingface/transformers`, `Xenova/all-MiniLM-L6-v2`, run server-side, embeddings cached in `data/embeddings/`): similarity to the mood + similarity to the user's taste vector (built from liked papers) − penalty for skipped / "not interested" ones. Add some randomness so the feed doesn't get stale.
4. No mood set → a default feed of recent papers in the categories the user likes most, or a mixed popular-categories default (cs.AI, cs.LG, physics, math, q-bio).
- Likes, saves, skips and history are stored **on-device** (localStorage) and sent to the feed API with each request. No accounts.

### Explainers (the left panel)
- Claude writes an **animation script as JSON** (structured output) for each paper: 4–6 scenes, each with narration caption + a list of visual elements (text, LaTeX-ish equation, shapes, arrows, axes/graphs, highlight boxes) and simple timeline animations (fade/draw/move/transform).
- Our own player renders the script with SVG + CSS/JS animations (look up how to do this nicely; KaTeX for math is fine). Dark canvas, 3Blue1Brown feel: dark background, a few accent colors, smooth easing.
- Generate **lazily, only for the current paper and the next one**, never in bulk. Cache per arXiv ID in `data/explainers/<id>.json` so each paper costs once.
- The same call also produces the TL;DR and the 3 key points (one call per paper, not three).
- Fallback when there's no key / budget is used up / generation fails: an animated title card (title, key terms from the abstract, category glyph). The app must stay usable without any Claude calls.
- Keep the player's input format stable (`src/lib/explainer/schema.ts`) so GLM/alphaXiv videos can be swapped in later as a `{ type: "video", url }` variant.

### Design
- Apple-clean first (YouTube Shorts only for the scrolling interaction): system font stack (`-apple-system, "SF Pro Display", Inter, …`), generous white space, 12–24px radii, solid surfaces, hairline borders, subtle shadows, spring-like 200–300ms motion. Light + dark mode (follow the system).
- **No gradients of any kind**, no neon, no decorative glows/blobs. One accent color. Frosted `backdrop-blur` only on floating bars.
- No clutter: one primary action per area. Icons from `lucide-react`.
- Follow the design skills in `.claude/skills/` (see CLAUDE.md).

## Hard rules (for every agent/loop iteration)
- **All Claude calls go through `callClaude()` in `src/lib/claude.ts`.** Never create another Anthropic client. That wrapper enforces the **$10 hard cap** (`BUDGET_USD`) and the per-minute rate limit. Never raise `BUDGET_USD`, never delete `data/spend.json`, never edit `.env.local`.
- Handle `BudgetExceededError` / `RateLimitedError` gracefully (fallback UI, never a crash).
- Don't spend budget on testing: at most a handful of real Claude calls per task. Prefer cached outputs and fixtures.
- Read `node_modules/next/dist/docs/` before using Next.js APIs (Next 16 — see AGENTS.md).
- Git workflow is in CLAUDE.md: issue → branch → small Conventional Commits → PR (`Closes #n`) → reviewer subagent → fixes → merge commit → pull `main`. No AI co-author/attribution anywhere. Check the task's box (in a `docs:` commit on the same branch) before merging.
- If blocked on a task, write why under "Blocked" at the bottom and move to the next one.

## Tasks
- [x] Scaffold Next.js 16 + Tailwind + TypeScript
- [x] Budget guard + rate limit (`src/lib/budget.ts`, `src/lib/claude.ts`, `GET /api/budget`)
- [x] **#1** arXiv client: search + fetch by ID, Atom XML parsing, 3 s throttle, disk cache (`src/lib/arxiv.ts`) + a small script to smoke test it
- [x] **#2** Feed shell: full-screen scroll-snap feed with mock papers; arrow keys / j,k / wheel / swipe navigation; prefetching
- [x] **#3** Paper screen layout: split view, info panel (title, authors, chips, abstract, links, like/save/not-interested), responsive stack
- [x] **#4** Design pass 1: Apple/YouTube look — top bar with frosted glass, typography, light/dark, transitions
- [x] **#5** On-device taste store (localStorage): likes, saves, skips, history; saved-papers drawer
- [x] **#6** Local embeddings + ranking (`src/lib/rank/`) with disk cache
- [x] **#7** Mood bar → Claude query expansion (structured output, cached) → `/api/feed` returns ranked real papers; default feed without mood
- [x] **#8** Explainer schema + SVG animation player with a hand-written sample script (no Claude yet)
- [x] **#9** Explainer generation via Claude (one call → script + TL;DR + key points), lazy for current/next paper, disk cache, fallback title card
- [x] **#10** Budget pill in the top bar + graceful "budget used up" state
- [x] **#11** Design pass 2: polish animations, loading skeletons, empty/error states, keyboard shortcut hint overlay (`?`)
- [x] **#12** Final check: fresh `npm run build`, click through the app in the browser, write `README.md` (setup, env vars, how the budget works)
- [x] **#15** Render LaTeX math in titles and abstracts (KaTeX `<MathText>`, text-mode macros, unit + e2e tests)

## v2 tasks (milestone `v2`, in the loop)
Evals and infra. Work them in this order. Each task's GitHub issue is the spec, so read it first.

- [x] **#21** CI in GitHub Actions: lint, unit, build and e2e on every PR and push to `main`, with caching, failure artifacts, one retry in CI only, and the check required by branch protection. To prove the check blocks merges, open a deliberately broken PR, then close it without merging. Don't delete its branch.
- [x] **#28** Postmortem for the 2026-11-24 API usage-limit outage (`docs/postmortems/`).
- [x] **#22** Offline relevance eval for mood expansion and ranking (`npm run eval:rank`), using a frozen candidate pool from cached arXiv data with no live arXiv calls. **Claude spend cap for this task: $0.25.** Use Haiku for query plans and any judge labels, and cache every call.
- [ ] **#23** Explainer faithfulness eval (`npm run eval:faithfulness`), run on already-cached explainers. **Claude spend cap for this task: $1.00.** Use a cheap judge model through `callClaude()`. Measure the prompt change by regenerating only a few explainers (≤ 5).
- [ ] **#27** Load test `POST /api/feed` with `RABBITHOLE_FIXTURES=1` (never send load to arXiv), fix the first bottleneck, and report before/after numbers.
- [ ] **#26** Background worker queue for explainer generation. It runs locally: an in-process or file-backed queue under `data/`, with no SQS and no Postgres. Jobs are idempotent, retry with backoff, failures go to a dead-letter queue, and the worker is budget-aware. Add a test showing that killing the worker mid-job loses no work and causes no duplicate spend.

Out of the loop (these need the owner's decision): #24 Postgres ledger + caches, #25 AWS deploy + monitoring. If a task above seems to need either of them, take the local alternative and note it in the PR.

## Blocked
(none yet)
