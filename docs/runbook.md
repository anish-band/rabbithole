# Runbook

What to do when something fires. Dashboard: CloudWatch → Dashboards → `rabbithole`. Logs: CloudWatch → Log groups → `/aws/lambda/rabbithole`. They're JSON lines; filter with `{ $.level = "error" }`.

**Health:** `curl <url>/api/health` returns this when healthy, and a 503 when the database is unreachable:

```json
{"ok":true,"database":"ok","claude":"off","spentUsd":1.72,"version":"<git sha>"}
```

## Alarms

| Alarm | Means | Do |
|---|---|---|
| `rabbithole-5xx` | ≥ 5 server errors in 5 min | Check `/api/health`. If the database is down, see the database section below. If it started after a deploy, roll back. Otherwise read the error logs. |
| `rabbithole-feed-p95` | Feed p95 latency > 5 s for 15 min | Usually arXiv is slow: compare `ArxivRequest` and `ArxivError` on the dashboard. Also check Lambda `Duration` and whether requests are being throttled. |
| `rabbithole-arxiv-errors` | ≥ 3 failed arXiv calls in 15 min | arXiv is down or rate limiting us. The app keeps serving cached results. Check https://status.arxiv.org. If we're rate limited, the shared throttle row may be broken: `select * from arxiv_throttle`. |
| `rabbithole-throttled` | Requests turned away at the concurrency cap | Either a traffic spike (fine: the cap is what keeps the cost at zero) or the kill switch fired (see below). |
| `rabbithole-claude-spend-80pct` | Ledger passed $8 of the $10 Claude cap | Production has Claude switched off, so this should never fire there. If it does, something is calling Claude: check `RABBITHOLE_CLAUDE` on the function and the `by_route` column in `spend`. |

## Deploys and rollback

- **App deploys:** CI does them on merge to `main`. It health-checks the new image and rolls back on its own if the check fails.
- **Manual rollback:**
  ```bash
  npm run deploy:rollback          # lists the 3 images ECR keeps, newest first
  npm run deploy:rollback -- <tag> # switches the function and checks health
  ```
- **Infrastructure:** CloudFormation rolls back a failed stack update automatically. To undo a successful change you regret, revert the commit and run `npm run deploy`.

## Kill switch fired

The AWS bill passed the $1 budget, so the function's reserved concurrency was set to 0. Every request now gets a 503 (throttled).

1. Find out what cost money: Billing → Cost Explorer, grouped by service.
2. Fix the cause. For example, lower `MaxConcurrency`, or deal with abusive traffic.
3. Turn the app back on:
   ```bash
   aws lambda put-function-concurrency --function-name rabbithole --reserved-concurrent-executions 3
   ```

## Database (Neon)

- **Unreachable:** `/api/health` returns 503. Check the Neon console. Free-tier projects suspend when idle and wake on the next connection, which adds about 1 s.
- **Rotate the password:** reset it in Neon, update `DATABASE_URL` in `.env.production.local`, and run `npm run deploy`.
- **Spend ledger:** `select * from spend; select * from reservations where expires_at > now();`

## Testing that alarms fire

```bash
aws cloudwatch set-alarm-state --alarm-name rabbithole-5xx --state-value ALARM --state-reason "test"
```

An email should arrive within a minute. The alarm goes back to OK on its next evaluation, about 5 minutes later.
