# Postmortem: API usage limit stopped a PR review (2026-11-24)

**Status:** resolved · **Severity:** low (development workflow only, no user impact) · **Format:** blameless

## Summary

On 2026-11-24 at 18:30 UTC, the Anthropic API account behind this project hit its monthly spend limit. A reviewer agent that was partway through reviewing PR #18 (design pass 1) failed with `400 You have reached your specified API usage limits`, and the automated build loop stopped.

The app itself was not affected: it had made no Claude calls yet, and its own spend was $0.00. The cause was that the AI coding assistant driving the workflow was authenticated with the account's API key, not the owner's subscription. Every development session, and every reviewer agent it started, was billed per token to the same account the app uses.

Work resumed at 18:40 UTC, after switching the assistant to the subscription login. PR #18 was reviewed and merged at 18:41 UTC.

## Impact

- **Users:** none. The app wasn't deployed, and nothing it serves depends on the development workflow.
- **App budget:** unaffected. Spend was $0.00 of the $10 cap when the limit was hit.
- **Development:** the PR #18 review stopped midway, and the build loop was down for about 10 minutes.
- **Shared limit:** the account limit also covers the app's own key, so the app's Claude features (mood expansion, explainers) were unavailable until the limit reset. They fell back to keyword search and title cards. This is the designed fallback, not a crash.

## Timeline (UTC)

| Time | Event |
|---|---|
| 17:55 – 18:19 | Reviewer agents run on PRs #14, #16 and #17. Each is a separate long session billed to the API key. |
| 18:30:11 | PR #18 opened. |
| 18:30:23 | Reviewer agent started for PR #18. |
| 18:30:24 | **First failure.** The agent and the main session both get `400 … usage limits … regain access on 2026-12-01`. |
| 18:34:45 | Owner notices the stalled session ("what happened"). **Detected.** |
| 18:36:11 | Owner runs `/login`. The output warns that requests still use the API key until "Use custom API key" is turned off. |
| 18:38:57 | Cause identified: the session was billing through the API key. |
| 18:40:07 | Owner switches the assistant to the subscription login and confirms. **Mitigated.** |
| 18:41:07 | PR #18 reviewed in the main session (no subagent) and merged. **Resolved.** |

## Root cause

The AI coding assistant had saved the API key from an earlier setup step and preferred it over the subscription login. So the development workflow and the app shared one billing account and one spend limit.

The workflow was also expensive for that account. It ran long sessions, plus a separate reviewer agent per PR that re-read the codebase from scratch. Several reviews within half an hour used up the remaining monthly limit.

## What went well

- **The account's spend limit worked as intended.** It capped the loss instead of letting usage run on.
- **The app's $10 budget guard was never involved, and never needed to be.** It's per-app and independent of account limits.
- **Nothing was lost.** The PR branch, its commits and the test results were already pushed, so recovery meant re-running only the review step.

## What went wrong

- **No billing signal.** Nothing showed which credential the workflow was billing to. It surfaced only as a hard failure.
- **Billing assumption.** The owner thought the workflow was on the subscription.
- **Detection lag.** About 4 minutes passed before anyone noticed, and detection depended on the owner looking at the session.
- **Shared blast radius.** One account limit covered both development and the app.

## Action items

| Action | Status |
|---|---|
| Use the subscription login, not the API key, for the development workflow, and check with `/status` before long runs. | Done (18:40) |
| Review PRs in the main session instead of starting a reviewer agent per PR, which cuts usage substantially. | Done (loop prompt updated) |
| Make the app treat a usage-limit `400` as an account problem: fall back, mark the API as failing, and show "AI paused" in the budget pill (`isAccountProblem` in `src/lib/claude.ts`). | Done (#7, #10) |
| Give the development workflow and the app separate API keys (or workspaces) with their own limits, so one can't starve the other. | Open (owner) |
| Alert on account spend (a console usage alert, for example at 50% and 80% of the monthly limit) so a limit is never discovered by hitting it. | Open (owner) |
