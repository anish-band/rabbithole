@AGENTS.md

# Rabbithole

A full-screen arXiv feed with mood-based recommendations. Each screen shows an animated explainer next to the paper's abstract. The spec and task list are in `PLAN.md`; read it first on every iteration.

## Budget and external APIs
- Every Claude API call must go through `callClaude()` in `src/lib/claude.ts`, which enforces the $10 cap (`BUDGET_USD`) and the rate limit. Never bypass it, raise the cap, edit `.env.local`, or delete `data/spend.json`.
- Throttle arXiv API requests to at most one every 3 seconds, and cache responses on disk under `data/`.

## Engineering workflow (treat this like a real team project)
- **GitHub:** repo `anish-band/rabbithole` (public). Run every `gh` command as `env -u GITHUB_TOKEN -u GH_TOKEN gh ...`: the env token can push but cannot manage issues or PRs, and the owner chose the keychain login for those. Plain `git push` is fine.
- **One GitHub issue per task.** Issue numbers match the `#n` tasks in `PLAN.md` (milestone `v1`). Work happens on a branch named `<type>/<issue#>-<slug>` (e.g. `feat/3-arxiv-client`), never directly on `main`.
- **Conventional Commits** for every commit: `feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `test:`, `chore:`, `perf:`, with an optional scope, e.g. `feat(feed): add arrow-key navigation`. Make several small, focused commits per branch, not one big commit.
- **Author:** commits use the repo's git config identity (the owner) only. Never add `Co-Authored-By` trailers, "Generated with Claude" lines, or any AI attribution to commits, PR titles, or PR bodies.
- **Pull request per issue:** conventional-commit-style title, a body with Summary, Changes, How to test, and `Closes #<issue>`. Before opening the PR, `npm run lint` and `npm run build` must pass.
- **Review before merge:** a reviewer subagent reviews the PR diff (UI work: against the design skills below) and its findings are posted as a PR comment. Fix real findings in follow-up commits on the same branch and push. Then merge with a merge commit (`gh pr merge --merge --delete-branch`), switch back to `main`, and pull.
- **Tests:** `npm run test:e2e` (Playwright, local Chrome) must pass for any UI change; add tests for new behavior.
- If something is out of scope or broken, open a new issue for it instead of expanding the current PR.
- Never force-push to `main`, never rewrite published history.

## Design rules
- Apple-clean: system font stack (SF Pro on Apple devices), generous whitespace, a restrained neutral palette with **one** accent color, hairline borders, soft shadows, 12–24px radii, spring-like motion, full light and dark mode.
- **No gradients** anywhere: no gradient backgrounds, text, borders, or glows. No glassmorphism-with-gradients, no neon, no decorative blobs. Flat solid surfaces; a frosted `backdrop-blur` on floating bars is fine.
- Use the project skills in `.claude/skills/`: `apple-design`, `better-ui`, `better-layout`, `better-typography`, `better-colors`, `better-accessibility`, `animate`, `choreograph`, `animation-performance`, `tailwind-v4`, `vercel-react-best-practices`. For reviews use `interface-review`, `better-interface`, `review-animations`, `web-design-guidelines`. Where a skill suggests gradients, these rules win.
- Respect `prefers-reduced-motion`. Every control is keyboard-reachable with a visible focus ring.
