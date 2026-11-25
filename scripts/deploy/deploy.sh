#!/usr/bin/env bash
# Deploy Rabbithole to AWS (see docs/deploy.md). Run from the repo root:
#   npm run deploy
#
# Reads DATABASE_URL (Neon) and ALERT_EMAIL from .env.production.local (gitignored)
# or the environment. Steps: migrate + seed the database, create/update the
# registry stack, build and push the arm64 image (tagged with the git sha),
# create/update the app stack, then check /api/health on the public URL.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ -f .env.production.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.production.local
  set +a
fi
: "${DATABASE_URL:?set DATABASE_URL (Neon) in .env.production.local}"
: "${ALERT_EMAIL:?set ALERT_EMAIL in .env.production.local}"
REGION="${AWS_REGION:-$(aws configure get region)}"
REGION="${REGION:-us-east-1}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

# The image build needs a few GB; a full disk took Docker down once.
FREE_GB=$(df -g . | awk 'NR==2 {print $4}')
if (( FREE_GB < 5 )); then
  echo "Only ${FREE_GB} GB free; free up space before building (docker builder prune -af)." >&2
  exit 1
fi

TAG="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has uncommitted changes; the image is tagged $TAG but won't match it exactly." >&2
fi

echo "==> Database: migrate and seed (spend carries over into an empty ledger only)"
DATABASE_URL="$DATABASE_URL" npm run --silent db:seed

echo "==> Registry stack"
aws cloudformation deploy --stack-name rabbithole-registry --template-file infra/registry.yaml --no-fail-on-empty-changeset
REPO=$(aws cloudformation describe-stacks --stack-name rabbithole-registry --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" --output text)

echo "==> Image $REPO:$TAG"
test -d data/models || npm run --silent model:fetch
# --provenance=false: Lambda needs a plain image manifest, not an attestation index.
docker build --platform linux/arm64 --provenance=false --build-arg VERSION="$TAG" -t "$REPO:$TAG" .
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
docker push "$REPO:$TAG"

echo "==> App stack"
OIDC=true
if aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text | grep -q token.actions.githubusercontent.com; then
  # Ours (from an earlier deploy of this stack) or pre-existing: only create it if absent.
  if ! aws cloudformation describe-stack-resource --stack-name rabbithole --logical-resource-id GitHubOidcProvider >/dev/null 2>&1; then OIDC=false; fi
fi
aws cloudformation deploy --stack-name rabbithole --template-file infra/app.yaml \
  --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "ImageUri=$REPO:$TAG" "DatabaseUrl=$DATABASE_URL" "AlertEmail=$ALERT_EMAIL" "CreateGitHubOidcProvider=$OIDC"

out() { aws cloudformation describe-stacks --stack-name rabbithole --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
URL=$(out Url)

echo "==> Health check (first request is a cold start)"
for i in 1 2 3 4 5; do
  if curl -fsS --max-time 30 "${URL%/}/api/health"; then echo; break; fi
  [[ $i == 5 ]] && { echo "health check failed; see docs/runbook.md" >&2; exit 1; }
  sleep 5
done

docker builder prune -f >/dev/null || true
echo
echo "URL:        $URL"
echo "Dashboard:  $(out Dashboard)"
echo "Deploy role (set as the AWS_DEPLOY_ROLE_ARN repo variable for CI deploys): $(out DeployRoleArn)"
