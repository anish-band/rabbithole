# Rabbithole

A full-screen feed of new arXiv papers, one per screen. Each screen pairs an animated explainer (left) with the abstract and a plain-English summary (right). Tell it your mood ("weird physics", "practical LLM agents") and the feed re-ranks around it. Likes, saves and history stay on your device.

- **Feed:** scroll-snap paging by touch, wheel, trackpad or keyboard. Papers stream in from arXiv as you go.
- **Mood:** Claude Haiku turns your mood into arXiv queries; papers are ranked locally with sentence embeddings.
- **Taste:** likes, saves, "not interested" and dwell time nudge the ranking. Everything is in `localStorage`, nothing is sent anywhere except as ranking signals for the next page.
- **Explainers:** one Claude call per paper writes a short scene script (shapes, curves, labels, formulas) and a TL;DR with three key points. The script plays as a CSS-animated SVG, in the spirit of 3Blue1Brown. Explainers are generated only for the paper on screen and the next one, then cached forever.
- **Budget:** a hard $10 cap on Claude spend, shown in the top bar. Past it, everything still works with free fallbacks.

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

The app works without an API key: moods search arXiv by keyword and explainers become animated title cards. On first run, the embedding model (~23 MB, `Xenova/all-MiniLM-L6-v2`) downloads into `data/models/`.

### Environment variables (`.env.local`)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables mood expansion and explainer generation. Without it the app uses fallbacks. |
| `BUDGET_USD` | `10` | Hard cap on total Claude spend. Calls that could cross it are refused. |
| `CLAUDE_RATE_LIMIT_PER_MIN` | `20` | Max Claude calls per minute across the app. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for explainers. Mood expansion always uses `claude-haiku-5-5`. |
| `RABBITHOLE_FIXTURES` | — | Set to `1` for a fully offline app: fixture papers, no arXiv, no Claude. |

## How the budget works

Every Claude call goes through `callClaude()` in `src/lib/claude.ts`, the only place the app talks to the API.

1. **Reserve the worst case.** Before sending, the call reserves its maximum possible cost: estimated input plus the full `max_tokens` of output, at the model's price. If `spent + reserved + this call` would pass `BUDGET_USD`, the call is refused with `BudgetExceededError` and never sent. Concurrent calls can't overshoot.
2. **Record the real cost.** After the response, the reservation is released and the actual cost from `response.usage` goes into the ledger at `data/spend.json`.
3. **Rate limit.** More than `CLAUDE_RATE_LIMIT_PER_MIN` calls in a minute throws `RateLimitedError`.
4. **Fail soft.** Every caller handles these errors, a missing key, and API failures (including an account usage limit) with a fallback instead of an error screen:
   - mood → keyword search
   - explainer → animated title card

   Nothing is cached on these failures, so a later request can retry.
5. **Show it.** The pill in the top bar reads `GET /api/budget`. Its states are:
   - "$X left"
   - "Budget used up" (below $0.35, the worst case of one explainer call)
   - "Busy · Ns" (rate-limited)
   - "AI paused" (the API is failing)
   - "AI off" (no key)

Costs are small in practice. An explainer is about $0.07 and 20 s on Opus 5.5 at low effort; a mood expansion is under $0.001. Each paper and each mood is paid for once, then served from `data/explainers/` and `data/moods/`.

To start over, delete `data/spend.json`. As a backstop, also set a monthly limit in the Anthropic Console.

## Using it

| Keys | Action |
|---|---|
| `↓` `J` `Space` / `↑` `K` `Shift Space` | Next / previous paper |
| `Home` / `End` | First / last paper |
| `L` `S` `X` | Like, save, not interested |
| `/` | Set a mood (`Esc` cancels) |
| `?` | All shortcuts |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Node test runner) |
| `npm run test:e2e` | Playwright end-to-end tests on local Chrome, desktop and reduced-motion. The feed, explainer and budget APIs are mocked, so no budget is spent. |
| `npm run smoke:arxiv` | Live arXiv client check (throttled, cached) |
| `npm run smoke:rank` | Embeds and ranks the fixture papers for a few moods (no arXiv, no Claude) |
| `npm run fixtures` | Regenerates `src/fixtures/papers.json` from arXiv |

## How it fits together

```
src/
  app/api/feed         POST: one ranked page for {mood, taste signals, exclude}
  app/api/explainer    GET ?id=: cached or freshly generated explainer + summary
  app/api/budget       GET: spend, remaining, rate limit, API health
  lib/arxiv            Atom client: 1 request / 3 s, responses cached in data/arxiv
  lib/mood             mood → keyword groups + categories (Haiku, cached)
  lib/rank             local embeddings + scoring (mood, taste, recency, diversity)
  lib/explainer        scene schema (zod), generation, title-card fallback
  lib/taste            on-device likes / saves / history store
  lib/budget.ts        the spend ledger, reservations and rate limit
  lib/claude.ts        callClaude(): the only Anthropic client
  components/          feed, paper screen, explainer player, top bar
```

Runtime data lives in `data/` (gitignored): arXiv responses, embeddings, the model, mood plans, explainers, served papers and the spend ledger.

## Design

Apple-clean: the system font stack, generous whitespace, a neutral palette with one blue accent, hairline borders, soft shadows and spring motion. Full light and dark mode. No gradients anywhere. Every control is keyboard-reachable with a visible focus ring, and `prefers-reduced-motion` swaps movement for fades.
