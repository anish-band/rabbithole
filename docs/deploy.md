# Deploying to AWS

Rabbithole runs on AWS for about **$0 a month**: a single Lambda function and a free database.

```
browser ──HTTPS──▶ Lambda function URL ──▶ Lambda (arm64 container: Next.js + Lambda Web Adapter)
                                              ├──▶ Neon Postgres (free tier): spend ledger, caches, arXiv throttle
                                              ├──▶ arXiv API (≤ 1 request / 3 s across all instances)
                                              └──▶ CloudWatch Logs ─▶ metrics, alarms, dashboard ─▶ SNS email
AWS Budget ($1/month) ──exceeded──▶ SNS ──▶ kill-switch Lambda ──▶ app concurrency = 0
```

- **No Claude in production.** The deploy sets `RABBITHOLE_CLAUDE=off`. It serves the explainers already cached in the database, and moods use keyword search. Strangers can't spend the Claude budget, and no Anthropic key is stored in AWS.
- **State lives in Postgres.** That covers the spend ledger, cached explainers, mood plans, served papers, the arXiv cache and the shared arXiv throttle (#24). Lambda's own disk is only `/tmp`, used for embedding caches.
- **Cold starts.** The first request after a quiet spell takes about 4 s while the embedding model loads. After that, requests take about 0.1 s.

## What it costs

| Item | Free allowance | Our use | Cost |
|---|---|---|---|
| Lambda | 1M requests + 400k GB-s / month, always free | 1.5 GB × short requests; capped at 3 concurrent | $0 |
| Function URL | included with Lambda | public HTTPS endpoint | $0 |
| ECR (image storage) | 500 MB for 12 months on older accounts | 3 images × ~100 MB compressed | ~$0.03 |
| CloudWatch | 10 custom metrics, 10 alarms, 3 dashboards, 5 GB logs | 8 metrics, 5 alarms, 1 dashboard, 7-day log retention | $0 |
| SNS | 1,000 emails | alerts only | $0 |
| AWS Budgets | 2 budgets | 1 | $0 |
| Neon Postgres | 0.5 GB, always free | < 5 MB | $0 |

**Guardrails:**
- **Concurrency cap:** reserved concurrency of 3 caps how much any traffic spike can run up.
- **Budget alerts:** an email when the forecast passes 80% of $1.
- **Kill switch:** when actual spend passes $1, the app's concurrency is set to 0. AWS updates budget data a few times a day, so this can lag by hours. The concurrency cap is the real limit.

## First deploy (by hand)

**Prerequisites:**
- AWS CLI v2 logged in to the account. A version from 2023 or later is recommended: the scripts work around missing commands in older ones.
- Docker running, with at least 5 GB free on disk.
- A Neon project.

1. Create `.env.production.local` (gitignored):
   ```
   DATABASE_URL=postgres://…neon.tech/…?sslmode=require
   ALERT_EMAIL=you@example.com
   ```
2. Run `npm run deploy`. It:
   1. migrates and seeds Neon (cached explainers, papers and moods; existing spend only goes into an empty ledger)
   2. creates the ECR registry stack
   3. builds and pushes the image, tagged with the git sha
   4. creates the app stack
   5. checks `/api/health`

   It prints the public URL, the dashboard link and the deploy role ARN.
3. Confirm the subscription email from AWS SNS. Alarms and budget alerts go there.
4. **CI deploys:** add a repository variable `AWS_DEPLOY_ROLE_ARN` set to the printed role ARN (Settings → Secrets and variables → Actions → Variables). From then on, every green CI run on `main` deploys through GitHub OIDC. No AWS keys are stored in GitHub.

After that:
- **App changes** deploy automatically on merge.
- **Infrastructure changes** (`infra/*.yaml`) deploy with `npm run deploy`.

## Tear down

Delete the `rabbithole` stack, then `rabbithole-registry`. The registry stack only deletes once its images are removed. The Neon project is separate.
